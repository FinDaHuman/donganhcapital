"""
Payment router for DongAnh Capital.

Endpoints:
  - POST /api/payments/create-order   — Create a payment order (returns VietQR)
  - POST /api/payments/webhook        — SePay webhook (payment confirmation)
  - GET  /api/payments/check/{code}   — Check payment status (frontend polling)
  - GET  /api/payments/history        — User's payment history

Security:
  - Order creation requires authentication
  - Webhook verifies SePay signature (HMAC/API key)
  - Payment status check requires authentication
  - Rate limiting on order creation
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks
from pydantic import BaseModel, Field, field_validator

from db.connection import get_engine
from sqlalchemy import text

from routers.auth import get_current_user
from utils.mailer import send_purchase_confirmation_email
from utils.sepay import (
    get_price, generate_order_code, get_payment_details,
    verify_webhook_signature, extract_order_code_from_description,
    get_subscription_duration_days, calculate_upgrade_proration,
    ORDER_EXPIRY_SECONDS,
)
from utils.security import check_auth_rate_limit, get_client_ip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/payments", tags=["payments"])


# ── Request/Response Models ──
class CreateOrderRequest(BaseModel):
    plan: str = Field(..., description="'pro' or 'premium'")
    period: str = Field(..., description="'monthly' or 'yearly'")

    @field_validator("plan")
    @classmethod
    def validate_plan(cls, v):
        if v not in ("pro", "premium"):
            raise ValueError("Plan must be 'pro' or 'premium'")
        return v

    @field_validator("period")
    @classmethod
    def validate_period(cls, v):
        if v not in ("monthly", "yearly"):
            raise ValueError("Period must be 'monthly' or 'yearly'")
        return v


# ══════════════════════════════════════
#   ORDER CREATION
# ══════════════════════════════════════

@router.post("/create-order")
async def create_order(
    body: CreateOrderRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Create a pending payment order and return VietQR payment details.

    Upgrade rules (Stripe-style proration):
    - Tier upgrade (e.g. Pro → Premium): allowed mid-cycle with proration credit.
    - Period upgrade (Monthly → Yearly, same tier): allowed mid-cycle with proration credit.
    - Period downgrade (Yearly → Monthly): blocked while subscription is active.
    - Tier downgrade: blocked always.
    - Same tier + same period while active: blocked (renew after expiry).
    """
    client_ip = get_client_ip(request)
    if not check_auth_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests")

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_id = str(user["id"])
    current_tier = user.get("subscription_tier", "free")
    expires_at = user.get("subscription_expires_at")
    now_utc = datetime.now(timezone.utc)
    is_sub_active = bool(expires_at and expires_at > now_utc)

    # ── Resolve current billing period from last completed payment ──
    current_period = "monthly"
    with engine.connect() as conn:
        last_payment = conn.execute(
            text("""
                SELECT period FROM payments
                WHERE user_id = :uid AND status = 'completed'
                ORDER BY completed_at DESC
                LIMIT 1
            """),
            {"uid": user_id},
        ).mappings().first()
    if last_payment:
        current_period = last_payment["period"]

    # ── Guard: validate upgrade direction ──
    tier_rank = {"free": 0, "pro": 1, "premium": 2}
    period_rank = {"monthly": 0, "yearly": 1}

    plan_tier = tier_rank.get(body.plan, 0)
    curr_tier = tier_rank.get(current_tier, 0)
    plan_period = period_rank.get(body.period, 0)
    curr_period = period_rank.get(current_period, 0)

    is_tier_upgrade = plan_tier > curr_tier
    is_tier_same = plan_tier == curr_tier
    is_tier_downgrade = plan_tier < curr_tier
    is_period_upgrade = plan_period > curr_period
    is_period_downgrade = plan_period < curr_period

    if is_tier_downgrade:
        raise HTTPException(
            status_code=400,
            detail="Cannot downgrade to a lower tier. Your current subscription remains active until it expires.",
        )

    if is_sub_active:
        if is_period_downgrade:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"You are on a yearly plan active until {expires_at.strftime('%d/%m/%Y')}. "
                    "Switching to a monthly cycle is not allowed while it is active."
                ),
            )
        if is_tier_same and not is_period_upgrade:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"You already have an active {current_tier.title()} {current_period} subscription "
                    f"until {expires_at.strftime('%d/%m/%Y')}. Renew after it expires."
                ),
            )

    # ── Return existing pending order to prevent duplicates ──
    with engine.connect() as conn:
        existing = conn.execute(
            text("""
                SELECT id, order_code, amount, plan, period, expires_at, credit_amount
                FROM payments
                WHERE user_id = :uid AND status = 'pending'
                  AND expires_at > NOW()
                ORDER BY created_at DESC
                LIMIT 1
            """),
            {"uid": user_id},
        ).mappings().first()

        if existing:
            existing = dict(existing)
            credit_amount = existing.get("credit_amount", 0)
            full_price = get_price(existing["plan"], existing["period"])
            # Recalculate days_remaining so the checkout proration breakdown stays accurate
            days_remaining = 0
            if credit_amount > 0 and is_sub_active and expires_at:
                days_remaining = max(0, int((expires_at - now_utc).total_seconds() / 86400))
            return {
                "order_code": existing["order_code"],
                "amount": existing["amount"],
                "plan": existing["plan"],
                "period": existing["period"],
                "payment": get_payment_details(existing["amount"], existing["order_code"]),
                "expires_at": existing["expires_at"].isoformat(),
                "credit_amount": credit_amount,
                "full_price": full_price,
                "days_remaining": days_remaining,
                "status": "pending",
                "message": "You have an existing pending order.",
            }

    # ── Proration: calculate what the user actually pays ──
    proration = calculate_upgrade_proration(
        current_tier=current_tier,
        current_period=current_period,
        current_expires_at=expires_at if is_sub_active else None,
        new_plan=body.plan,
        new_period=body.period,
    )
    amount = proration["prorated_price"]
    credit_amount = proration["credit_amount"]

    # ── Create new order ──
    order_code = generate_order_code(user_id)
    order_expires_at = now_utc + timedelta(seconds=ORDER_EXPIRY_SECONDS)

    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO payments
                    (user_id, order_code, amount, plan, period, status,
                     expires_at, description, credit_amount)
                VALUES
                    (:uid, :code, :amount, :plan, :period, 'pending',
                     :expires, :desc, :credit)
            """),
            {
                "uid": user_id,
                "code": order_code,
                "amount": amount,
                "plan": body.plan,
                "period": body.period,
                "expires": order_expires_at,
                "desc": f"DongAnh Capital {body.plan.title()} - {body.period.title()}",
                "credit": credit_amount,
            },
        )

    return {
        "order_code": order_code,
        "amount": amount,
        "plan": body.plan,
        "period": body.period,
        "payment": get_payment_details(amount, order_code),
        "expires_at": order_expires_at.isoformat(),
        "credit_amount": credit_amount,
        "full_price": proration["full_price"],
        "days_remaining": proration["days_remaining"],
        "status": "pending",
    }


# ══════════════════════════════════════
#   SEPAY WEBHOOK
# ══════════════════════════════════════

@router.post("/webhook")
async def sepay_webhook(request: Request, background_tasks: BackgroundTasks):
    """Handle SePay webhook for payment confirmation.
    
    SePay sends POST with transaction data when a payment is received.
    We match the order_code from the transfer description,
    then update the order and user subscription.
    """
    # Verify webhook signature
    body_bytes = await request.body()
    signature = request.headers.get("Authorization", "")
    # Strip "Apikey " prefix if present
    if signature.startswith("Apikey "):
        signature = signature[7:]

    if not verify_webhook_signature(body_bytes, signature):
        logger.warning("Invalid webhook signature")
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Extract transaction info from SePay payload
    # SePay webhook format: https://my.sepay.vn/docs/webhook
    transfer_type = payload.get("transferType", "")
    content = payload.get("content", "") or payload.get("description", "")
    amount = payload.get("transferAmount", 0) or payload.get("amount", 0)
    sepay_ref = payload.get("referenceCode", "") or payload.get("id", "")
    transaction_id = payload.get("transactionDate", "") or payload.get("transaction_id", "")

    # Only process incoming transfers
    if transfer_type and transfer_type.lower() not in ("in", "credit"):
        return {"success": True, "message": "Ignored outgoing transfer"}

    # Extract our order code from the transfer description
    order_code = extract_order_code_from_description(content)
    if not order_code:
        logger.info(f"Webhook: No order code found in description: '{content}'")
        return {"success": True, "message": "No matching order code"}

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    with engine.begin() as conn:
        # Find the pending order
        result = conn.execute(
            text("""
                SELECT p.*, u.subscription_tier, u.subscription_expires_at,
                       u.email AS user_email, u.full_name AS user_name
                FROM payments p
                JOIN users u ON p.user_id = u.id
                WHERE p.order_code = :code AND p.status = 'pending'
            """),
            {"code": order_code}
        ).mappings().first()

        if not result:
            logger.info(f"Webhook: No pending order for code: {order_code}")
            return {"success": True, "message": "No pending order found"}

        order = dict(result)

        # Verify amount matches (allow small tolerance for bank fees)
        if amount < order["amount"] * 0.98:
            logger.warning(
                f"Webhook: Amount mismatch for {order_code}. "
                f"Expected: {order['amount']}, Got: {amount}"
            )
            return {"success": True, "message": "Amount mismatch"}

        # Subscription starts NOW — prorated price was already charged upfront.
        # Never extend from the old expiry date; that double-counts unused days.
        now = datetime.now(timezone.utc)
        duration_days = get_subscription_duration_days(order["period"])
        sub_start = now
        sub_end = now + timedelta(days=duration_days)

        # Update payment status
        conn.execute(
            text("""
                UPDATE payments SET
                    status = 'completed',
                    completed_at = NOW(),
                    sepay_ref = :ref,
                    sepay_transaction_id = :tid,
                    subscription_start = :sub_start,
                    subscription_end = :sub_end
                WHERE id = :id
            """),
            {
                "ref": str(sepay_ref),
                "tid": str(transaction_id),
                "sub_start": sub_start,
                "sub_end": sub_end,
                "id": order["id"],
            }
        )

        # Update user subscription (tier + period + expiry)
        conn.execute(
            text("""
                UPDATE users SET
                    subscription_tier = :tier,
                    subscription_period = :period,
                    subscription_expires_at = :expires,
                    updated_at = NOW()
                WHERE id = :uid
            """),
            {
                "tier": order["plan"],
                "period": order["period"],
                "expires": sub_end,
                "uid": order["user_id"],
            }
        )

        logger.info(
            f"Payment completed: {order_code} | User: {order['user_id']} | "
            f"Plan: {order['plan']} | Amount: {amount} VND | Until: {sub_end}"
        )

    # Send the confirmation/receipt in the background — never block the webhook
    # ack (SePay retries on slow/failed responses) and never let a mail failure
    # roll back a completed payment.
    if order.get("user_email"):
        background_tasks.add_task(
            send_purchase_confirmation_email,
            order["user_email"],
            order["plan"],
            order["period"],
            float(order["amount"]),
            sub_end.strftime("%d/%m/%Y"),
            order_code,
            order.get("user_name"),
        )

    return {"success": True}


# ══════════════════════════════════════
#   PAYMENT STATUS CHECK (Polling)
# ══════════════════════════════════════

@router.get("/check/{order_code}")
async def check_payment_status(
    order_code: str,
    user: dict = Depends(get_current_user),
):
    """Check the status of a payment order. Frontend polls this endpoint."""
    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT status, plan, period, completed_at, expires_at,
                       subscription_start, subscription_end
                FROM payments
                WHERE order_code = :code AND user_id = :uid
            """),
            {"code": order_code, "uid": str(user["id"])}
        ).mappings().first()

    if not result:
        raise HTTPException(status_code=404, detail="Order not found")

    order = dict(result)

    # Auto-expire old pending orders
    if order["status"] == "pending":
        if order["expires_at"] and order["expires_at"] < datetime.now(timezone.utc):
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE payments SET status = 'expired' WHERE order_code = :code"),
                    {"code": order_code}
                )
            order["status"] = "expired"

    return {
        "status": order["status"],
        "plan": order["plan"],
        "period": order["period"],
        "completed_at": order["completed_at"].isoformat() if order["completed_at"] else None,
        "subscription_end": order["subscription_end"].isoformat() if order.get("subscription_end") else None,
    }


# ══════════════════════════════════════
#   PAYMENT HISTORY
# ══════════════════════════════════════

@router.get("/history")
async def payment_history(user: dict = Depends(get_current_user)):
    """Get user's payment history."""
    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    with engine.connect() as conn:
        results = conn.execute(
            text("""
                SELECT order_code, amount, credit_amount, plan, period, status,
                       created_at, completed_at, subscription_start, subscription_end
                FROM payments
                WHERE user_id = :uid
                ORDER BY created_at DESC
                LIMIT 20
            """),
            {"uid": str(user["id"])}
        ).mappings().all()

    return {
        "payments": [
            {
                "order_code": p["order_code"],
                "amount": p["amount"],
                "amount_formatted": f"{p['amount']:,.0f} VND",
                "credit_amount": p.get("credit_amount", 0) or 0,
                "plan": p["plan"],
                "period": p["period"],
                "status": p["status"],
                "created_at": p["created_at"].isoformat(),
                "completed_at": p["completed_at"].isoformat() if p["completed_at"] else None,
                "subscription_end": p["subscription_end"].isoformat() if p.get("subscription_end") else None,
            }
            for p in results
        ]
    }
