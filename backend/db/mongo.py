"""MongoDB connection for the read-only CafeF news feed.

Deliberately isolated from the NeonDB/SQLAlchemy layer so that an unreachable or
misconfigured Atlas cluster can NEVER block startup or degrade an existing
endpoint:

  - One lazy singleton ``MongoClient`` reused across all requests (it is
    thread-safe and owns its own connection pool — opening a client per request
    is the #1 pymongo anti-pattern and would exhaust Atlas M0's shared
    connection cap).
  - Created on first use, NOT in FastAPI ``lifespan``.
  - Aggressive timeouts so a down cluster fails fast (~4s) instead of hanging
    the 0.1 vCPU box.
  - Any failure returns ``None`` (logged); callers raise 503, never 500.

Callers MUST run the blocking pymongo calls via ``asyncio.to_thread`` so they
don't stall the event loop.
"""

import os
import logging
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_client: MongoClient | None = None

NEWS_DB = "cafef_news"
NEWS_COLLECTION = "articles"


def get_mongo_client() -> MongoClient | None:
    """Return the shared MongoClient, creating it lazily. None if unavailable."""
    global _client
    if _client is not None:
        return _client

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        logger.warning("MONGODB_URI not set — news feature is disabled.")
        return None

    try:
        # Constructing the client does not connect; the first operation does,
        # bounded by serverSelectionTimeoutMS.
        _client = MongoClient(
            uri,
            maxPoolSize=5,
            minPoolSize=0,
            serverSelectionTimeoutMS=4000,
            connectTimeoutMS=4000,
            socketTimeoutMS=8000,
            retryReads=True,
            appname="donganhcapital-api",
        )
        logger.info("MongoDB client initialized for news feed.")
        return _client
    except Exception as e:  # pragma: no cover - defensive
        logger.error(f"MongoDB client init failed: {e}")
        _client = None
        return None


def get_news_collection():
    """Return the news articles collection, or None if Mongo is unavailable."""
    client = get_mongo_client()
    if client is None:
        return None
    return client[NEWS_DB][NEWS_COLLECTION]
