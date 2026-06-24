"""MongoDB connection for the read-only World Macro News feed.

Isolated from both the NeonDB/SQLAlchemy layer and the CafeF news client
(backend/db/mongo.py) so that a failure of either Atlas cluster never degrades
the other.

Same design as mongo.py:
  - Lazy singleton MongoClient (thread-safe, owns its connection pool).
  - Created on first use, NOT in FastAPI lifespan.
  - Aggressive timeouts for fast failure on a down cluster.
  - Returns None on any error; callers raise 503, never 500.

Callers MUST run blocking pymongo calls via asyncio.to_thread.
"""

import os
import logging
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_client: MongoClient | None = None

MACRO_DB = "world_macro_news"
MACRO_COLLECTION = "articles"


def get_macro_mongo_client() -> MongoClient | None:
    """Return the shared MongoClient for macro news, creating it lazily. None if unavailable."""
    global _client
    if _client is not None:
        return _client

    uri = os.environ.get("MACRO_MONGODB_URI")
    if not uri:
        logger.warning("MACRO_MONGODB_URI not set — macro news feature is disabled.")
        return None

    try:
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
        logger.info("MongoDB client initialized for macro news feed.")
        return _client
    except Exception as e:
        logger.error(f"Macro MongoDB client init failed: {e}")
        _client = None
        return None


def get_macro_collection():
    """Return the macro news articles collection, or None if Mongo is unavailable."""
    client = get_macro_mongo_client()
    if client is None:
        return None
    return client[MACRO_DB][MACRO_COLLECTION]
