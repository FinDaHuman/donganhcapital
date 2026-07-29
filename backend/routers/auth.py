"""
Authentication router for DongAnh Capital.

Endpoints:
  - POST /api/auth/register         — Email/password registration
  - POST /api/auth/login             — Email/password login
  - POST /api/auth/logout            — Clear auth cookies
  - POST /api/auth/refresh           — Rotate refresh token
  - GET  /api/auth/me                — Get current user profile
  - PUT  /api/auth/me                — Update user profile
  - GET  /api/auth/google/url        — Get Google OAuth consent URL
  - POST /api/auth/google/callback   — Handle Google OAuth callback

Security:
  - httpOnly + Secure + SameSite cookies for JWT storage
  - Rate limiting on login/register (5 req / 5 min / IP)
  - Account lockout after 5 failed password attempts (15 min)
  - Refresh token rotation (one-time use)
  - CSRF protection via SameSite cookies
  - Input validation and sanitization
"""

import re
import asyncio
import secrets
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks
from pydantic import BaseModel, Field, field_validator

from db.connection import get_engine
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from utils.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    decode_token, hash_token,
    verify_google_token, get_google_oauth_url,
    check_auth_rate_limit,
    check_identity_rate_limit,
    check_global_auth_ceiling,
    is_account_locked, get_lockout_until,
    LOCKOUT_THRESHOLD,
    get_client_ip,
    DUMMY_PASSWORD_HASH,
)
from utils.mailer import (
    send_password_reset_email,
    send_google_account_notice_email,
    send_verification_email,
    send_welcome_email,
    FRONTEND_URL,
)
from utils.legal import LEGAL_VERSIONS, hash_ip, hash_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

TOO_MANY_REQUESTS = "Too many requests. Please try again later."


def _guard_auth_request(request: Request, identity: Optional[str] = None) -> str:
    """Apply all three rate limits to an auth attempt; return the resolved IP.

    Three keys, because each covers a gap the others leave:

    - the client IP, which is the normal per-user limit;
    - ``identity`` (the targeted email, when the endpoint takes one), so an
      attacker spreading requests across spoofed source IPs still gets only a
      handful of attempts against any single account;
    - an instance-wide ceiling, which no per-caller key can be rotated to escape.

    Raises 429 on the first limit that trips.
    """
    client_ip = get_client_ip(request)

    if not check_auth_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail=TOO_MANY_REQUESTS)
    if identity and not check_identity_rate_limit(identity):
        raise HTTPException(status_code=429, detail=TOO_MANY_REQUESTS)
    if not check_global_auth_ceiling():
        raise HTTPException(status_code=429, detail=TOO_MANY_REQUESTS)

    return client_ip


def _record_consent(conn, *, user_id, email, request, docs, action="accept", channel="web"):
    """Append consent rows inside an existing transaction.

    ``docs`` maps document name to the version accepted, e.g.
    ``{"terms": "2026-08-01", "privacy": "2026-08-01"}``.

    Written in the caller's transaction on purpose: a user row and its consent
    evidence must be created atomically, or a crash between the two leaves an
    account with no record of having agreed to anything.

    The IP is stored as a salted hash, never raw — enough to tie the consent to a
    session without introducing a new category of retained personal data.
    """
    if not docs:
        return
    ip_hash = hash_ip(get_client_ip(request)) if request is not None else None
    ua = (request.headers.get("user-agent") or "")[:255] if request is not None else None
    for doc, version in docs.items():
        conn.execute(
            text("""
                INSERT INTO consent_log
                    (user_id, email_hash, doc, version, action, channel, ip_hash, user_agent)
                VALUES
                    (:user_id, :email_hash, :doc, :version, :action, :channel, :ip_hash, :ua)
            """),
            {
                "user_id": user_id, "email_hash": hash_email(email), "doc": doc,
                "version": version, "action": action, "channel": channel,
                "ip_hash": ip_hash, "ua": ua,
            },
        )

# ── Constants ──
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
DANGEROUS_CHARS = re.compile(r"[<>'\";]")

def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


APP_ENV = os.getenv("APP_ENV", "production").strip().lower()
IS_PRODUCTION = APP_ENV == "production"
COOKIE_SECURE = _env_flag("COOKIE_SECURE", IS_PRODUCTION)
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax").strip().lower()
if COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    logger.warning("Invalid COOKIE_SAMESITE=%r; falling back to 'lax'", COOKIE_SAMESITE)
    COOKIE_SAMESITE = "lax"

_cookie_domain = os.getenv("COOKIE_DOMAIN")
if _cookie_domain is not None:
    COOKIE_DOMAIN = _cookie_domain.strip() or None
elif IS_PRODUCTION:
    COOKIE_DOMAIN = ".donganhcapital.com"
else:
    COOKIE_DOMAIN = None

ACCESS_COOKIE = "dac_access_token"
REFRESH_COOKIE = "dac_refresh_token"
# Non-httpOnly "is there a session?" hint. Carries NO token and NO PII — just the
# literal "1" — so it's safe to expose to JS. The httpOnly cookies above remain the
# sole source of truth; this only lets the SPA skip the /me + /refresh bootstrap for
# visitors who were never logged in, eliminating 2 guaranteed 401s per anonymous page
# load (the bulk of the 4xx traffic on the 0.1-vCPU box). Set/cleared in the same
# response as the real cookies, so it can never drift out of sync with them.
SESSION_HINT_COOKIE = "dac_session"

# Anti-CSRF nonce for the Google sign-in round trip. Issued by /google/url and
# checked in /google/callback: without it, an attacker can feed a victim's browser
# their own authorization code and silently sign the victim into the attacker's
# account. httpOnly because only the server ever compares it.
OAUTH_STATE_COOKIE = "dac_oauth_state"
OAUTH_STATE_MAX_AGE = 600  # 10 min — a consent screen either completes or is abandoned

RESET_TOKEN_EXPIRE_MINUTES = 60
VERIFY_TOKEN_EXPIRE_HOURS = 24


def _validate_password_strength(v: str) -> str:
    """Shared password policy — used by registration and password reset."""
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r'[A-Z]', v):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r'[a-z]', v):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r'[0-9]', v):
        raise ValueError("Password must contain at least one number")
    return v


# ── Request/Response Models ──
class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: Optional[str] = Field(None, max_length=100)

    # Consent fields (Luật 91/2025). Deliberately Optional with permissive
    # defaults for now: the SPA is cached in browsers, so rejecting a missing
    # field would 422 every user still running yesterday's JavaScript. Requests
    # arriving without consent are logged (see _record_consent) so the gap can
    # be measured before these are made mandatory.
    accepted_terms: bool = False
    accepted_privacy: bool = False
    terms_version: Optional[str] = Field(None, max_length=20)
    privacy_version: Optional[str] = Field(None, max_length=20)
    marketing_consent: bool = False

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        v = v.strip().lower()
        if DANGEROUS_CHARS.search(v):
            raise ValueError("Invalid email format")
        if not EMAIL_REGEX.match(v):
            raise ValueError("Invalid email format")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        return _validate_password_strength(v)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        return v.strip().lower()


class GoogleCallbackRequest(BaseModel):
    code: str = Field(..., min_length=10, max_length=2048)

    # Echoed back from the consent redirect and matched against OAUTH_STATE_COOKIE.
    # Optional at the model level so a frontend deployed before this change keeps
    # working; the endpoint still rejects a present-but-wrong value. See the
    # verification block in google_oauth_callback.
    state: Optional[str] = Field(None, max_length=512)

    # Consent carried across the OAuth redirect. The redirect destroys React
    # state, so the client stashes these in sessionStorage before leaving and
    # replays them here. If they are absent (in-app browser, different device,
    # cleared storage) the account is created with terms_accepted_at NULL and
    # the re-consent prompt catches it — consent is never deemed silently.
    accepted_terms: bool = False
    accepted_privacy: bool = False
    terms_version: Optional[str] = Field(None, max_length=20)
    privacy_version: Optional[str] = Field(None, max_length=20)
    marketing_consent: bool = False


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        return v.strip().lower()


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=256)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        return _validate_password_strength(v)


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=256)


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = Field(None, max_length=100)
    risk_appetite: Optional[str] = Field(None)

    @field_validator("risk_appetite")
    @classmethod
    def validate_risk(cls, v):
        if v is not None and v not in ("conservative", "moderate", "aggressive"):
            raise ValueError("Risk appetite must be conservative, moderate, or aggressive")
        return v


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str]
    avatar_url: Optional[str]
    auth_provider: str
    risk_appetite: str
    subscription_tier: str
    created_at: str


# ── Cookie Helpers ──
def _set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    """Set httpOnly auth cookies.

    Production defaults keep Secure cookies scoped to .donganhcapital.com.
    APP_ENV=local in backend/.env removes the domain and allows HTTP localhost
    testing without changing Render's deployed behavior.
    """
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=15 * 60,  # 15 minutes
        path="/",
        domain=COOKIE_DOMAIN,
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=7 * 24 * 3600,  # 7 days
        path="/api/auth/refresh",  # Only sent to refresh endpoint
        domain=COOKIE_DOMAIN,
    )
    # JS-readable session hint (see SESSION_HINT_COOKIE). httponly=False on purpose.
    # Lifetime matches the refresh cookie so it stays valid for exactly as long as the
    # session can be refreshed; both expire together since they're set in this response.
    response.set_cookie(
        key=SESSION_HINT_COOKIE,
        value="1",
        httponly=False,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=7 * 24 * 3600,  # 7 days — match REFRESH_COOKIE
        path="/",
        domain=COOKIE_DOMAIN,
    )


def _clear_oauth_state_cookie(response: Response):
    """Consume the OAuth state nonce — attributes must match set_cookie exactly."""
    response.delete_cookie(
        key=OAUTH_STATE_COOKIE,
        path="/api/auth",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        domain=COOKIE_DOMAIN,
    )


def _clear_auth_cookies(response: Response):
    """Clear auth cookies — all attributes must match set_cookie exactly for deletion to work."""
    response.delete_cookie(
        key=ACCESS_COOKIE,
        path="/",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        domain=COOKIE_DOMAIN,
    )
    response.delete_cookie(
        key=REFRESH_COOKIE,
        path="/api/auth/refresh",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        domain=COOKIE_DOMAIN,
    )
    # Clear the session hint too — attributes must match set_cookie for deletion to work.
    response.delete_cookie(
        key=SESSION_HINT_COOKIE,
        path="/",
        secure=COOKIE_SECURE,
        httponly=False,
        samesite=COOKIE_SAMESITE,
        domain=COOKIE_DOMAIN,
    )


# ── Current User Dependency ──
async def get_current_user(request: Request) -> dict:
    """Extract and verify user from httpOnly cookie.
    
    Returns user dict from database if valid token, raises 401 otherwise.
    """
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT * FROM users WHERE id = :id AND is_active = TRUE"),
            {"id": user_id}
        )
        user = result.mappings().first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return dict(user)


async def get_optional_user(request: Request) -> Optional[dict]:
    """Like get_current_user but returns None instead of raising."""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


# ── Helper: format user for response ──
def _format_user(user: dict) -> dict:
    """Format a user row for API response.

    Deliberately an allowlist, not a filtered copy of the row: password and token
    hashes must never be reachable from here even if a column is added later.
    """
    return {
        "id": str(user["id"]),
        "email": user["email"],
        "full_name": user.get("full_name"),
        "avatar_url": user.get("avatar_url"),
        "auth_provider": user.get("auth_provider", "email"),
        "risk_appetite": user.get("risk_appetite", "moderate"),
        # Email/password accounts must confirm their inbox; Google OAuth accounts
        # arrive already verified. This is now the only thing that gates access.
        "email_verified": bool(user.get("email_verified")),
        "created_at": user["created_at"].isoformat() if user.get("created_at") else None,
        # Consent state. The frontend gets this for free on every /me and every
        # token refresh, so re-consent needs no extra request — which matters on
        # a 0.1 vCPU box.
        "terms_version": user.get("terms_version"),
        "privacy_version": user.get("privacy_version"),
        "marketing_consent": bool(user.get("marketing_consent")),
        "needs_reconsent": (
            user.get("terms_version") != LEGAL_VERSIONS["terms"]
            or user.get("privacy_version") != LEGAL_VERSIONS["privacy"]
        ),
    }


# ══════════════════════════════════════
#   EMAIL/PASSWORD ENDPOINTS
# ══════════════════════════════════════

@router.post("/register")
async def register(body: RegisterRequest, request: Request, response: Response, background_tasks: BackgroundTasks):
    """Register a new user with email and password.

    The account is created and immediately logged in, but email_verified starts
    as FALSE. A verification link is emailed in the background; the Pro trial
    claim is gated until the user clicks it.
    """
    _guard_auth_request(request, body.email)

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # bcrypt at cost 12 is deliberately expensive — on 0.1 vCPU it can take
    # seconds, and running it inline would stall the whole event loop (every
    # other request, including health checks) for that entire time.
    hashed_pw = await asyncio.to_thread(hash_password, body.password)

    # Generate email verification token before the INSERT so we can store its
    # hash atomically with the user row (single round trip, no race window).
    raw_verify_token = secrets.token_urlsafe(32)
    verify_token_hash = hash_token(raw_verify_token)
    verify_expires = datetime.now(timezone.utc) + timedelta(hours=VERIFY_TOKEN_EXPIRE_HOURS)

    try:
        with engine.begin() as conn:
            # Fast-path existence check for the common case. The unique index on
            # users(email) is the real guard: two concurrent registrations can both
            # pass this SELECT, so the INSERT below may still raise IntegrityError —
            # caught and mapped to the same 409 outside the transaction.
            existing = conn.execute(
                text("SELECT id FROM users WHERE email = :email"),
                {"email": body.email}
            ).first()

            if existing:
                # The 409 status necessarily reveals that the email is taken (an
                # account either can or can't be created). The message stays neutral
                # so we don't additionally confirm the auth method or account state.
                raise HTTPException(
                    status_code=409,
                    detail="Unable to create account. Please try a different email or sign in."
                )

            # Consent is recorded against the version the client actually
            # displayed, not the current server version — accepting a document
            # the user never saw would be worthless as evidence. A stale SPA
            # therefore records a stale version, and the re-consent prompt
            # picks it up at next sign-in.
            terms_v = body.terms_version if body.accepted_terms else None
            privacy_v = body.privacy_version if body.accepted_privacy else None
            if not (body.accepted_terms and body.accepted_privacy):
                logger.info("register without consent fields (stale client?): %s", body.email)

            # Insert new user — email_verified is explicitly FALSE so the column
            # default can never silently skip verification for new accounts.
            result = conn.execute(
                text("""
                    INSERT INTO users (
                        email, hashed_password, full_name, auth_provider,
                        email_verified, email_verify_token_hash, email_verify_expires_at,
                        terms_version, terms_accepted_at,
                        privacy_version, privacy_accepted_at,
                        marketing_consent, marketing_consent_at
                    )
                    VALUES (:email, :password, :name, 'email',
                            FALSE, :verify_hash, :verify_expires,
                            :terms_v, CASE WHEN :terms_v IS NULL THEN NULL ELSE NOW() END,
                            :privacy_v, CASE WHEN :privacy_v IS NULL THEN NULL ELSE NOW() END,
                            :marketing, CASE WHEN :marketing THEN NOW() ELSE NULL END)
                    RETURNING id, email, full_name, avatar_url, auth_provider,
                              risk_appetite, email_verified, created_at,
                              terms_version, privacy_version, marketing_consent
                """),
                {
                    "email": body.email, "password": hashed_pw, "name": body.full_name,
                    "verify_hash": verify_token_hash, "verify_expires": verify_expires,
                    "terms_v": terms_v, "privacy_v": privacy_v,
                    "marketing": bool(body.marketing_consent),
                }
            )
            user = dict(result.mappings().first())

            # Same transaction as the INSERT: an account and its proof of consent
            # must exist together or not at all.
            docs = {}
            if terms_v:
                docs["terms"] = terms_v
            if privacy_v:
                docs["privacy"] = privacy_v
            if body.marketing_consent:
                docs["marketing"] = LEGAL_VERSIONS["privacy"]
            _record_consent(conn, user_id=user["id"], email=body.email,
                            request=request, docs=docs, channel="web")
    except IntegrityError:
        # Lost a race against a concurrent signup with the same email — surface the
        # same 409 as the existence check rather than a 500 on the unique violation.
        raise HTTPException(
            status_code=409,
            detail="Unable to create account. Please try a different email or sign in."
        )

    # Issue tokens
    access_token = create_access_token({"sub": str(user["id"]), "email": user["email"]})
    refresh_token = create_refresh_token({"sub": str(user["id"])})

    # Store refresh token hash
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE users SET refresh_token_hash = :hash WHERE id = :id"),
            {"hash": hash_token(refresh_token), "id": user["id"]}
        )

    # Send verification email in the background — never blocks or fails the
    # registration response. The link is valid for VERIFY_TOKEN_EXPIRE_HOURS.
    verify_url = f"{FRONTEND_URL}/verify-email?token={raw_verify_token}"
    background_tasks.add_task(send_verification_email, body.email, verify_url, body.full_name)

    _set_auth_cookies(response, access_token, refresh_token)

    return {"user": _format_user(user)}


@router.post("/login")
async def login(body: LoginRequest, request: Request, response: Response):
    """Login with email and password."""
    _guard_auth_request(request, body.email)

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT id, email, hashed_password, full_name, avatar_url,
                       auth_provider, risk_appetite, email_verified, created_at,
                       failed_login_attempts, locked_until, is_active,
                       terms_version, privacy_version, marketing_consent,
                       deleted_at, deactivated_at
                FROM users WHERE email = :email
            """),
            {"email": body.email.strip().lower()}
        )
        user = result.mappings().first()

    if not user:
        # Run a throwaway bcrypt verify so a non-existent email costs the same
        # wall-clock time as a real one — prevents email enumeration by timing.
        await asyncio.to_thread(verify_password, body.password, DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = dict(user)

    # A deleted account is gone for good; a merely deactivated one reactivates
    # on a successful sign-in, which is what makes "deactivate" a meaningfully
    # lighter option than "delete" rather than a support ticket.
    if user.get("deleted_at") is not None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Check account lockout
    if is_account_locked(user.get("failed_login_attempts", 0), user.get("locked_until")):
        raise HTTPException(
            status_code=423,
            detail="Account temporarily locked due to too many failed attempts. Please try again later."
        )

    # Verify password
    if not user.get("hashed_password"):
        raise HTTPException(
            status_code=401,
            detail="This account uses Google Sign-In. Please sign in with Google."
        )

    if not await asyncio.to_thread(verify_password, body.password, user["hashed_password"]):
        # Increment failed attempts
        with engine.begin() as conn:
            new_attempts = user.get("failed_login_attempts", 0) + 1
            update_data = {"id": user["id"], "attempts": new_attempts}

            if new_attempts >= LOCKOUT_THRESHOLD:
                update_data["locked"] = get_lockout_until()
                conn.execute(
                    text("""
                        UPDATE users 
                        SET failed_login_attempts = :attempts, locked_until = :locked
                        WHERE id = :id
                    """),
                    update_data
                )
            else:
                conn.execute(
                    text("UPDATE users SET failed_login_attempts = :attempts WHERE id = :id"),
                    update_data
                )

        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Success — reset failed attempts
    access_token = create_access_token({"sub": str(user["id"]), "email": user["email"]})
    refresh_token = create_refresh_token({"sub": str(user["id"])})

    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE users
                SET failed_login_attempts = 0, locked_until = NULL,
                    -- A successful sign-in reactivates a deactivated account.
                    -- Deleted accounts never reach here (rejected above).
                    is_active = TRUE, deactivated_at = NULL,
                    refresh_token_hash = :hash, updated_at = NOW()
                WHERE id = :id
            """),
            {"hash": hash_token(refresh_token), "id": user["id"]}
        )

    _set_auth_cookies(response, access_token, refresh_token)

    # Reflect the reactivation in the response rather than echoing the stale row.
    user["is_active"] = True
    return {"user": _format_user(user)}


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Clear auth cookies and revoke the server-side refresh token.

    The refresh cookie is path-scoped to /api/auth/refresh and so isn't sent
    here, but the access cookie (path "/") is. We recover the user id from its
    signature — even if the access token has expired — and null
    refresh_token_hash so a stolen refresh token can't outlive logout. This is
    best-effort: a failure must never block the logout itself.
    """
    token = request.cookies.get(ACCESS_COOKIE)
    if token:
        payload = decode_token(token, verify_exp=False)
        if payload and payload.get("type") == "access" and payload.get("sub"):
            try:
                engine = get_engine()
                if engine is not None:
                    with engine.begin() as conn:
                        conn.execute(
                            text("UPDATE users SET refresh_token_hash = NULL WHERE id = :id"),
                            {"id": payload["sub"]},
                        )
            except Exception as e:
                logger.warning(f"Logout token revocation failed: {e}")

    _clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    """Rotate refresh token — issue new access + refresh tokens."""
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")

    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT * FROM users WHERE id = :id AND is_active = TRUE"),
            {"id": user_id}
        )
        user = result.mappings().first()

    if not user:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="User not found")

    user = dict(user)

    # Verify refresh token hash (one-time use with concurrent-tab grace period).
    stored_hash = user.get("refresh_token_hash")
    presented_hash = hash_token(token)

    if not stored_hash or not secrets.compare_digest(stored_hash, presented_hash):
        # Before treating this as token theft, check whether it's just a concurrent
        # request from another tab that used the same refresh token a moment ago.
        # If this token matches the PREVIOUS hash and rotation happened within the
        # grace window, the winning tab already refreshed; the browser already has
        # the new cookies. Return the user profile so the interceptor can retry the
        # original request using those fresh cookies — no new tokens needed here.
        prev_hash = user.get("refresh_token_prev_hash")
        rotated_at = user.get("refresh_rotated_at")
        _GRACE_SECONDS = 30

        is_concurrent = (
            prev_hash is not None
            and secrets.compare_digest(prev_hash, presented_hash)
            and rotated_at is not None
            and (datetime.now(timezone.utc) - rotated_at).total_seconds() < _GRACE_SECONDS
        )

        if is_concurrent:
            return {"user": _format_user(user)}

        # Genuine reuse / mismatch — possible token theft. Wipe all sessions.
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE users SET refresh_token_hash = NULL WHERE id = :id"),
                {"id": user_id}
            )
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh token revoked")

    # Issue new tokens and rotate: stash the old hash so concurrent tabs have a
    # grace window (see above) instead of triggering a false-positive revocation.
    new_access = create_access_token({"sub": str(user["id"]), "email": user["email"]})
    new_refresh = create_refresh_token({"sub": str(user["id"])})

    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE users
                SET refresh_token_prev_hash = refresh_token_hash,
                    refresh_token_hash = :hash,
                    refresh_rotated_at = NOW(),
                    updated_at = NOW()
                WHERE id = :id
            """),
            {"hash": hash_token(new_refresh), "id": user["id"]}
        )

    _set_auth_cookies(response, new_access, new_refresh)

    return {"user": _format_user(user)}


# ══════════════════════════════════════
#   PASSWORD RESET ENDPOINTS
# ══════════════════════════════════════

# Opaque response — identical whether or not the email exists, so the endpoint
# can't be used to enumerate registered accounts.
_FORGOT_OPAQUE_MESSAGE = (
    "If an account exists for that email, a password reset link has been sent."
)


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Begin a password reset. Always returns the same opaque message.

    For an email/password account: generates a single-use token (60 min), stores
    only its hash, and emails the reset link. For a Google-only account: emails a
    "sign in with Google" notice instead. Email is sent in the background so the
    network call never holds a request slot.
    """
    _guard_auth_request(request, body.email)

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    with engine.connect() as conn:
        user = conn.execute(
            text("""
                SELECT id, email, full_name, hashed_password, is_active
                FROM users WHERE email = :email
            """),
            {"email": body.email},
        ).mappings().first()

    # No such (active) user — return opaque success without sending anything.
    if not user or not user.get("is_active"):
        return {"message": _FORGOT_OPAQUE_MESSAGE}

    user = dict(user)

    # Google-only account (no password to reset) — guide them to Google sign-in.
    if not user.get("hashed_password"):
        background_tasks.add_task(
            send_google_account_notice_email, user["email"], user.get("full_name")
        )
        return {"message": _FORGOT_OPAQUE_MESSAGE}

    # Issue a single-use reset token; store only its hash.
    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)

    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE users
                SET reset_token_hash = :hash, reset_token_expires_at = :expires
                WHERE id = :id
            """),
            {"hash": token_hash, "expires": expires_at, "id": user["id"]},
        )

    reset_url = f"{FRONTEND_URL}/reset-password?token={raw_token}"
    background_tasks.add_task(
        send_password_reset_email, user["email"], reset_url, user.get("full_name")
    )

    return {"message": _FORGOT_OPAQUE_MESSAGE}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    response: Response,
):
    """Complete a password reset with a valid, unexpired token.

    On success: sets the new password, consumes the token (single use), and
    revokes all existing sessions by clearing the refresh token hash. Also clears
    any account lockout. Does NOT log the user in — they sign in fresh afterwards.
    """
    # No identity key: the reset token is the credential and carries no email.
    _guard_auth_request(request)

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    token_hash = hash_token(body.token)

    # Hash the new password before opening the transaction. bcrypt takes seconds
    # on 0.1 vCPU, and doing it mid-transaction would hold a scarce DB connection
    # open for that whole time. Cost on an invalid token is the price of that.
    new_password_hash = await asyncio.to_thread(hash_password, body.password)

    with engine.begin() as conn:
        user = conn.execute(
            text("""
                SELECT id FROM users
                WHERE reset_token_hash = :hash
                  AND reset_token_expires_at > NOW()
                  AND is_active = TRUE
            """),
            {"hash": token_hash},
        ).mappings().first()

        if not user:
            raise HTTPException(
                status_code=400,
                detail="This password reset link is invalid or has expired. Please request a new one.",
            )

        conn.execute(
            text("""
                UPDATE users SET
                    hashed_password = :pw,
                    reset_token_hash = NULL,
                    reset_token_expires_at = NULL,
                    refresh_token_hash = NULL,
                    failed_login_attempts = 0,
                    locked_until = NULL,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {"pw": new_password_hash, "id": user["id"]},
        )

    # Defensively clear any auth cookies on this device so the old session can't linger.
    _clear_auth_cookies(response)

    return {"message": "Your password has been reset. Please sign in with your new password."}


# ══════════════════════════════════════
#   EMAIL VERIFICATION ENDPOINTS
# ══════════════════════════════════════

@router.post("/verify-email")
async def verify_email(body: VerifyEmailRequest, request: Request, background_tasks: BackgroundTasks):
    """Consume an email verification token and mark the account as verified.

    No authentication required — the token itself is the credential (256-bit
    entropy via secrets.token_urlsafe(32)). The user may be on a different
    device than where they registered. Idempotent: a second call with the same
    token fails because the token is cleared on first use.
    """
    # No identity key: the verification token is the credential.
    _guard_auth_request(request)

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    token_hash = hash_token(body.token)

    with engine.begin() as conn:
        user = conn.execute(
            text("""
                SELECT id, email, full_name FROM users
                WHERE email_verify_token_hash = :hash
                  AND email_verify_expires_at > NOW()
                  AND email_verified = FALSE
                  AND is_active = TRUE
            """),
            {"hash": token_hash},
        ).mappings().first()

        if not user:
            raise HTTPException(
                status_code=400,
                detail="This verification link is invalid or has expired. Please request a new one.",
            )

        # Verify and consume the token atomically — a second attempt with the
        # same token finds email_verified = TRUE and gets a 400 above.
        conn.execute(
            text("""
                UPDATE users SET
                    email_verified = TRUE,
                    email_verify_token_hash = NULL,
                    email_verify_expires_at = NULL,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {"id": user["id"]},
        )

    logger.info("Email verified for user_id=%s", user["id"])

    # Fire the one-time welcome email now that the email/password account is
    # usable. Placed after the token-consuming UPDATE so the already-verified→400
    # guard above guarantees exactly-once delivery even on a double-clicked link.
    background_tasks.add_task(send_welcome_email, user["email"], user.get("full_name"))

    return {"message": "Your email has been verified successfully."}


@router.post("/resend-verification")
async def resend_verification(
    request: Request,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """Resend the email verification link to the authenticated user.

    Silent no-op if the account is already verified or is a Google account
    (both have nothing to verify). Sends to the user's own email — no email
    parameter is accepted to prevent enumeration and spam abuse.
    """
    # Authenticated endpoint, so the identity key is the caller's own address —
    # it caps how often one account can trigger outbound verification email.
    _guard_auth_request(request, user.get("email"))

    # Google accounts and already-verified accounts need nothing.
    if user.get("email_verified") or user.get("auth_provider") == "google":
        return {"message": "Your email is already verified."}

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=VERIFY_TOKEN_EXPIRE_HOURS)

    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE users SET
                    email_verify_token_hash = :hash,
                    email_verify_expires_at = :expires,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {"hash": token_hash, "expires": expires_at, "id": user["id"]},
        )

    verify_url = f"{FRONTEND_URL}/verify-email?token={raw_token}"
    background_tasks.add_task(
        send_verification_email, user["email"], verify_url, user.get("full_name")
    )

    return {"message": "Verification email sent. Please check your inbox."}


# ══════════════════════════════════════
#   USER PROFILE ENDPOINTS
# ══════════════════════════════════════

@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Get current user profile."""
    return {"user": _format_user(user)}


@router.put("/me")
async def update_me(
    body: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
):
    """Update current user profile."""
    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    updates = []
    params = {"id": user["id"]}

    if body.full_name is not None:
        updates.append("full_name = :name")
        params["name"] = body.full_name.strip()[:100] if body.full_name else None

    if body.risk_appetite is not None:
        updates.append("risk_appetite = :risk")
        params["risk"] = body.risk_appetite

    if not updates:
        return {"user": _format_user(user)}

    updates.append("updated_at = NOW()")

    with engine.begin() as conn:
        result = conn.execute(
            text(f"""
                UPDATE users SET {', '.join(updates)} WHERE id = :id
                RETURNING id, email, full_name, avatar_url, auth_provider,
                          risk_appetite, email_verified, created_at,
                          terms_version, privacy_version, marketing_consent
            """),
            params
        )
        updated_user = dict(result.mappings().first())

    return {"user": _format_user(updated_user)}


class ConsentRequest(BaseModel):
    """Re-acceptance after a document version changes."""
    accepted_terms: bool = False
    accepted_privacy: bool = False
    terms_version: Optional[str] = Field(None, max_length=20)
    privacy_version: Optional[str] = Field(None, max_length=20)
    marketing_consent: Optional[bool] = None


@router.post("/consent")
async def record_consent(
    body: ConsentRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Record re-acceptance of the Terms and/or Privacy Policy, or a change to
    marketing consent.

    Unlike registration, the submitted version must equal the current server
    version: this endpoint exists precisely to clear a `needs_reconsent` flag, and
    accepting a superseded document would not clear anything.
    """
    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    updates, params, docs = [], {"id": user["id"]}, {}

    if body.accepted_terms:
        if body.terms_version != LEGAL_VERSIONS["terms"]:
            raise HTTPException(status_code=422, detail="Stale terms version — please reload the page")
        updates += ["terms_version = :tv", "terms_accepted_at = NOW()"]
        params["tv"] = body.terms_version
        docs["terms"] = body.terms_version

    if body.accepted_privacy:
        if body.privacy_version != LEGAL_VERSIONS["privacy"]:
            raise HTTPException(status_code=422, detail="Stale privacy version — please reload the page")
        updates += ["privacy_version = :pv", "privacy_accepted_at = NOW()"]
        params["pv"] = body.privacy_version
        docs["privacy"] = body.privacy_version

    marketing_action = None
    if body.marketing_consent is not None:
        updates += ["marketing_consent = :mc", "marketing_consent_at = NOW()"]
        params["mc"] = bool(body.marketing_consent)
        marketing_action = "accept" if body.marketing_consent else "withdraw"

    if not updates:
        return {"user": _format_user(user)}

    updates.append("updated_at = NOW()")

    with engine.begin() as conn:
        result = conn.execute(
            text(f"""
                UPDATE users SET {', '.join(updates)} WHERE id = :id
                RETURNING id, email, full_name, avatar_url, auth_provider,
                          risk_appetite, email_verified, created_at,
                          terms_version, privacy_version, marketing_consent
            """),
            params,
        )
        updated_user = dict(result.mappings().first())

        if docs:
            _record_consent(conn, user_id=user["id"], email=user["email"],
                            request=request, docs=docs, action="reaccept")
        if marketing_action:
            _record_consent(conn, user_id=user["id"], email=user["email"], request=request,
                            docs={"marketing": LEGAL_VERSIONS["privacy"]},
                            action=marketing_action)

    return {"user": _format_user(updated_user)}


# ══════════════════════════════════════
#   GOOGLE OAUTH ENDPOINTS
# ══════════════════════════════════════

@router.get("/google/url")
async def google_oauth_url(response: Response):
    """Return the Google OAuth consent URL for the frontend to redirect to.

    Mints a single-use ``state`` nonce, embeds it in the consent URL, and stores
    it in an httpOnly cookie. Google echoes the value back on the redirect, and
    the callback below requires the two to match — which is what prevents an
    attacker from completing the flow with their own authorization code in a
    victim's browser (login CSRF).
    """
    state = secrets.token_urlsafe(32)

    response.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=state,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=OAUTH_STATE_MAX_AGE,
        # Scoped to the auth routes — this cookie has no business on any other path.
        path="/api/auth",
        domain=COOKIE_DOMAIN,
    )

    return {"url": get_google_oauth_url(state)}


@router.post("/google/callback")
async def google_oauth_callback(
    body: GoogleCallbackRequest,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
):
    """Handle Google OAuth callback — exchange code, find/create user, issue JWT."""
    # No identity key: the email only becomes known after Google verifies the code.
    _guard_auth_request(request)

    # Anti-CSRF: the state echoed by Google must match the nonce we issued.
    #
    # Enforced only when the cookie is present. A browser running the previous
    # frontend build never received one, so it keeps working through the rollout;
    # once the client change ships, tighten this to require the cookie outright.
    # A cookie that IS present must match — that is the case an attacker controls.
    expected_state = request.cookies.get(OAUTH_STATE_COOKIE)
    if expected_state:
        if not body.state or not secrets.compare_digest(body.state, expected_state):
            logger.warning("Google OAuth state mismatch — rejecting callback")
            raise HTTPException(
                status_code=400,
                detail="Sign-in session expired or invalid. Please try signing in again.",
            )

    # Consume the nonce on the success path. Raising HTTPException below builds a
    # fresh response and discards anything set here, so on a failed sign-in the
    # cookie simply lives out its 10-minute TTL — harmless, since it is httpOnly
    # and only ever compared against a value the same browser echoes back.
    _clear_oauth_state_cookie(response)

    # Verify Google token
    google_user = await verify_google_token(body.code)
    if not google_user:
        raise HTTPException(status_code=401, detail="Google authentication failed")

    if not google_user.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google email not verified")

    email = google_user["email"].strip().lower()
    google_id = google_user["google_id"]

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    with engine.begin() as conn:
        # Check if user exists by google_id or email
        result = conn.execute(
            text("SELECT * FROM users WHERE google_id = :gid OR email = :email"),
            {"gid": google_id, "email": email}
        )
        existing = result.mappings().first()
        is_new_user = existing is None

        if existing:
            user = dict(existing)
            # Update Google info if needed (user might have registered with email first).
            # Google has verified this email so we can safely mark email_verified = TRUE
            # even if the user never clicked our own verification link.
            conn.execute(
                text("""
                    UPDATE users SET
                        google_id = COALESCE(google_id, :gid),
                        avatar_url = COALESCE(:avatar, avatar_url),
                        full_name = COALESCE(:name, full_name),
                        email_verified = TRUE,
                        email_verify_token_hash = NULL,
                        email_verify_expires_at = NULL,
                        updated_at = NOW(),
                        failed_login_attempts = 0,
                        locked_until = NULL
                    WHERE id = :id
                """),
                {
                    "gid": google_id,
                    "avatar": google_user.get("avatar_url"),
                    "name": google_user.get("full_name"),
                    "id": user["id"],
                }
            )
            # Refresh user data
            result = conn.execute(
                text("SELECT * FROM users WHERE id = :id"),
                {"id": user["id"]}
            )
            user = dict(result.mappings().first())
        else:
            # Consent replayed from sessionStorage across the OAuth redirect.
            # Absent → NULL, and the re-consent prompt handles it. Never deemed.
            terms_v = body.terms_version if body.accepted_terms else None
            privacy_v = body.privacy_version if body.accepted_privacy else None
            if not (terms_v and privacy_v):
                logger.info("google signup without consent payload: %s", email)

            # Create new user — Google has already verified this email address.
            result = conn.execute(
                text("""
                    INSERT INTO users (
                        email, google_id, full_name, avatar_url, auth_provider, email_verified,
                        terms_version, terms_accepted_at,
                        privacy_version, privacy_accepted_at,
                        marketing_consent, marketing_consent_at
                    )
                    VALUES (:email, :gid, :name, :avatar, 'google', TRUE,
                            :terms_v, CASE WHEN :terms_v IS NULL THEN NULL ELSE NOW() END,
                            :privacy_v, CASE WHEN :privacy_v IS NULL THEN NULL ELSE NOW() END,
                            :marketing, CASE WHEN :marketing THEN NOW() ELSE NULL END)
                    RETURNING *
                """),
                {
                    "email": email,
                    "gid": google_id,
                    "name": google_user.get("full_name"),
                    "avatar": google_user.get("avatar_url"),
                    "terms_v": terms_v, "privacy_v": privacy_v,
                    "marketing": bool(body.marketing_consent),
                }
            )
            user = dict(result.mappings().first())

            docs = {}
            if terms_v:
                docs["terms"] = terms_v
            if privacy_v:
                docs["privacy"] = privacy_v
            if body.marketing_consent:
                docs["marketing"] = LEGAL_VERSIONS["privacy"]
            _record_consent(conn, user_id=user["id"], email=email,
                            request=request, docs=docs, channel="google_oauth")

    if not user.get("is_active"):
        raise HTTPException(status_code=401, detail="Account is deactivated")

    # One-time welcome email for brand-new Google accounts only. Google sign-ups
    # are verified at creation and never pass through the verify-email path, so
    # this is their single welcome touch — no duplicate with the email/password
    # flow (which welcomes at verification instead).
    if is_new_user:
        background_tasks.add_task(send_welcome_email, user["email"], user.get("full_name"))

    # Issue tokens
    access_token = create_access_token({"sub": str(user["id"]), "email": user["email"]})
    refresh_token = create_refresh_token({"sub": str(user["id"])})

    with engine.begin() as conn:
        conn.execute(
            text("UPDATE users SET refresh_token_hash = :hash WHERE id = :id"),
            {"hash": hash_token(refresh_token), "id": user["id"]}
        )

    _set_auth_cookies(response, access_token, refresh_token)

    return {"user": _format_user(user)}
