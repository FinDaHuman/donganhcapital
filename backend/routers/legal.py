"""Public legal endpoints: unsubscribe, subscription confirmation, doc versions.

Unauthenticated by design — these links are clicked out of a mail client, where
there is no session and no JavaScript. They return HTML rather than JSON for the
same reason.
"""

import hashlib
import logging

from fastapi import APIRouter, Request, Query
from fastapi.responses import HTMLResponse

from db.queries import confirm_subscriber, unsubscribe_email_address
from utils.legal import LEGAL_VERSIONS, verify_unsubscribe_token, FRONTEND_URL

logger = logging.getLogger(__name__)

router = APIRouter(tags=["legal"])


def _page(title: str, message: str, ok: bool = True) -> HTMLResponse:
    """Minimal self-contained confirmation page.

    No external CSS or fonts: this renders inside a mail client's browser view,
    often with a slow or restricted network.
    """
    accent = "#4DB882" if ok else "#ef4444"
    return HTMLResponse(f"""<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>{title} — DongAnh Capital</title></head>
<body style="margin:0;padding:0;background:#0A1020;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;">
<div style="max-width:480px;margin:12vh auto;padding:32px;background:#111827;border:1px solid rgba(201,169,110,.2);border-radius:16px;text-align:center;">
  <div style="font-size:16px;font-weight:700;letter-spacing:2px;color:#e5e7eb;text-transform:uppercase;margin-bottom:24px;">
    DongAnh<span style="color:#C9A96E;"> Capital</span>
  </div>
  <h1 style="margin:0 0 12px;font-size:20px;color:{accent};font-weight:600;">{title}</h1>
  <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#9ca3af;">{message}</p>
  <a href="{FRONTEND_URL}" style="display:inline-block;padding:11px 26px;background:#C9A96E;color:#0A1020;
     text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">Về trang chủ</a>
</div>
</body></html>""")


# GET and POST: RFC 8058 one-click unsubscribe sends a POST, while a human
# clicking the visible footer link sends a GET. Both must work.
@router.api_route("/api/unsubscribe", methods=["GET", "POST"])
async def unsubscribe(request: Request, token: str = Query(...)):
    """Remove an address from all non-transactional email."""
    parsed = verify_unsubscribe_token(token)
    if not parsed:
        return _page(
            "Liên kết không hợp lệ",
            "Liên kết huỷ đăng ký này không hợp lệ hoặc đã hỏng. "
            "Vui lòng liên hệ support@donganhcapital.com để được hỗ trợ.",
            ok=False,
        )

    _scope, email = parsed
    unsubscribe_email_address(email)
    logger.info("unsubscribed via token: %s", email)
    return _page(
        "Đã huỷ đăng ký",
        "Bạn sẽ không nhận thêm email giới thiệu hay khảo sát từ chúng tôi. "
        "Các email cần thiết cho tài khoản (đặt lại mật khẩu, xác thực email) vẫn được gửi.",
    )


@router.get("/api/subscribe/confirm")
async def confirm_subscription(token: str = Query(..., min_length=16, max_length=128)):
    """Complete a double opt-in subscription."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    if confirm_subscriber(token_hash):
        return _page(
            "Đã xác nhận",
            "Cảm ơn bạn. Chúng tôi sẽ thông báo khi có tính năng mới. "
            "Bạn có thể huỷ đăng ký bất kỳ lúc nào qua liên kết ở cuối mỗi email.",
        )
    return _page(
        "Liên kết đã hết hạn",
        "Liên kết xác nhận này không hợp lệ hoặc đã được sử dụng. "
        "Bạn có thể đăng ký lại trên trang chủ.",
        ok=False,
    )


@router.get("/api/legal/versions")
async def legal_versions():
    """Current version of each legal document.

    For anonymous visitors and operational sanity checks. Signed-in clients get
    `needs_reconsent` on /api/auth/me instead and must not poll this.
    """
    return {"versions": LEGAL_VERSIONS, "disclaimer_url": f"{FRONTEND_URL}/disclaimer"}
