"""Macro news router — login-gated (any tier), read-only world macro news from MongoDB.

Auth/resilience: mirrors routers/news.py exactly — asyncio.to_thread for all
blocking pymongo calls, 503 on any Mongo failure, 180s list cache, 600s detail
cache. A down macro-news cluster never affects any other route.
"""

import re
import time
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Query, Depends

from routers.auth import get_current_user
from db.macro_news_queries import (
    get_macro_news, get_macro_news_detail, TOPICS,
    VALID_TOPICS, VALID_IMPACTS,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/macro-news", tags=["macro-news"])

_HASH_RE = re.compile(r"^[a-f0-9]{64}$")


async def limit_concurrency():
    from main import concurrency_limiter
    await concurrency_limiter.acquire()
    try:
        yield
    finally:
        concurrency_limiter.release()


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
async def list_macro_news(
    request: Request,
    topic: Optional[str] = None,
    impact: Optional[str] = None,
    cursor: Optional[str] = None,
    limit: int = Query(20, ge=1, le=20),
    _concurrency=Depends(limit_concurrency),
):
    """Paginated macro news cards. Requires login (any tier)."""
    await get_current_user(request)

    if topic and topic not in VALID_TOPICS:
        raise HTTPException(status_code=422, detail="Invalid topic")
    if impact and impact not in VALID_IMPACTS:
        raise HTTPException(status_code=422, detail="Invalid impact")

    key = f"macro_news_{topic}_{impact}_{cursor}_{limit}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    try:
        data = await asyncio.to_thread(get_macro_news, topic, impact, cursor, limit)
    except Exception as e:
        logger.error(f"Macro news list error: {e}")
        raise HTTPException(status_code=503, detail="Macro news temporarily unavailable")

    _cache_set(key, data, 180)
    return data


@router.get("/topics")
async def list_topics(request: Request):
    """Static topic list for the filter bar. Requires login."""
    await get_current_user(request)
    return TOPICS


@router.get("/{url_hash}")
async def macro_news_detail(
    url_hash: str,
    request: Request,
    _concurrency=Depends(limit_concurrency),
):
    """Full macro article (incl. full_translation_vi + key metrics). Requires login (any tier)."""
    await get_current_user(request)

    if not _HASH_RE.match(url_hash):
        raise HTTPException(status_code=422, detail="Invalid article id")

    key = f"macro_news_detail_{url_hash}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    try:
        doc = await asyncio.to_thread(get_macro_news_detail, url_hash)
    except Exception as e:
        logger.error(f"Macro news detail error: {e}")
        raise HTTPException(status_code=503, detail="Macro news temporarily unavailable")

    if doc is None:
        raise HTTPException(status_code=404, detail="Article not found")

    _cache_set(key, doc, 600)
    return doc
