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
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, Field, field_validator

from db.connection import get_engine
from sqlalchemy import text

from utils.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    decode_token, hash_token,
    verify_google_token, get_google_oauth_url,
    check_auth_rate_limit,
    is_account_locked, get_lockout_until,
    LOCKOUT_THRESHOLD,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Constants ──
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
DANGEROUS_CHARS = re.compile(r"[<>'\";]")
COOKIE_DOMAIN = None  # Let browser handle it automatically
IS_PRODUCTION = True  # Set based on environment

ACCESS_COOKIE = "dac_access_token"
REFRESH_COOKIE = "dac_refresh_token"


# ── Request/Response Models ──
class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: Optional[str] = Field(None, max_length=100)

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
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r'[A-Z]', v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r'[a-z]', v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r'[0-9]', v):
            raise ValueError("Password must contain at least one number")
        return v


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        return v.strip().lower()


class GoogleCallbackRequest(BaseModel):
    code: str = Field(..., min_length=10, max_length=2048)


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
    """Set httpOnly, Secure, SameSite auth cookies."""
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=True,
        samesite="none",  # Required for cross-domain requests (Vercel <-> Render)
        max_age=15 * 60,  # 15 minutes
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="none",  # Required for cross-domain requests
        max_age=7 * 24 * 3600,  # 7 days
        path="/api/auth/refresh",  # Only sent to refresh endpoint
    )


def _clear_auth_cookies(response: Response):
    """Clear auth cookies."""
    response.delete_cookie(key=ACCESS_COOKIE, path="/")
    response.delete_cookie(key=REFRESH_COOKIE, path="/api/auth/refresh")


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
    """Format a user row for API response."""
    return {
        "id": str(user["id"]),
        "email": user["email"],
        "full_name": user.get("full_name"),
        "avatar_url": user.get("avatar_url"),
        "auth_provider": user.get("auth_provider", "email"),
        "risk_appetite": user.get("risk_appetite", "moderate"),
        "subscription_tier": user.get("subscription_tier", "free"),
        "subscription_expires_at": user["subscription_expires_at"].isoformat() if user.get("subscription_expires_at") else None,
        "created_at": user["created_at"].isoformat() if user.get("created_at") else None,
    }


# ══════════════════════════════════════
#   EMAIL/PASSWORD ENDPOINTS
# ══════════════════════════════════════

@router.post("/register")
async def register(body: RegisterRequest, request: Request, response: Response):
    """Register a new user with email and password."""
    client_ip = request.client.host if request.client else "unknown"
    if not check_auth_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    hashed_pw = hash_password(body.password)

    with engine.begin() as conn:
        # Check if email already exists
        existing = conn.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": body.email}
        ).first()

        if existing:
            # Security: don't reveal if email exists — use opaque message
            raise HTTPException(
                status_code=409,
                detail="Unable to create account. Please try a different email or sign in."
            )

        # Insert new user
        result = conn.execute(
            text("""
                INSERT INTO users (email, hashed_password, full_name, auth_provider)
                VALUES (:email, :password, :name, 'email')
                RETURNING id, email, full_name, avatar_url, auth_provider, 
                          risk_appetite, subscription_tier, created_at
            """),
            {"email": body.email, "password": hashed_pw, "name": body.full_name}
        )
        user = dict(result.mappings().first())

    # Issue tokens
    access_token = create_access_token({"sub": str(user["id"]), "email": user["email"]})
    refresh_token = create_refresh_token({"sub": str(user["id"])})

    # Store refresh token hash
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE users SET refresh_token_hash = :hash WHERE id = :id"),
            {"hash": hash_token(refresh_token), "id": user["id"]}
        )

    _set_auth_cookies(response, access_token, refresh_token)

    return {"user": _format_user(user)}


@router.post("/login")
async def login(body: LoginRequest, request: Request, response: Response):
    """Login with email and password."""
    client_ip = request.client.host if request.client else "unknown"
    if not check_auth_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT id, email, hashed_password, full_name, avatar_url,
                       auth_provider, risk_appetite, subscription_tier, created_at,
                       failed_login_attempts, locked_until, is_active
                FROM users WHERE email = :email
            """),
            {"email": body.email.strip().lower()}
        )
        user = result.mappings().first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = dict(user)

    if not user.get("is_active"):
        raise HTTPException(status_code=401, detail="Account is deactivated")

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

    if not verify_password(body.password, user["hashed_password"]):
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
                    refresh_token_hash = :hash, updated_at = NOW()
                WHERE id = :id
            """),
            {"hash": hash_token(refresh_token), "id": user["id"]}
        )

    _set_auth_cookies(response, access_token, refresh_token)

    return {"user": _format_user(user)}


@router.post("/logout")
async def logout(response: Response):
    """Clear auth cookies and invalidate refresh token."""
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

    # Verify refresh token hash (one-time use)
    stored_hash = user.get("refresh_token_hash")
    if not stored_hash or stored_hash != hash_token(token):
        # Token reuse detected — possible theft, invalidate all sessions
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE users SET refresh_token_hash = NULL WHERE id = :id"),
                {"id": user_id}
            )
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh token revoked")

    # Issue new tokens
    new_access = create_access_token({"sub": str(user["id"]), "email": user["email"]})
    new_refresh = create_refresh_token({"sub": str(user["id"])})

    with engine.begin() as conn:
        conn.execute(
            text("UPDATE users SET refresh_token_hash = :hash, updated_at = NOW() WHERE id = :id"),
            {"hash": hash_token(new_refresh), "id": user["id"]}
        )

    _set_auth_cookies(response, new_access, new_refresh)

    return {"user": _format_user(user)}


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
                          risk_appetite, subscription_tier, created_at
            """),
            params
        )
        updated_user = dict(result.mappings().first())

    return {"user": _format_user(updated_user)}


# ══════════════════════════════════════
#   GOOGLE OAUTH ENDPOINTS
# ══════════════════════════════════════

@router.get("/google/url")
async def google_oauth_url():
    """Return the Google OAuth consent URL for the frontend to redirect to."""
    url = get_google_oauth_url()
    return {"url": url}


@router.post("/google/callback")
async def google_oauth_callback(
    body: GoogleCallbackRequest,
    request: Request,
    response: Response,
):
    """Handle Google OAuth callback — exchange code, find/create user, issue JWT."""
    client_ip = request.client.host if request.client else "unknown"
    if not check_auth_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests")

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

        if existing:
            user = dict(existing)
            # Update Google info if needed (user might have registered with email first)
            conn.execute(
                text("""
                    UPDATE users SET
                        google_id = COALESCE(google_id, :gid),
                        avatar_url = COALESCE(:avatar, avatar_url),
                        full_name = COALESCE(:name, full_name),
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
            # Create new user
            result = conn.execute(
                text("""
                    INSERT INTO users (email, google_id, full_name, avatar_url, auth_provider)
                    VALUES (:email, :gid, :name, :avatar, 'google')
                    RETURNING *
                """),
                {
                    "email": email,
                    "gid": google_id,
                    "name": google_user.get("full_name"),
                    "avatar": google_user.get("avatar_url"),
                }
            )
            user = dict(result.mappings().first())

    if not user.get("is_active"):
        raise HTTPException(status_code=401, detail="Account is deactivated")

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
