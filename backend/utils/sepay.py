"""
SePay integration utilities for DongAnh Capital.

Handles:
- VietQR URL generation for bank transfer payments
- Webhook signature verification (HMAC-SHA256)
- Order code generation/parsing
- Payment amount configuration per plan/period

SePay docs: https://my.sepay.vn/docs
"""

import os
import hmac
import hashlib
import time
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ── Configuration ──
SEPAY_API_TOKEN = os.getenv("SEPAY_API_TOKEN", "")
SEPAY_WEBHOOK_SECRET = os.getenv("SEPAY_WEBHOOK_SECRET", "")

# Bank account info for VietQR
BANK_ID = os.getenv("SEPAY_BANK_ID", "MB")  # MB Bank
BANK_ACCOUNT_NO = os.getenv("SEPAY_BANK_ACCOUNT_NO", "")
BANK_ACCOUNT_NAME = os.getenv("SEPAY_BANK_ACCOUNT_NAME", "DONG ANH CAPITAL")

# ── Pricing Configuration (VND) ──
PRICING = {
    "pro": {
        "monthly": 199_000,
        "yearly": 1_990_000,
    },
    "premium": {
        "monthly": 499_000,
        "yearly": 4_990_000,
    },
}

# Order expiry (seconds)
ORDER_EXPIRY_SECONDS = 30 * 60  # 30 minutes


def get_price(plan: str, period: str) -> int:
    """Get the price in VND for a given plan and period."""
    plan_prices = PRICING.get(plan)
    if not plan_prices:
        raise ValueError(f"Invalid plan: {plan}")
    price = plan_prices.get(period)
    if price is None:
        raise ValueError(f"Invalid period: {period}")
    return price


def generate_order_code(user_id: str) -> str:
    """Generate a unique, short order code for payment matching.
    
    Format: DAC{timestamp_base36}{user_suffix}
    Example: DAC1A2B3C4X7
    
    This code is used as the bank transfer description (nội dung chuyển khoản)
    so SePay's webhook can match the transaction to the order.
    """
    ts = int(time.time())
    # Convert timestamp to base36 for compactness
    ts_b36 = _int_to_base36(ts)
    # Take last 4 chars of user_id for uniqueness
    user_suffix = user_id.replace("-", "")[-4:].upper()
    return f"DAC{ts_b36}{user_suffix}"


def _int_to_base36(num: int) -> str:
    """Convert integer to base36 string."""
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    if num == 0:
        return "0"
    result = []
    while num:
        result.append(chars[num % 36])
        num //= 36
    return "".join(reversed(result))


def generate_vietqr_url(
    amount: int,
    order_code: str,
    template: str = "compact2",
) -> str:
    """Generate a VietQR URL for the payment.
    
    Uses the VietQR open API to generate a QR code image URL.
    The QR contains: bank, account number, amount, and transfer description.
    
    Docs: https://vietqr.io/danh-sach-api/link-tao-nhanh
    """
    if not BANK_ACCOUNT_NO:
        logger.warning("SEPAY_BANK_ACCOUNT_NO not configured")
        return ""

    # VietQR quick-link format
    # https://img.vietqr.io/image/{bankId}-{accountNo}-{template}.png?amount={amount}&addInfo={description}&accountName={name}
    import urllib.parse

    description = urllib.parse.quote(order_code)
    account_name = urllib.parse.quote(BANK_ACCOUNT_NAME)

    return (
        f"https://img.vietqr.io/image/"
        f"{BANK_ID}-{BANK_ACCOUNT_NO}-{template}.png"
        f"?amount={amount}"
        f"&addInfo={description}"
        f"&accountName={account_name}"
    )


def get_payment_details(amount: int, order_code: str) -> dict:
    """Get all payment details for display to user."""
    return {
        "bank_name": "MB Bank (Ngân hàng Quân đội)",
        "bank_id": BANK_ID,
        "account_no": BANK_ACCOUNT_NO,
        "account_name": BANK_ACCOUNT_NAME,
        "amount": amount,
        "amount_formatted": f"{amount:,.0f} VND",
        "description": order_code,
        "qr_url": generate_vietqr_url(amount, order_code),
    }


# ── Webhook Verification ──

def verify_webhook_signature(payload_body: bytes, signature: str) -> bool:
    """Verify SePay webhook HMAC-SHA256 signature.
    
    SePay sends the signature in the `Authorization` header as:
    `Apikey {your_api_key}` or uses a webhook secret for HMAC.
    
    This function supports both:
    1. Simple API key matching
    2. HMAC-SHA256 signature verification
    """
    if not SEPAY_WEBHOOK_SECRET:
        logger.warning("SEPAY_WEBHOOK_SECRET not configured, skipping verification")
        return False

    # Method 1: Simple API key match (SePay default)
    if signature == SEPAY_WEBHOOK_SECRET:
        return True

    # Method 2: HMAC-SHA256
    try:
        expected = hmac.new(
            SEPAY_WEBHOOK_SECRET.encode("utf-8"),
            payload_body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)
    except Exception as e:
        logger.error(f"Webhook signature verification error: {e}")
        return False


def extract_order_code_from_description(description: str) -> str:
    """Extract the DAC order code from a bank transfer description.
    
    Bank transfer descriptions can contain extra text added by the bank.
    We need to find the DAC{...} pattern in the full description.
    """
    if not description:
        return ""

    import re
    # Match DAC followed by alphanumeric chars (our order code format)
    match = re.search(r'(DAC[A-Z0-9]{8,16})', description.upper())
    if match:
        return match.group(1)
    return ""


def get_subscription_duration_days(period: str) -> int:
    """Get subscription duration in days for a given period."""
    if period == "monthly":
        return 30
    elif period == "yearly":
        return 365
    else:
        raise ValueError(f"Invalid period: {period}")
