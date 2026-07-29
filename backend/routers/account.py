"""Data-subject rights: export, deactivate, delete.

Luật Bảo vệ dữ liệu cá nhân 91/2025 gives data subjects rights of access,
portability, rectification and erasure. Before this router the API had no way to
exercise any of them — there was not a single DELETE route in the whole
application, and no export endpoint, so a subject-access request could only be
served by hand-writing SQL against production.

Deletion is soft-delete-plus-anonymisation rather than a hard DELETE. See
``delete_account`` for why.
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Request, Response, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import text

from db.connection import get_engine
from routers.auth import get_current_user, _clear_auth_cookies, _record_consent
from utils.security import get_client_ip, check_auth_rate_limit, verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/account", tags=["account"])

#: One export per 24 hours. The in-memory limiter resets on every Render cold
#: start, so the durable `users.last_export_at` stamp is the real control.
EXPORT_COOLDOWN_HOURS = 24

#: How long a deletion request waits before the scrub runs, so an accidental or
#: coerced request can be undone.
DELETION_GRACE_DAYS = 14

#: Explicit allowlist, deliberately not a denylist: a future column holding a
#: secret then cannot leak into an export just because nobody remembered to
#: exclude it.
EXPORT_USER_FIELDS = (
    "id", "email", "full_name", "avatar_url", "auth_provider", "google_id",
    "risk_appetite", "email_verified", "created_at", "updated_at",
    "terms_version", "terms_accepted_at", "privacy_version", "privacy_accepted_at",
    "marketing_consent", "marketing_consent_at",
    "chat_quota_count", "chat_quota_date",
    "subscription_tier", "subscription_period", "subscription_expires_at",
    "pro_trial_claimed_at", "feedback_email_sent_at",
    "deletion_requested_at", "deleted_at", "deactivated_at", "last_export_at",
    "is_active",
)


def _jsonable(value):
    """Convert DB values to something json.dumps can handle."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #
def _build_export_sync(user_id) -> dict:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("db unavailable")

    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT * FROM users WHERE id = :id"), {"id": user_id}
        ).mappings().first()
        if row is None:
            raise LookupError("user not found")

        profile = {k: _jsonable(row.get(k)) for k in EXPORT_USER_FIELDS if k in row}

        # Bounded: an export must stay small enough to build in memory on a
        # 512 MB box without streaming.
        payments = [
            {k: _jsonable(v) for k, v in r.items()}
            for r in conn.execute(
                text("""
                    SELECT order_code, amount, plan, period, status, credit_amount,
                           created_at, completed_at, subscription_start, subscription_end
                      FROM payments WHERE user_id = :id
                     ORDER BY created_at DESC LIMIT 500
                """),
                {"id": user_id},
            ).mappings()
        ]

        consents = [
            {k: _jsonable(v) for k, v in r.items()}
            for r in conn.execute(
                text("""
                    SELECT doc, version, action, channel, created_at
                      FROM consent_log WHERE user_id = :id
                     ORDER BY created_at DESC LIMIT 500
                """),
                {"id": user_id},
            ).mappings()
        ]

        conn.execute(
            text("UPDATE users SET last_export_at = NOW() WHERE id = :id"), {"id": user_id}
        )

    return {
        "export_generated_at": _jsonable(row.get("updated_at")),
        "notice": (
            "Bản sao dữ liệu cá nhân của bạn tại DongAnh Capital, theo quyền truy cập và "
            "quyền mang dữ liệu đi quy định tại Luật Bảo vệ dữ liệu cá nhân 91/2025. "
            "Mật khẩu và các mã thông báo phiên không được bao gồm vì chúng chỉ được lưu ở "
            "dạng băm một chiều. Nội dung trò chuyện với trợ lý AI không được lưu trên máy chủ."
        ),
        "profile": profile,
        "consent_history": consents,
        "payments": payments,
    }


@router.get("/export")
async def export_account(request: Request, user: dict = Depends(get_current_user)):
    """Download every personal data field we hold, as JSON."""
    if not check_auth_rate_limit(get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    last = user.get("last_export_at")
    if last is not None:
        engine = get_engine()
        if engine is not None:
            with engine.begin() as conn:
                too_soon = conn.execute(
                    text("SELECT last_export_at > NOW() - make_interval(hours => :h) AS t FROM users WHERE id = :id"),
                    {"h": EXPORT_COOLDOWN_HOURS, "id": user["id"]},
                ).scalar()
            if too_soon:
                raise HTTPException(
                    status_code=429,
                    detail=f"You can request one export every {EXPORT_COOLDOWN_HOURS} hours.",
                )

    try:
        payload = await asyncio.to_thread(_build_export_sync, user["id"])
    except LookupError:
        raise HTTPException(status_code=404, detail="Account not found")
    except Exception as e:
        logger.error("export failed: %s", e)
        raise HTTPException(status_code=503, detail="Dịch vụ tạm thời không khả dụng")

    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": 'attachment; filename="donganhcapital-data-export.json"'},
    )


# --------------------------------------------------------------------------- #
# Deactivate
# --------------------------------------------------------------------------- #
@router.post("/deactivate")
async def deactivate_account(response: Response, user: dict = Depends(get_current_user)):
    """Reversible: signing back in reactivates the account.

    Offered alongside deletion because most people who want to "close" an account
    actually want to stop using it, and an irreversible scrub is a poor default
    for that.
    """
    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE users
                   SET is_active = FALSE,
                       deactivated_at = NOW(),
                       refresh_token_hash = NULL,
                       refresh_token_prev_hash = NULL,
                       updated_at = NOW()
                 WHERE id = :id
            """),
            {"id": user["id"]},
        )

    _clear_auth_cookies(response)
    return {"message": "Account deactivated. Sign in again at any time to reactivate it."}


# --------------------------------------------------------------------------- #
# Delete
# --------------------------------------------------------------------------- #
class DeleteAccountRequest(BaseModel):
    #: Typed back by the user, so deletion cannot be a single mis-click.
    confirm_email: str = Field(..., min_length=5, max_length=254)
    #: Required for email/password accounts; Google accounts confirm by email only.
    password: Optional[str] = Field(None, max_length=128)


def _anonymize_sync(user_id, email: str) -> bool:
    """Scrub identifying fields in place. Returns False if already deleted.

    Why not ``DELETE FROM users``: ``payments.user_id`` is ON DELETE CASCADE, so a
    hard delete silently destroys the transaction history, which Vietnamese
    accounting rules require be retained and which SePay reconciliation keys off.
    Anonymising makes the person unidentifiable while the financial record
    survives — that is what erasure means here, and it is also reversible-proof
    on a database with no PITR budget.

    Deliberately retained: `id` and `created_at` (referential integrity),
    and `pro_trial_claimed_at` (prevents delete-and-recreate trial farming —
    declared in the privacy policy as a legitimate-interest retention).
    """
    engine = get_engine()
    if engine is None:
        raise RuntimeError("db unavailable")

    with engine.begin() as conn:
        result = conn.execute(
            text("""
                UPDATE users SET
                    -- The UUID guarantees uniqueness against idx_users_email;
                    -- .invalid is RFC 2606-reserved so nothing can ever be
                    -- delivered to it; the prefix makes ops greps trivial.
                    email = 'deleted+' || id::text || '@deleted.donganhcapital.invalid',
                    full_name = NULL,
                    avatar_url = NULL,
                    -- Safe to null: idx_users_google_id is a partial index
                    -- (WHERE google_id IS NOT NULL), so duplicates cannot collide.
                    google_id = NULL,
                    hashed_password = NULL,
                    refresh_token_hash = NULL,
                    refresh_token_prev_hash = NULL,
                    reset_token_hash = NULL,
                    reset_token_expires_at = NULL,
                    email_verify_token_hash = NULL,
                    email_verify_expires_at = NULL,
                    risk_appetite = 'moderate',
                    marketing_consent = FALSE,
                    is_active = FALSE,
                    email_verified = FALSE,
                    deleted_at = NOW(),
                    anonymized_at = NOW(),
                    deletion_requested_at = NULL,
                    updated_at = NOW()
                WHERE id = :id AND deleted_at IS NULL
            """),
            {"id": user_id},
        )
        if result.rowcount == 0:
            return False

        # Stop all mail to the old address too, or a deleted user keeps
        # receiving the newsletter they can no longer unsubscribe from.
        conn.execute(
            text("""
                UPDATE subscribers SET unsubscribed_at = NOW()
                 WHERE email = :email AND unsubscribed_at IS NULL
            """),
            {"email": email},
        )
    return True


@router.delete("")
async def delete_account(
    body: DeleteAccountRequest,
    request: Request,
    response: Response,
    user: dict = Depends(get_current_user),
):
    """Erase the account immediately (anonymise in place)."""
    if not check_auth_rate_limit(get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    if body.confirm_email.strip().lower() != (user.get("email") or "").lower():
        raise HTTPException(status_code=400, detail="The email you typed does not match this account.")

    # Password re-check for email/password accounts, so a hijacked session alone
    # cannot destroy an account.
    if user.get("auth_provider") == "email" and user.get("hashed_password"):
        # to_thread: bcrypt at cost 12 blocks the event loop for seconds on 0.1 vCPU.
        if not body.password or not await asyncio.to_thread(
            verify_password, body.password, user["hashed_password"]
        ):
            raise HTTPException(status_code=401, detail="Incorrect password.")

    try:
        done = await asyncio.to_thread(_anonymize_sync, user["id"], user["email"])
    except Exception as e:
        logger.error("account deletion failed: %s", e)
        raise HTTPException(status_code=503, detail="Dịch vụ tạm thời không khả dụng")

    if not done:
        raise HTTPException(status_code=409, detail="This account has already been deleted.")

    logger.info("account anonymised: %s", user["id"])
    _clear_auth_cookies(response)
    return {"message": "Your account and personal data have been deleted."}


@router.post("/delete-request")
async def request_deletion(request: Request, user: dict = Depends(get_current_user)):
    """Schedule deletion after a grace period, instead of doing it now."""
    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    with engine.begin() as conn:
        conn.execute(
            text("UPDATE users SET deletion_requested_at = NOW(), updated_at = NOW() WHERE id = :id AND deleted_at IS NULL"),
            {"id": user["id"]},
        )
    return {
        "message": f"Deletion scheduled. Your account and data will be erased in {DELETION_GRACE_DAYS} days. "
                   "Cancel any time before then.",
        "grace_days": DELETION_GRACE_DAYS,
    }


@router.post("/delete-cancel")
async def cancel_deletion(user: dict = Depends(get_current_user)):
    """Cancel a pending deletion request."""
    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    with engine.begin() as conn:
        conn.execute(
            text("UPDATE users SET deletion_requested_at = NULL, updated_at = NOW() WHERE id = :id"),
            {"id": user["id"]},
        )
    return {"message": "Deletion cancelled."}


def sweep_pending_deletions_sync() -> int:
    """Anonymise accounts whose grace period has elapsed.

    Called from the existing 6-hourly subscription-expiry loop rather than as its
    own asyncio task — a fifth background task is not free on a 512 MB box.
    """
    engine = get_engine()
    if engine is None:
        return 0

    with engine.begin() as conn:
        due = conn.execute(
            text("""
                SELECT id, email FROM users
                 WHERE deletion_requested_at IS NOT NULL
                   AND deleted_at IS NULL
                   AND deletion_requested_at < NOW() - make_interval(days => :d)
                 LIMIT 50
            """),
            {"d": DELETION_GRACE_DAYS},
        ).mappings().all()

    count = 0
    for row in due:
        try:
            if _anonymize_sync(row["id"], row["email"]):
                count += 1
        except Exception as e:
            logger.error("deletion sweep failed for %s: %s", row["id"], e)
    if count:
        logger.info("deletion sweep anonymised %d account(s)", count)
    return count
