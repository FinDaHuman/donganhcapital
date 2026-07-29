"""
Security utilities for DongAnh Capital authentication.

Implements:
- JWT token creation/verification (HS256 with httpOnly cookies)
- Password hashing (bcrypt, cost=12)
- Google OAuth token verification
- CSRF protection
- Rate limiting for auth endpoints
- Account lockout logic
"""

import os
import time
import hashlib
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

from jose import jwt, JWTError
from passlib.context import CryptContext

logger = logging.getLogger(__name__)

# ── Configuration ──
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    JWT_SECRET_KEY = secrets.token_urlsafe(64)
    logger.critical(
        "FATAL: JWT_SECRET_KEY is not set. Using a randomly generated key — "
        "ALL user sessions will be invalidated on every server restart. "
        "Set JWT_SECRET_KEY in Render environment variables immediately."
    )
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # 60 min > Render free-tier sleep window (15 min)
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Shared secret injected by a Cloudflare Transform Rule on api.donganhcapital.com.
# Its only job is to prove a request actually came through the edge — see
# get_client_ip below for why that matters. Unset (the default) keeps the old
# permissive behaviour so the backend can ship before the Cloudflare rule exists.
EDGE_SHARED_SECRET = os.getenv("EDGE_SHARED_SECRET", "").strip()
EDGE_SECRET_HEADER = "x-dac-edge"

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "https://donganhcapital.com/auth/google/callback"
)

# ── Password Hashing ──
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12  # Cost factor 12 for strong security
)


def hash_password(password: str) -> str:
    """Hash a password with bcrypt (cost=12)."""
    return pwd_context.hash(password)


# Precomputed once at import. Used by the login flow to run a bcrypt verify even
# when the email doesn't exist, so a non-existent account takes the same time as a
# real one — closing the timing side-channel that would otherwise let an attacker
# enumerate registered emails by response latency.
DUMMY_PASSWORD_HASH = pwd_context.hash("dummy-password-for-constant-time-login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


# ── JWT Token Management ──
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a short-lived JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """Create a long-lived JWT refresh token (7 days)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({
        "exp": expire,
        "type": "refresh",
        "jti": secrets.token_urlsafe(32),  # Unique token ID for rotation
    })
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str, verify_exp: bool = True) -> Optional[dict]:
    """Decode and verify a JWT token. Returns None if invalid/expired.

    Set ``verify_exp=False`` to accept an expired (but signature-valid) token —
    used only to recover the subject for server-side revocation at logout, never
    to authorize a request.
    """
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"verify_exp": verify_exp},
        )
        return payload
    except JWTError:
        return None


def hash_token(token: str) -> str:
    """Hash a token for storage (refresh token rotation)."""
    return hashlib.sha256(token.encode()).hexdigest()


# ── Feature access ──
# There are no paid tiers. DongAnh Capital is a non-commercial academic project:
# it has no registered business entity, so it cannot lawfully sell a
# subscription, and the payments router is no longer mounted. Access is
# therefore a single question — is this a signed-in account with a verified
# email? The subscription_* columns remain on `users` but no longer gate
# anything; they are retained so the paid flow can be restored if an entity is
# ever registered.
#
# BYPASS_PAYMENT is kept as an always-true constant purely so that any straggling
# import does not break; it is not read from the environment any more.
BYPASS_PAYMENT = True

# Daily quota for chatbot + news analysis, shared by every account.
BYPASS_DAILY_LIMIT = 5


def has_feature_access(user: dict) -> bool:
    """Can this user reach the gated features (signals, reports, chat)?

    Signed in with a verified email is the whole test. Email verification is
    what stops a throwaway address from consuming the Gemini and vnstock quotas
    that the free-tier infrastructure depends on.
    """
    return bool(user.get("email_verified"))


# ── Subscription Tier Gating ──
def effective_tier(user: dict) -> str:
    """Return the user's currently-effective subscription tier.

    The background downgrade task only runs every ~6h, so a row can still read
    ``pro``/``premium`` after expiry. This re-checks ``subscription_expires_at``
    inline (UTC-aware) and treats an expired subscription as ``free`` — mirroring
    the logic in ``main.py`` ``/api/ltr-signals``.
    """
    tier = user.get("subscription_tier", "free")
    expires_at = user.get("subscription_expires_at")
    if tier != "free" and expires_at is not None:
        try:
            now_utc = datetime.now(timezone.utc)
            exp = expires_at if hasattr(expires_at, "tzinfo") else datetime.fromisoformat(str(expires_at))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < now_utc:
                tier = "free"
        except Exception:
            pass
    return tier


def report_allowed_tiers() -> set[str]:
    """Tiers allowed to access PDF reports, from ``REPORTS_ALLOWED_TIERS``.

    Reports are Premium-only (the Pro-access beta has ended). Override via the
    ``REPORTS_ALLOWED_TIERS`` env var (e.g. ``pro,premium``) — one env change, no
    code redeploy — if Pro access is ever reopened.
    """
    raw = os.environ.get("REPORTS_ALLOWED_TIERS", "premium")
    return {t.strip() for t in raw.split(",") if t.strip()}


# ── Google OAuth ──
async def verify_google_token(code: str) -> Optional[dict]:
    """
    Exchange Google authorization code for tokens, then verify the ID token.
    Returns user info dict or None.
    
    Flow:
    1. Exchange auth code for tokens via Google's token endpoint
    2. Verify the ID token signature
    3. Extract user info (email, name, picture, sub)
    """
    import httpx

    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        logger.error("Google OAuth credentials not configured")
        return None

    try:
        # Step 1: Exchange authorization code for tokens
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "redirect_uri": GOOGLE_REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

            if token_response.status_code != 200:
                logger.error(f"Google token exchange failed: {token_response.text}")
                return None

            token_data = token_response.json()
            id_token_str = token_data.get("id_token")

            if not id_token_str:
                logger.error("No id_token in Google response")
                return None

            # Step 2: Verify ID token with Google's public keys
            # Using Google's tokeninfo endpoint for simplicity and reliability
            verify_response = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token_str}"
            )

            if verify_response.status_code != 200:
                logger.error(f"Google token verification failed: {verify_response.text}")
                return None

            id_info = verify_response.json()

            # Step 3: Validate claims
            if id_info.get("aud") != GOOGLE_CLIENT_ID:
                logger.error("Google token audience mismatch")
                return None

            if id_info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
                logger.error("Google token issuer mismatch")
                return None

            return {
                "google_id": id_info.get("sub"),
                "email": id_info.get("email"),
                "full_name": id_info.get("name"),
                "avatar_url": id_info.get("picture"),
                "email_verified": id_info.get("email_verified") == "true",
            }

    except Exception as e:
        logger.error(f"Google OAuth error: {e}")
        return None


def get_google_oauth_url(state: Optional[str] = None) -> str:
    """Generate the Google OAuth consent URL."""
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    }
    if state:
        params["state"] = state

    # urlencode, not a manual join: the redirect URI and scope contain characters
    # (":", "/", " ") that must be percent-encoded to survive intact.
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


# ── CSRF Protection ──
def generate_csrf_token() -> str:
    """Generate a cryptographically secure CSRF token."""
    return secrets.token_urlsafe(32)


def verify_csrf_token(token: str, stored_token: str) -> bool:
    """Constant-time comparison of CSRF tokens."""
    return secrets.compare_digest(token, stored_token)


# ── Client IP Resolution ──
def request_from_edge(request) -> bool:
    """True if this request carries the shared secret injected by Cloudflare.

    Returns False whenever ``EDGE_SHARED_SECRET`` is unset — callers must treat
    "unconfigured" and "not from the edge" differently; only ``get_client_ip``
    knows which of the two it is looking at.
    """
    if not EDGE_SHARED_SECRET:
        return False
    presented = request.headers.get(EDGE_SECRET_HEADER, "")
    return secrets.compare_digest(presented, EDGE_SHARED_SECRET)


def edge_header_present(request) -> bool:
    """True if the edge header exists at all, regardless of its value.

    Deliberately independent of ``EDGE_SHARED_SECRET``: this is what makes the
    Cloudflare Transform Rule verifiable *before* enforcement is switched on.
    ``request_from_edge`` cannot serve that purpose — with no secret configured
    there is nothing to compare against, so it always returns False and the
    rollout would have to enable enforcement blind.

    Reveals only that some value arrived, never the header name or the value.
    """
    return bool(request.headers.get(EDGE_SECRET_HEADER))


def get_client_ip(request) -> str:
    """Resolve the real client IP behind the Cloudflare/Render proxy chain.

    When the app is proxied through Cloudflare, the originating client IP is in
    the ``CF-Connecting-IP`` header (``request.client.host`` would otherwise be a
    proxy address, making per-IP rate limiting useless). Falls back to the first
    hop of ``X-Forwarded-For``, then to the direct peer.

    When ``EDGE_SHARED_SECRET`` is set, those headers are trusted only on
    requests carrying the matching ``X-DAC-Edge`` header. This is a *latent*
    safeguard and is off by default — measured against production on 2026-07-29,
    the header-spoofing attack it defends against is not currently reachable:

      - ``donganhcapital.onrender.com`` is itself fronted by Render's Cloudflare,
        which rejects any client-supplied ``CF-Connecting-IP`` with 403 error 1000;
      - that same edge sets a genuine ``CF-Connecting-IP``, and since it is checked
        first, a forged ``X-Forwarded-For`` is never read. Verified empirically:
        7 requests with 7 distinct forged XFF values were rate-limited at 5,
        i.e. all of them shared one bucket.

    Enable it only if that stops being true — if the service ever moves off a
    Cloudflare-fronted origin, direct traffic could set ``X-Forwarded-For``
    freely and every per-IP limit here would become bypassable. Note that a
    peer-address check against Cloudflare's ranges could not substitute: Render's
    load balancer is the direct peer, so ``request.client.host`` is never a
    Cloudflare address.
    """
    trust_proxy_headers = not EDGE_SHARED_SECRET or request_from_edge(request)

    if trust_proxy_headers:
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            return cf_ip.strip()
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()

    return request.client.host if request.client else "unknown"


# ── Rate Limiting (Auth Endpoints) ──
_auth_rate_store: dict[str, list[float]] = {}
AUTH_RATE_LIMIT = 5  # max attempts per window
AUTH_RATE_WINDOW = 300  # 5 minutes
MAX_AUTH_RATE_ENTRIES = 1000


def check_auth_rate_limit(client_ip: str) -> bool:
    """Return True if request is allowed, False if rate-limited."""
    now = time.time()

    # Evict stale entries if map is too large
    if len(_auth_rate_store) >= MAX_AUTH_RATE_ENTRIES:
        stale = [
            ip for ip, ts_list in _auth_rate_store.items()
            if not ts_list or ts_list[-1] < now - AUTH_RATE_WINDOW
        ]
        for ip in stale:
            _auth_rate_store.pop(ip, None)

    timestamps = _auth_rate_store.get(client_ip, [])
    timestamps = [t for t in timestamps if now - t < AUTH_RATE_WINDOW]

    if len(timestamps) >= AUTH_RATE_LIMIT:
        _auth_rate_store[client_ip] = timestamps
        return False

    timestamps.append(now)
    _auth_rate_store[client_ip] = timestamps
    return True


# ── Rate Limiting (identity- and instance-wide) ──
# check_auth_rate_limit above is keyed on the client IP, which an attacker who
# reaches the origin directly can rotate freely. These two limits are keyed on
# things they cannot rotate: the account they are trying to reach, and the
# instance as a whole. They hold even if the Cloudflare edge rule is removed.
_identity_rate_store: dict[str, list[float]] = {}
# Deliberately looser than LOCKOUT_THRESHOLD: failed logins are already capped at
# 5 by account lockout, so this limit's real work is the endpoints with no
# lockout (register, forgot-password, resend-verification, subscribe) plus a
# spoof-proof ceiling everywhere. It counts successful attempts too, so a tight
# value would lock out someone signing in across several devices.
IDENTITY_RATE_LIMIT = 10  # max attempts per window, per email address
IDENTITY_RATE_WINDOW = 900  # 15 minutes

_global_auth_attempts: list[float] = []
GLOBAL_AUTH_LIMIT = 300  # attempts per window across every caller
GLOBAL_AUTH_WINDOW = 300  # 5 minutes


def check_identity_rate_limit(identity: str) -> bool:
    """Return True if allowed, False if this email has been targeted too often.

    Keyed on the address rather than the caller, so spreading an attack across
    thousands of spoofed source IPs does not buy any extra attempts against a
    given account.
    """
    if not identity:
        return True

    key = identity.strip().lower()
    now = time.time()

    if len(_identity_rate_store) >= MAX_AUTH_RATE_ENTRIES:
        stale = [
            ident for ident, ts_list in _identity_rate_store.items()
            if not ts_list or ts_list[-1] < now - IDENTITY_RATE_WINDOW
        ]
        for ident in stale:
            _identity_rate_store.pop(ident, None)

    timestamps = [t for t in _identity_rate_store.get(key, []) if now - t < IDENTITY_RATE_WINDOW]

    if len(timestamps) >= IDENTITY_RATE_LIMIT:
        _identity_rate_store[key] = timestamps
        return False

    timestamps.append(now)
    _identity_rate_store[key] = timestamps
    return True


def check_global_auth_ceiling() -> bool:
    """Return True if allowed, False if the instance-wide auth budget is spent.

    A backstop against distributed spraying: no per-caller key can be rotated to
    escape it. Sized far above anything this project sees organically, so it
    should never fire for real users — if it does, that is the signal.
    """
    global _global_auth_attempts
    now = time.time()

    _global_auth_attempts = [t for t in _global_auth_attempts if now - t < GLOBAL_AUTH_WINDOW]

    if len(_global_auth_attempts) >= GLOBAL_AUTH_LIMIT:
        logger.warning(
            "Global auth ceiling reached (%d attempts in %ds) — possible distributed attack",
            len(_global_auth_attempts), GLOBAL_AUTH_WINDOW,
        )
        return False

    _global_auth_attempts.append(now)
    return True


# ── Account Lockout ──
LOCKOUT_THRESHOLD = 5  # Lock after N failed attempts
LOCKOUT_DURATION_MINUTES = 15


def is_account_locked(failed_attempts: int, locked_until: Optional[datetime]) -> bool:
    """Check if an account is currently locked."""
    if failed_attempts < LOCKOUT_THRESHOLD:
        return False
    if locked_until is None:
        return False
    return datetime.now(timezone.utc) < locked_until


def get_lockout_until() -> datetime:
    """Get the lockout expiry timestamp."""
    return datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
