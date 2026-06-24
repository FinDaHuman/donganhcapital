"""Read-only queries for the World Macro News feed (MongoDB).

Schema notes (world_macro_news.articles):
  - published_at: uniformly a BSON Date on all 'done' docs — safe to sort and
    paginate (same approach as cafef_news after the 2026-06 rework).
  - _id: ObjectId tiebreaker for docs that share the same published_at.
  - summary.summary_vi: Vietnamese bullet-point array (primary display).
  - summary.title_vi: Vietnamese headline.
  - summary.full_translation_vi: full Vietnamese body (detail endpoint only).
  - source: attribution string ("Fed", "AP Economy", "World Bank").
  - topic_hint: coarse topic tag — matches summary.macro_topic.
  - region_hint: ISO-2 code(s) or "Global" (display-only; not used as a filter
    because some values are comma-separated multi-country strings).
  - List responses never carry raw_text or full_translation_vi.
"""

import logging
from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId

from db.macro_mongo import get_macro_collection

logger = logging.getLogger(__name__)

VALID_TOPICS = {"InterestRate", "Debt", "Other"}
VALID_IMPACTS = {"Positive", "Negative", "Neutral"}

TOPICS = [
    {"id": "InterestRate", "label": "Lãi suất"},
    {"id": "Debt", "label": "Nợ công"},
    {"id": "Other", "label": "Đa dạng"},
]

THIN_SUMMARY_CHARS = 80
PREVIEW_CHARS = 280
_PREVIEW_SLICE = PREVIEW_CHARS + 60
MAX_LIMIT = 20


def _iso(value):
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


def get_macro_news(topic=None, impact=None, cursor=None, limit=MAX_LIMIT):
    """Return one page of macro news cards (lean projection, cursor-paginated).

    Returns {"items": [...], "next_cursor": <iso str | None>}.
    Raises RuntimeError if the store is unavailable (router maps to 503).
    """
    coll = get_macro_collection()
    if coll is None:
        raise RuntimeError("macro news store unavailable")

    try:
        limit = max(1, min(int(limit or MAX_LIMIT), MAX_LIMIT))
    except (TypeError, ValueError):
        limit = MAX_LIMIT

    match = {"status": "done"}
    if topic in VALID_TOPICS:
        match["topic_hint"] = topic
    if impact in VALID_IMPACTS:
        match["summary.impact"] = impact
    if cursor:
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
            "cursor_id": {"$toString": "$_id"},
            "title": 1,
            "title_vi": "$summary.title_vi",
            "source": 1,
            "url": 1,
            "region": "$region_hint",
            "topic": "$topic_hint",
            "published_at": 1,
            "created_at": 1,
            "summary": {"$ifNull": ["$summary.summary_vi", []]},
            "impact": "$summary.impact",
            "sentiment_score": "$summary.sentiment_score",
            # Bounded slice only — full text never leaves Mongo in list view.
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
            "title_vi": d.get("title_vi"),
            "source": d.get("source"),
            "url": d.get("url"),
            "region": d.get("region"),
            "topic": d.get("topic"),
            "published_at": _iso(d.get("published_at")),
            "created_at": _iso(d.get("created_at")),
            "summary": summary,
            "impact": d.get("impact"),
            "sentiment_score": d.get("sentiment_score"),
        }
        if len(" ".join(summary)) < THIN_SUMMARY_CHARS:
            preview = _truncate_on_word(d.get("raw_preview") or "", PREVIEW_CHARS)
            if preview:
                item["preview"] = preview
        items.append(item)

    next_cursor = None
    if last_published and last_cursor_id and len(items) == limit:
        next_cursor = f"{_iso(last_published)}|{last_cursor_id}"
    return {"items": items, "next_cursor": next_cursor}


def get_macro_news_detail(url_hash: str):
    """Return a single macro article with full content, or None."""
    coll = get_macro_collection()
    if coll is None:
        raise RuntimeError("macro news store unavailable")

    doc = coll.find_one(
        {"url_hash": url_hash, "status": "done"},
        {
            "_id": 0, "url_hash": 1, "title": 1, "url": 1, "source": 1,
            "region_hint": 1, "topic_hint": 1, "published_at": 1, "created_at": 1,
            "raw_text": 1, "summary": 1,
        },
    )
    if not doc:
        return None

    s = doc.get("summary") or {}
    return {
        "id": doc.get("url_hash"),
        "title": doc.get("title"),
        "title_vi": s.get("title_vi"),
        "source": doc.get("source"),
        "url": doc.get("url"),
        "region": doc.get("region_hint"),
        "topic": doc.get("topic_hint"),
        "published_at": _iso(doc.get("published_at")),
        "created_at": _iso(doc.get("created_at")),
        "summary": [x for x in (s.get("summary_vi") or []) if isinstance(x, str)],
        "summary_en": [x for x in (s.get("summary_en") or []) if isinstance(x, str)],
        "full_translation_vi": s.get("full_translation_vi") or "",
        "impact": s.get("impact"),
        "sentiment_score": s.get("sentiment_score"),
        "key_metrics": s.get("key_metrics") or {},
        "raw_text": doc.get("raw_text") or "",
    }
