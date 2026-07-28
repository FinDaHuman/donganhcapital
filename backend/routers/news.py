"""News feed router — login-gated (any tier), read-only CafeF news from MongoDB.

Auth: every route requires a valid session (``get_current_user`` → 401 if not
signed in) but performs NO tier check — free/pro/premium all see the same news.

Resilience: blocking pymongo calls run via ``asyncio.to_thread`` so they never
stall the event loop; any Mongo failure maps to 503 (never 500), so the rest of
the API keeps working if Atlas is down.
"""

import re
import time
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Query, Depends

from routers.auth import get_current_user
from db.news_queries import (
    get_news, get_news_detail, CATEGORIES,
    VALID_CATEGORIES, VALID_IMPACTS,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/news", tags=["news"])

_HASH_RE = re.compile(r"^[a-f0-9]{64}$")
_TICKER_RE = re.compile(r"^[A-Za-z0-9]{1,10}$")


async def limit_concurrency():
    """Share main's global request semaphore (lazy import avoids circular import)."""
    from main import concurrency_limiter
    await concurrency_limiter.acquire()
    try:
        yield
    finally:
        concurrency_limiter.release()

# Small self-contained TTL cache (news is identical for every user, so cache
# entries are shared across tiers). Mirrors main.get_cached but avoids importing
# from main (circular).
_cache: dict[str, tuple[object, float]] = {}
_MAX_CACHE = 60


def _cache_get(key: str):
    entry = _cache.get(key)
    if entry and time.time() < entry[1]:
        return entry[0]
    return None


def _cache_set(key: str, value, ttl: int):
    now = time.time()
    if len(_cache) >= _MAX_CACHE:
        for k, (_, exp) in list(_cache.items()):
            if now > exp:
                _cache.pop(k, None)
    _cache[key] = (value, now + ttl)


@router.get("")
async def list_news(
    request: Request,
    category: Optional[str] = None,
    ticker: Optional[str] = None,
    impact: Optional[str] = None,
    cursor: Optional[str] = None,
    limit: int = Query(20, ge=1, le=20),
    _concurrency=Depends(limit_concurrency),
):
    """Paginated news cards. Requires login (any tier)."""
    await get_current_user(request)  # 401 if unauthenticated

    if category and category not in VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail="Invalid category")
    if impact and impact not in VALID_IMPACTS:
        raise HTTPException(status_code=422, detail="Invalid impact")
    if ticker and not _TICKER_RE.match(ticker):
        raise HTTPException(status_code=422, detail="Invalid ticker")

    key = f"news_{category}_{ticker}_{impact}_{cursor}_{limit}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    try:
        data = await asyncio.to_thread(get_news, category, ticker, impact, cursor, limit)
    except Exception as e:
        logger.error(f"News list error: {e}")
        raise HTTPException(status_code=503, detail="News temporarily unavailable")

    _cache_set(key, data, 180)
    return data


@router.get("/categories")
async def list_categories(request: Request):
    """Static category list for the filter bar. Requires login."""
    await get_current_user(request)
    return CATEGORIES


@router.get("/{url_hash}")
async def news_detail(url_hash: str, request: Request, _concurrency=Depends(limit_concurrency)):
    """Article excerpt + AI summary and key metrics. Requires login.

    Returns a bounded excerpt, never the full press article body — see
    db/news_queries.py::EXCERPT_CHARS for why.
    """
    await get_current_user(request)

    if not _HASH_RE.match(url_hash):
        raise HTTPException(status_code=422, detail="Invalid article id")

    key = f"news_detail_{url_hash}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    try:
        doc = await asyncio.to_thread(get_news_detail, url_hash)
    except Exception as e:
        logger.error(f"News detail error: {e}")
        raise HTTPException(status_code=503, detail="News temporarily unavailable")

    if doc is None:
        raise HTTPException(status_code=404, detail="Article not found")

    _cache_set(key, doc, 600)
    return doc
