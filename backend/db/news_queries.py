"""Read-only queries for the CafeF news feed (MongoDB).

Design constraints (see PRODUCTION_CONSTRAINTS.md / NEWS_FEATURE_PLAN.md):
  - NO response ever carries the full ``raw_text`` (~3.5 KB avg, up to ~88 KB).
    Lists carry a ~280-char preview, and only for the rare (~0.1 %) docs whose
    AI summary is too thin; that slice is computed inside Mongo via ``$substrCP``
    so the full body never leaves the database. The detail route carries a
    bounded excerpt (``EXCERPT_CHARS``) — never the whole article.
  - Sorting / pagination is on ``published_at`` (uniformly a BSON Date on all
    done docs after the 2026-06 DB rework, backed by the ``status_published_at``
    compound index). ``_id`` is used as a tiebreaker because up to ~10 docs can
    share the same ``published_at`` minute.
  - status == "done" only (these are the docs with AI summaries).
"""

import logging
from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId

from db.mongo import get_news_collection

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {
    "bat_dong_san", "chung_khoan", "doanh_nghiep",
    "hang_hoa", "tai_chinh_nh", "vi_mo",
}
VALID_IMPACTS = {"Positive", "Negative", "Neutral"}

# Vietnamese labels for the UI (data + brand voice are Vietnamese).
CATEGORIES = [
    {"id": "chung_khoan", "label": "Chứng khoán"},
    {"id": "doanh_nghiep", "label": "Doanh nghiệp"},
    {"id": "tai_chinh_nh", "label": "Tài chính - Ngân hàng"},
    {"id": "bat_dong_san", "label": "Bất động sản"},
    {"id": "hang_hoa", "label": "Hàng hóa"},
    {"id": "vi_mo", "label": "Vĩ mô"},
]

THIN_SUMMARY_CHARS = 80   # below this, fall back to a raw_text preview
PREVIEW_CHARS = 280
_PREVIEW_SLICE = PREVIEW_CHARS + 60  # fetch a little extra to allow word-boundary trim
MAX_LIMIT = 20


def _iso(value):
    """Serialize datetimes to ISO strings; pass other values through."""
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _truncate_on_word(text: str, n: int) -> str:
    if not text:
        return ""
    text = text.strip()
    if len(text) <= n:
        return text
    cut = text[:n]
    space = cut.rfind(" ")
    if space > n * 0.6:
        cut = cut[:space]
    return cut.rstrip() + "…"


def get_news(category=None, ticker=None, impact=None, cursor=None, limit=MAX_LIMIT):
    """Return one page of news cards (lean projection, cursor-paginated).

    Returns ``{"items": [...], "next_cursor": <iso str | None>}``.
    Raises ``RuntimeError`` if the news store is unavailable (router maps to 503).
    """
    coll = get_news_collection()
    if coll is None:
        raise RuntimeError("news store unavailable")

    try:
        limit = max(1, min(int(limit or MAX_LIMIT), MAX_LIMIT))
    except (TypeError, ValueError):
        limit = MAX_LIMIT

    match = {"status": "done"}
    if category in VALID_CATEGORIES:
        match["category"] = category
    if impact in VALID_IMPACTS:
        match["summary_json.impact"] = impact
    if ticker:
        match["summary_json.tickers"] = ticker.upper()
    if cursor:
        # Opaque compound cursor "<published_at_iso>|<_id_hex>". The _id tiebreaker
        # is essential: up to ~10 docs share the same published_at minute.
        try:
            pub_part, _, id_part = cursor.rpartition("|")
            cur_dt = datetime.fromisoformat(pub_part)
            cur_id = ObjectId(id_part)
            match["$or"] = [
                {"published_at": {"$lt": cur_dt}},
                {"published_at": cur_dt, "_id": {"$lt": cur_id}},
            ]
        except (ValueError, TypeError, InvalidId):
            pass  # bad cursor → treat as first page

    pipeline = [
        {"$match": match},
        {"$sort": {"published_at": -1, "_id": -1}},
        {"$limit": limit},
        {"$project": {
            "_id": 0,
            "id": "$url_hash",
            "cursor_id": {"$toString": "$_id"},  # internal — for next_cursor only
            "title": 1,
            "category": 1,
            "source_url": 1,
            "published_at": 1,
            "created_at": 1,
            "summary": {"$ifNull": ["$summary_json.summary", []]},
            "tickers": {"$ifNull": ["$summary_json.tickers", []]},
            "impact": "$summary_json.impact",
            "sector": "$summary_json.sector",
            # Bounded slice only — full raw_text never leaves Mongo.
            "raw_preview": {"$substrCP": [{"$ifNull": ["$raw_text", ""]}, 0, _PREVIEW_SLICE]},
        }},
    ]

    docs = list(coll.aggregate(pipeline))

    items = []
    last_published = None
    last_cursor_id = None
    for d in docs:
        last_published = d.get("published_at")
        last_cursor_id = d.get("cursor_id")
        summary = [s for s in (d.get("summary") or []) if isinstance(s, str)]
        item = {
            "id": d.get("id"),
            "title": d.get("title"),
            "category": d.get("category"),
            "source_url": d.get("source_url"),
            "published_at": _iso(d.get("published_at")),
            "created_at": _iso(d.get("created_at")),
            "summary": summary,
            "tickers": d.get("tickers") or [],
            "impact": d.get("impact"),
            "sector": d.get("sector"),
        }
        if len(" ".join(summary)) < THIN_SUMMARY_CHARS:
            preview = _truncate_on_word(d.get("raw_preview") or "", PREVIEW_CHARS)
            if preview:
                item["preview"] = preview
        items.append(item)

    # Only advertise a next cursor when the page was full (more may exist).
    next_cursor = None
    if last_published and last_cursor_id and len(items) == limit:
        next_cursor = f"{_iso(last_published)}|{last_cursor_id}"
    return {"items": items, "next_cursor": next_cursor}


#: Longest article body we will serve. Republishing a press article in full
#: would make this site a "trang thông tin điện tử tổng hợp" under Nghị định
#: 147/2024, which requires a licence conditioned on being a Vietnamese
#: organisation with matching registered business lines, at least three press
#: sources and a one-hour delay — none of which a personal research project can
#: satisfy. It would also be a copyright exposure under Luật Sở hữu trí tuệ.
#: An excerpt plus attribution and a link to the original is the lawful form.
EXCERPT_CHARS = 600


def excerpt(text: str, limit: int = EXCERPT_CHARS) -> str:
    """Trim to a whole word near ``limit`` and mark the truncation."""
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    # Prefer a sentence boundary, then a word boundary, so the excerpt does not
    # end mid-word.
    for sep in (". ", "! ", "? ", "\n"):
        idx = cut.rfind(sep)
        if idx > limit * 0.5:
            return cut[: idx + 1].rstrip() + " […]"
    idx = cut.rfind(" ")
    return (cut[:idx] if idx > 0 else cut).rstrip() + " […]"


def get_news_detail(url_hash: str):
    """Return a single article as a bounded excerpt + metadata, or None.

    Deliberately never returns the full body — see ``EXCERPT_CHARS``.
    """
    coll = get_news_collection()
    if coll is None:
        raise RuntimeError("news store unavailable")

    doc = coll.find_one(
        {"url_hash": url_hash, "status": "done"},
        {
            "_id": 0, "url_hash": 1, "title": 1, "category": 1, "source_url": 1,
            "published_at": 1, "created_at": 1, "raw_text": 1, "summary_json": 1,
        },
    )
    if not doc:
        return None

    sj = doc.get("summary_json") or {}
    return {
        "id": doc.get("url_hash"),
        "title": doc.get("title"),
        "category": doc.get("category"),
        "source_url": doc.get("source_url"),
        "published_at": _iso(doc.get("published_at")),
        "created_at": _iso(doc.get("created_at")),
        "summary": [s for s in (sj.get("summary") or []) if isinstance(s, str)],
        "tickers": sj.get("tickers") or [],
        "impact": sj.get("impact"),
        "sector": sj.get("sector"),
        "key_metrics": sj.get("key_metrics") or {},
        # Excerpt only. The full text stays in Mongo and is never served.
        "excerpt": excerpt(doc.get("raw_text")),
        "is_excerpt": True,
    }
