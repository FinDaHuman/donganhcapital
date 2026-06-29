"""Premium PDF Reports router — tier-gated, R2-backed.

Gating: every route requires login (``get_current_user`` → 401) AND a subscription
tier in ``REPORTS_ALLOWED_TIERS`` (beta: pro+premium; later: premium) → 403.
The gate is re-checked on the download-URL route, not just the list.

Resilience: the PDF bytes live in Cloudflare R2 and are NEVER streamed through
this 0.1 vCPU box — the download route mints a short-TTL presigned GET URL that the
browser opens directly. Any R2 failure / missing config maps to 503 (never 500), so
the rest of the API keeps working if R2 is down. The blocking boto3 presign call
runs via ``asyncio.to_thread``.
"""

import re
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Query, Depends

from routers.auth import get_current_user
from utils.security import effective_tier, report_allowed_tiers
from db.report_queries import list_reports, get_report_object
from db.r2 import presign_get

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reports", tags=["reports"])

_UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")
_TICKER_RE = re.compile(r"^[A-Za-z0-9]{1,20}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


async def limit_concurrency():
    """Share main's global request semaphore (lazy import avoids circular import)."""
    from main import concurrency_limiter
    await concurrency_limiter.acquire()
    try:
        yield
    finally:
        concurrency_limiter.release()


async def require_report_access(request: Request) -> dict:
    """Auth + tier gate. Returns the user dict, or raises 401 / 403."""
    user = await get_current_user(request)  # 401 if unauthenticated
    if effective_tier(user) not in report_allowed_tiers():
        raise HTTPException(status_code=403, detail="This feature requires a Premium subscription")
    return user


@router.get("")
async def list_reports_endpoint(
    request: Request,
    stock: Optional[str] = None,
    sector: Optional[str] = None,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=200),
    _concurrency=Depends(limit_concurrency),
):
    """List active reports (metadata only — no presigned URLs). Tier-gated."""
    await require_report_access(request)

    if stock and not _TICKER_RE.match(stock):
        raise HTTPException(status_code=422, detail="Invalid stock")
    if date_from and not _DATE_RE.match(date_from):
        raise HTTPException(status_code=422, detail="date_from must be YYYY-MM-DD")
    if date_to and not _DATE_RE.match(date_to):
        raise HTTPException(status_code=422, detail="date_to must be YYYY-MM-DD")

    try:
        reports = await asyncio.to_thread(
            list_reports, stock, sector, date_from, date_to, limit
        )
    except Exception as e:
        logger.error(f"Report list error: {e}")
        raise HTTPException(status_code=503, detail="Reports temporarily unavailable")

    return {"count": len(reports), "reports": reports}


@router.get("/{report_id}/url")
async def report_download_url(
    report_id: str,
    request: Request,
    disposition: str = Query("inline", pattern="^(inline|attachment)$"),
    _concurrency=Depends(limit_concurrency),
):
    """Mint a short-TTL presigned URL for one report. Re-checks the tier gate."""
    await require_report_access(request)

    if not _UUID_RE.match(report_id):
        raise HTTPException(status_code=422, detail="Invalid report id")

    try:
        obj = await asyncio.to_thread(get_report_object, report_id)
    except Exception as e:
        logger.error(f"Report lookup error: {e}")
        raise HTTPException(status_code=503, detail="Reports temporarily unavailable")

    if obj is None:
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        url = await asyncio.to_thread(
            presign_get,
            obj["object_key"],
            disposition=disposition,
            filename=obj["file_name"],
            ttl=180,
        )
    except Exception as e:
        logger.error(f"R2 presign error: {e}")
        url = None

    if not url:
        # R2 unconfigured or errored — never 500; core API stays up.
        raise HTTPException(status_code=503, detail="Report storage temporarily unavailable")

    return {"url": url, "expires_in": 180}
