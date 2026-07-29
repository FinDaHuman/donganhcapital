"""Legal/compliance primitives shared across the API.

Deliberately dependency-free (stdlib only) and importing nothing from other
``utils`` modules — ``mailer`` imports *this* for unsubscribe tokens, so any
import in the other direction would be circular.

Three unrelated jobs live here because they share one property: they must be
identical everywhere they are used.

1. ``LEGAL_VERSIONS`` — mirrors ``frontend/src/legal/versions.js``. Registration
   posts a version and we reject a mismatch, so a stale cached SPA fails loudly
   instead of recording consent against a superseded document.
2. ``NOTICE`` / ``CHAT_DISCLAIMER`` — the "not investment advice" text. Attached
   server-side so it cannot be omitted by a model or forgotten by a component.
3. ``hash_ip`` and the unsubscribe token helpers.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os

logger = logging.getLogger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://www.donganhcapital.com").rstrip("/")
# Public origin of this API, used to build unsubscribe links that are clicked
# from a mail client (so they cannot be relative).
PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "https://api.donganhcapital.com").rstrip("/")
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "support@donganhcapital.com")


# --------------------------------------------------------------------------- #
# Document versions
# --------------------------------------------------------------------------- #

# Keep equal to frontend/src/legal/versions.js. Bumping a value here re-prompts
# every user through the re-consent modal.
LEGAL_VERSIONS = {
    "terms": "2026-08-01",
    "privacy": "2026-08-01",
    "disclaimer": "2026-08-01",
    "cookies": "2026-08-01",
}


# --------------------------------------------------------------------------- #
# Disclaimers
# --------------------------------------------------------------------------- #

DISCLAIMER_VI = (
    "Thông tin trên chỉ mang tính tham khảo, là kết quả thống kê của mô hình máy học, "
    "KHÔNG phải khuyến nghị mua/bán chứng khoán và không phải lời khuyên đầu tư. "
    "Đầu tư chứng khoán có rủi ro mất vốn. Quyết định đầu tư là của riêng bạn."
)

DISCLAIMER_EN = (
    "Informational only. These are statistical outputs of a machine-learning model, "
    "not a recommendation to buy or sell securities and not investment advice. "
    "Investing carries the risk of capital loss. Any decision is your own."
)

#: Machine-readable notice attached to dict-returning market endpoints.
NOTICE = {
    "type": "not_investment_advice",
    "version": LEGAL_VERSIONS["disclaimer"],
    "text_vi": DISCLAIMER_VI,
    "text_en": DISCLAIMER_EN,
    "url": f"{FRONTEND_URL}/disclaimer",
}

#: Header variant. HTTP headers are latin-1, so this must stay ASCII-only —
#: the Vietnamese text would raise UnicodeEncodeError on the way out.
NOTICE_HEADER = "Informational only; not investment advice. See /disclaimer"

#: Appended server-side to every chat reply. Leading newlines separate it from
#: the model's own text; plain text only, because the chat renderer handles just
#: ``**bold**`` and ``* `` lists.
CHAT_DISCLAIMER = (
    "\n\nLưu ý: Nội dung trên do AI tạo ra dựa trên dữ liệu quá khứ, chỉ mang tính "
    "tham khảo và KHÔNG phải khuyến nghị mua/bán. Đầu tư chứng khoán có rủi ro mất vốn. "
    "Quyết định đầu tư là của riêng bạn."
)


def with_notice(payload):
    """Attach :data:`NOTICE` to a dict payload, returning a shallow copy.

    The copy matters: ``get_cached`` in ``main.py`` stores the raw computed value,
    so mutating in place would leak the notice into the cached object and alias it
    across requests. Always wrap *outside* the cache call::

        return with_notice(get_cached(key, ttl, compute))

    Non-dict payloads (the list-returning endpoints) pass through untouched —
    turning a list into a dict would break the frontend contract.
    """
    if isinstance(payload, dict):
        return {**payload, "notice": NOTICE}
    return payload


# --------------------------------------------------------------------------- #
# IP hashing
# --------------------------------------------------------------------------- #

# Dedicated salt, deliberately NOT JWT_SECRET_KEY: rotating the JWT secret must
# not silently invalidate consent evidence.
_CONSENT_IP_SALT = os.getenv("CONSENT_IP_SALT", "")
if not _CONSENT_IP_SALT:
    logger.warning(
        "CONSENT_IP_SALT is unset - consent IP hashes will not be recorded. "
        "Set a long random value to retain proof-of-consent metadata."
    )


def hash_ip(ip: str | None) -> str | None:
    """Salted SHA-256 of a client IP, or ``None`` if unavailable.

    We store this rather than the raw address: it still lets you check whether a
    consent event came from the same client as a login, without adding a new
    category of retained personal data that the privacy policy would then have to
    declare and time-limit. The salt is mandatory — an unsalted hash of an IPv4
    address is brute-forceable in seconds.
    """
    if not ip or ip == "unknown" or not _CONSENT_IP_SALT:
        return None
    return hashlib.sha256(f"{_CONSENT_IP_SALT}:{ip}".encode()).hexdigest()


def hash_email(email: str | None) -> str | None:
    """SHA-256 of a lowercased email, for consent rows that outlive anonymisation."""
    if not email:
        return None
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()


# --------------------------------------------------------------------------- #
# Unsubscribe tokens
# --------------------------------------------------------------------------- #

_UNSUB_SECRET = os.getenv("UNSUBSCRIBE_SECRET", "")
if not _UNSUB_SECRET:
    logger.warning(
        "UNSUBSCRIBE_SECRET is unset - unsubscribe links will not be generated. "
        "Set a long random value to enable one-click unsubscribe."
    )


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign_unsubscribe_token(email: str, scope: str = "marketing") -> str | None:
    """Stateless unsubscribe token: no DB lookup, no expiry.

    Deliberately never expires — a ``List-Unsubscribe`` header has to keep working
    for as long as the message exists in someone's mailbox. The token confers only
    the power to unsubscribe; it is never an authentication credential.
    """
    if not _UNSUB_SECRET or not email:
        return None
    payload = _b64(f"{scope}:{email.strip().lower()}".encode())
    sig = hmac.new(_UNSUB_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{payload}.{sig}"


def verify_unsubscribe_token(token: str | None) -> tuple[str, str] | None:
    """Return ``(scope, email)`` for a valid token, else ``None``."""
    if not _UNSUB_SECRET or not token or "." not in token:
        return None
    payload, _, sig = token.rpartition(".")
    expected = hmac.new(_UNSUB_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        scope, _, email = _unb64(payload).decode().partition(":")
    except (ValueError, UnicodeDecodeError):
        return None
    if not email:
        return None
    return scope, email


def unsubscribe_url(email: str, scope: str = "marketing") -> str | None:
    """Absolute one-click unsubscribe URL, or ``None`` if tokens are disabled."""
    token = sign_unsubscribe_token(email, scope)
    return f"{PUBLIC_API_URL}/api/unsubscribe?token={token}" if token else None
