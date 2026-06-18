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

from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, Field, field_validator

from db.connection import get_engine
from sqlalchemy import text

from routers.auth import get_current_user
from utils.sepay import (
    get_price, generate_order_code, get_payment_details,
    verify_webhook_signature, extract_order_code_from_description,
    get_subscription_duration_days, ORDER_EXPIRY_SECONDS,
)
from utils.security import check_auth_rate_limit

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
    """Create a pending payment order and return VietQR payment details."""
    client_ip = request.client.host if request.client else "unknown"
    if not check_auth_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests")

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_id = str(user["id"])

    # Block repurchase of same or lower tier while subscription is still active
    tier_rank = {"free": 0, "pro": 1, "premium": 2}
    current_tier = user.get("subscription_tier", "free")
    expires_at = user.get("subscription_expires_at")
    now_utc = datetime.now(timezone.utc)
    if (
        tier_rank.get(body.plan, 0) <= tier_rank.get(current_tier, 0)
        and expires_at
        and expires_at > now_utc
    ):
        raise HTTPException(
            status_code=400,
            detail=f"You already have an active {current_tier.title()} subscription until {expires_at.strftime('%d/%m/%Y')}. "
                   f"You can only upgrade to a higher plan or renew after it expires.",
        )

    # Check for existing pending orders (prevent duplicate orders)
    with engine.connect() as conn:
        existing = conn.execute(
            text("""
                SELECT id, order_code, amount, plan, period, expires_at
                FROM payments
                WHERE user_id = :uid AND status = 'pending'
                  AND expires_at > NOW()
                ORDER BY created_at DESC
                LIMIT 1
            """),
            {"uid": user_id}
        ).mappings().first()

        if existing:
            existing = dict(existing)
            # Return existing pending order instead of creating a new one
            return {
                "order_code": existing["order_code"],
                "amount": existing["amount"],
                "plan": existing["plan"],
                "period": existing["period"],
                "payment": get_payment_details(existing["amount"], existing["order_code"]),
                "expires_at": existing["expires_at"].isoformat(),
                "status": "pending",
                "message": "You have an existing pending order.",
            }

    # Calculate price
    try:
        amount = get_price(body.plan, body.period)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Generate unique order code
    order_code = generate_order_code(user_id)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ORDER_EXPIRY_SECONDS)

    # Insert order
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO payments
                    (user_id, order_code, amount, plan, period, status, expires_at, description)
                VALUES
                    (:uid, :code, :amount, :plan, :period, 'pending', :expires, :desc)
            """),
            {
                "uid": user_id,
                "code": order_code,
                "amount": amount,
                "plan": body.plan,
                "period": body.period,
                "expires": expires_at,
                "desc": f"DongAnh Capital {body.plan.title()} - {body.period.title()}",
            }
        )

    payment_details = get_payment_details(amount, order_code)

    return {
        "order_code": order_code,
        "amount": amount,
        "plan": body.plan,
        "period": body.period,
        "payment": payment_details,
        "expires_at": expires_at.isoformat(),
        "status": "pending",
    }


# ══════════════════════════════════════
#   SEPAY WEBHOOK
# ══════════════════════════════════════

@router.post("/webhook")
async def sepay_webhook(request: Request):
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
                SELECT p.*, u.subscription_tier, u.subscription_expires_at
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

        # Calculate subscription period
        now = datetime.now(timezone.utc)
        duration_days = get_subscription_duration_days(order["period"])

        # If user already has active subscription, extend from current end date
        current_end = order.get("subscription_expires_at")
        if current_end and current_end > now:
            sub_start = current_end
        else:
            sub_start = now
        sub_end = sub_start + timedelta(days=duration_days)

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

        # Update user subscription
        conn.execute(
            text("""
                UPDATE users SET
                    subscription_tier = :tier,
                    subscription_expires_at = :expires,
                    updated_at = NOW()
                WHERE id = :uid
            """),
            {
                "tier": order["plan"],
                "expires": sub_end,
                "uid": order["user_id"],
            }
        )

        logger.info(
            f"Payment completed: {order_code} | User: {order['user_id']} | "
            f"Plan: {order['plan']} | Amount: {amount} VND | Until: {sub_end}"
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
                SELECT order_code, amount, plan, period, status,
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
