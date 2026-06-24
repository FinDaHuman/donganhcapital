"""
Transactional email for DongAnh Capital.

Sends mail through the Resend HTTP API (https://resend.com) using httpx —
NOT SMTP, because outbound SMTP ports are commonly blocked/throttled on PaaS
hosts like Render. The HTTP API is more reliable on the free tier.

Cloudflare is NOT used to send mail (it cannot). Cloudflare only hosts the DNS
records (SPF / DKIM / DMARC) that authorise Resend to send as our domain.
See EMAIL_SETUP.md for the one-time DNS setup.

Design notes:
  - send_email() is async and intended to be fired via FastAPI BackgroundTasks
    so a slow network call never holds a request's Semaphore(5) slot on the
    0.1-vCPU Render box.
  - It never raises: a failed send is logged and swallowed. Callers (e.g. the
    forgot-password flow) must not leak send success/failure to the client.
  - If RESEND_API_KEY is unset (e.g. local dev), it logs and no-ops so the rest
    of the app keeps working.
"""

import os
import html
import logging

import httpx

logger = logging.getLogger(__name__)

# ── Configuration ──
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
# Must be an address at a domain verified in Resend. Display name is allowed.
EMAIL_FROM = os.getenv("EMAIL_FROM", "DongAnh Capital <noreply@donganhcapital.com>")
# Public origin of the React app — used to build links inside emails.
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://donganhcapital.com").rstrip("/")
# Where users can reach a human (your Cloudflare Email Routing forwards this to Gmail).
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "support@donganhcapital.com")

RESEND_API_URL = "https://api.resend.com/emails"

GOLD = "#C9A96E"


# ══════════════════════════════════════
#   CORE SENDER
# ══════════════════════════════════════
async def send_email(to: str, subject: str, html_body: str, text_body: str | None = None) -> bool:
    """Send one email via Resend. Returns True on success, False otherwise.

    Never raises — safe to call from a BackgroundTask.
    """
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping email '%s' to %s", subject, to)
        return False

    payload = {
        "from": EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "html": html_body,
    }
    if text_body:
        payload["text"] = text_body

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                RESEND_API_URL,
                json=payload,
                headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            )
        if resp.status_code >= 400:
            logger.error("Resend send failed (%s) for %s: %s", resp.status_code, to, resp.text)
            return False
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception as e:  # network error, timeout, etc. — never crash the request flow
        logger.error("Resend send error for %s: %s", to, e)
        return False


# ══════════════════════════════════════
#   BRAND TEMPLATE WRAPPER
# ══════════════════════════════════════
def _wrap(heading: str, body_html: str) -> str:
    """Wrap inner HTML in the branded responsive email shell.

    Email clients require inline styles and a light background — they routinely
    strip <style> blocks and force light mode — so this uses a white card with a
    gold accent rather than the app's dark theme.
    """
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;">
        <tr><td style="height:4px;background:linear-gradient(90deg,#1a1a1a,{GOLD},#1a1a1a);"></td></tr>
        <tr><td style="padding:32px 40px 8px 40px;text-align:center;">
          <div style="font-size:18px;font-weight:700;letter-spacing:2px;color:#1a1a1a;text-transform:uppercase;">
            DongAnh<span style="color:{GOLD};"> Capital</span>
          </div>
        </td></tr>
        <tr><td style="padding:16px 40px 8px 40px;">
          <h1 style="margin:0 0 16px 0;font-size:22px;color:#1a1a1a;font-weight:600;">{heading}</h1>
          {body_html}
        </td></tr>
        <tr><td style="padding:24px 40px 36px 40px;border-top:1px solid #f0f0f0;">
          <p style="margin:16px 0 0 0;font-size:12px;line-height:18px;color:#9ca3af;">
            Need help? Contact us at
            <a href="mailto:{SUPPORT_EMAIL}" style="color:{GOLD};text-decoration:none;">{SUPPORT_EMAIL}</a>.<br>
            &copy; DongAnh Capital · Vietnamese equities market intelligence.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _button(label: str, url: str) -> str:
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">'
        f'<tr><td style="border-radius:10px;background-color:{GOLD};">'
        f'<a href="{url}" style="display:inline-block;padding:13px 32px;font-size:15px;'
        f'font-weight:600;color:#1a1a1a;text-decoration:none;border-radius:10px;">{label}</a>'
        f'</td></tr></table>'
    )


# ══════════════════════════════════════
#   TEMPLATES
# ══════════════════════════════════════
async def send_password_reset_email(to: str, reset_url: str, full_name: str | None = None) -> bool:
    """Password reset link for an email/password account."""
    name = html.escape(full_name.strip()) if full_name else "there"
    body = f"""
      <p style="margin:0 0 12px 0;font-size:15px;line-height:24px;color:#3f3f46;">Hi {name},</p>
      <p style="margin:0 0 4px 0;font-size:15px;line-height:24px;color:#3f3f46;">
        We received a request to reset the password for your DongAnh Capital account.
        Click the button below to choose a new password. This link expires in
        <strong>60 minutes</strong> and can be used only once.
      </p>
      {_button("Reset Password", reset_url)}
      <p style="margin:0 0 8px 0;font-size:13px;line-height:20px;color:#71717a;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="{reset_url}" style="color:{GOLD};word-break:break-all;">{reset_url}</a>
      </p>
      <p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#71717a;">
        If you didn't request this, you can safely ignore this email — your password
        won't change.
      </p>
    """
    text = (
        f"Hi {full_name or 'there'},\n\n"
        "We received a request to reset your DongAnh Capital password.\n"
        f"Reset it here (expires in 60 minutes, single use):\n{reset_url}\n\n"
        "If you didn't request this, ignore this email — your password won't change."
    )
    return await send_email(to, "Reset your DongAnh Capital password", _wrap("Reset your password", body), text)


async def send_google_account_notice_email(to: str, full_name: str | None = None) -> bool:
    """Sent when someone requests a reset for a Google-only account (no password set).

    Avoids confusion ("why didn't my reset link arrive?") without revealing account
    existence to anyone but the real inbox owner.
    """
    name = html.escape(full_name.strip()) if full_name else "there"
    login_url = f"{FRONTEND_URL}/login"
    body = f"""
      <p style="margin:0 0 12px 0;font-size:15px;line-height:24px;color:#3f3f46;">Hi {name},</p>
      <p style="margin:0 0 4px 0;font-size:15px;line-height:24px;color:#3f3f46;">
        Someone asked to reset the password for this email. This account was created
        with <strong>Google Sign-In</strong>, so it doesn't have a password to reset.
        Just sign in with the "Continue with Google" button.
      </p>
      {_button("Sign in with Google", login_url)}
      <p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#71717a;">
        If you didn't request this, you can safely ignore this email.
      </p>
    """
    text = (
        f"Hi {full_name or 'there'},\n\n"
        "Someone asked to reset the password for this email, but this account uses "
        "Google Sign-In and has no password. Just sign in with Google:\n"
        f"{login_url}\n\nIf you didn't request this, ignore this email."
    )
    return await send_email(to, "Sign in to DongAnh Capital with Google", _wrap("Use Google to sign in", body), text)


async def send_purchase_confirmation_email(
    to: str,
    plan: str,
    period: str,
    amount: float,
    expires_at: str,
    order_code: str,
    full_name: str | None = None,
) -> bool:
    """Receipt / confirmation after a successful subscription payment."""
    name = html.escape(full_name.strip()) if full_name else "there"
    plan_label = html.escape(plan.title())
    period_label = html.escape(period.title())
    amount_fmt = f"{amount:,.0f} VND"
    dashboard_url = f"{FRONTEND_URL}/dashboard"

    def _row(label, value):
        return (
            f'<tr><td style="padding:8px 0;font-size:14px;color:#71717a;">{label}</td>'
            f'<td style="padding:8px 0;font-size:14px;color:#1a1a1a;font-weight:600;text-align:right;">{value}</td></tr>'
        )

    body = f"""
      <p style="margin:0 0 12px 0;font-size:15px;line-height:24px;color:#3f3f46;">Hi {name},</p>
      <p style="margin:0 0 4px 0;font-size:15px;line-height:24px;color:#3f3f46;">
        Thank you for subscribing! Your <strong>{plan_label} ({period_label})</strong>
        plan is now active. Here are your order details:
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-top:1px solid #f0f0f0;">
        {_row("Plan", f"{plan_label} · {period_label}")}
        {_row("Amount paid", amount_fmt)}
        {_row("Order code", html.escape(order_code))}
        {_row("Active until", html.escape(expires_at))}
      </table>
      {_button("Go to Dashboard", dashboard_url)}
      <p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#71717a;">
        Keep this email as your receipt. You can view your full payment history any
        time from your profile.
      </p>
    """
    text = (
        f"Hi {full_name or 'there'},\n\n"
        f"Thank you for subscribing! Your {plan_label} ({period_label}) plan is now active.\n\n"
        f"Plan: {plan_label} - {period_label}\n"
        f"Amount paid: {amount_fmt}\n"
        f"Order code: {order_code}\n"
        f"Active until: {expires_at}\n\n"
        f"Go to your dashboard: {dashboard_url}"
    )
    return await send_email(
        to,
        f"Your DongAnh Capital {plan_label} subscription is active",
        _wrap("Subscription confirmed", body),
        text,
    )


async def send_verification_email(to: str, verify_url: str, full_name: str | None = None) -> bool:
    """Email verification link sent immediately after email/password registration."""
    name = html.escape(full_name.strip()) if full_name else "there"
    body = f"""
      <p style="margin:0 0 12px 0;font-size:15px;line-height:24px;color:#3f3f46;">Hi {name},</p>
      <p style="margin:0 0 4px 0;font-size:15px;line-height:24px;color:#3f3f46;">
        Welcome to DongAnh Capital! Please verify your email address to unlock
        all features, including the free <strong>1-week Pro trial</strong>.
        This link expires in <strong>24 hours</strong>.
      </p>
      {_button("Verify Email Address", verify_url)}
      <p style="margin:0 0 8px 0;font-size:13px;line-height:20px;color:#71717a;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="{verify_url}" style="color:{GOLD};word-break:break-all;">{verify_url}</a>
      </p>
      <p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#71717a;">
        If you didn't create this account, you can safely ignore this email.
      </p>
    """
    text = (
        f"Hi {full_name or 'there'},\n\n"
        "Welcome to DongAnh Capital! Please verify your email address to unlock "
        "all features, including the free 1-week Pro trial.\n\n"
        f"Verify here (expires in 24 hours):\n{verify_url}\n\n"
        "If you didn't create this account, ignore this email."
    )
    return await send_email(
        to,
        "Verify your DongAnh Capital email address",
        _wrap("Verify your email", body),
        text,
    )


async def send_trial_started_email(
    to: str,
    expires_at: str,
    full_name: str | None = None,
) -> bool:
    """Welcome email after a user claims the free 1-week Pro trial."""
    name = html.escape(full_name.strip()) if full_name else "there"
    dashboard_url = f"{FRONTEND_URL}/dashboard"
    body = f"""
      <p style="margin:0 0 12px 0;font-size:15px;line-height:24px;color:#3f3f46;">Hi {name},</p>
      <p style="margin:0 0 4px 0;font-size:15px;line-height:24px;color:#3f3f46;">
        Your free <strong>1-week Pro trial</strong> is now active. You have full
        access to every Pro feature until <strong>{html.escape(expires_at)}</strong>
        — no card required.
      </p>
      {_button("Explore Pro features", dashboard_url)}
      <p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#71717a;">
        When the trial ends, your account returns to the Free plan automatically —
        you won't be charged. Upgrade any time to keep your Pro access.
      </p>
    """
    text = (
        f"Hi {full_name or 'there'},\n\n"
        "Your free 1-week Pro trial is now active! You have full access to every "
        f"Pro feature until {expires_at} — no card required.\n\n"
        f"Explore Pro: {dashboard_url}\n\n"
        "When the trial ends, your account returns to the Free plan automatically. "
        "You won't be charged. Upgrade any time to keep Pro."
    )
    return await send_email(
        to,
        "Your free DongAnh Capital Pro trial is active",
        _wrap("Welcome to Pro", body),
        text,
    )
