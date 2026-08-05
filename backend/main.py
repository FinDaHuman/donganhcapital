from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager
import asyncio
from datetime import datetime
import numpy as np
import pandas as pd
import joblib
import os
import json
import gc
import re
from collections import OrderedDict
from fastapi import Depends, Query
from typing import Any, Optional
import time

from db.queries import (
    get_stocks_from_db, get_stock_ohlc,
    get_market_status_from_db, get_vnindex_from_db,
    get_ai_signals_dates, get_ai_signals,
    get_daily_signal_summary,
    get_trade_history, get_trade_history_stats,
    validate_stock_id, validate_limit,
    insert_subscriber,
    get_ltr_signals, get_ltr_signals_dates,
    get_bcd_signals, get_bcd_signals_dates,
    get_bcd_signals_summary, get_bcd_trade_history,
)
from utils.security import (
    get_client_ip, request_from_edge, edge_header_present,
    check_identity_rate_limit, EDGE_SHARED_SECRET,
)
from utils.legal import NOTICE_HEADER, with_notice, FRONTEND_URL as _LEGAL_FRONTEND_URL, PUBLIC_API_URL

# Disable GPU for lighter inference if needed
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

# --- Globals ---
USE_XGB = os.getenv("USE_XGB", "true").lower() == "true"
predictor = None
DATA_DIR = "data"
MAX_ROWS_PER_TICKER = 60  # Keep only ~60 trading days to save memory

# Concurrency limiter for incoming requests (max 5 simultaneous users)
concurrency_limiter = asyncio.Semaphore(5)
# Simple in‑memory cache with TTL. OrderedDict, not dict, so eviction can drop
# the least-recently-stored entry when nothing has expired yet — see _cache_put.
_cache: "OrderedDict[str, tuple[Any, float]]" = OrderedDict()

async def limit_concurrency():
    """FastAPI dependency to limit concurrent requests."""
    await concurrency_limiter.acquire()
    try:
        yield
    finally:
        concurrency_limiter.release()

MAX_CACHE_ENTRIES = 25  # Fix 6: cap cache size to prevent memory creep

# /api/predict responses get their own store. A single entry carries the full
# formatted history (up to 2000 candles as dicts), so a handful of them dwarfs
# everything else in _cache; sharing one 25-slot budget let ~226 tickers accrue
# tens of MB on a 512 MB instance. Small store, small cap, evicted independently.
_predict_cache: "OrderedDict[str, tuple[Any, float]]" = OrderedDict()
MAX_PREDICT_CACHE_ENTRIES = 8

# Never evicted: the background poller writes this key and every request handler
# reads it. Dropping it would silently disable live pricing until the next fetch.
_PINNED_CACHE_KEYS = frozenset({"live_quotes"})


def _cache_put(store, key: str, value: Any, ttl: int, cap: int) -> None:
    """Store a value with a TTL, enforcing a hard entry cap.

    Expired entries go first; if the store is still full, the oldest surviving
    entry is dropped. That second step is the point — evicting only expired
    entries is not a cap at all, because cache keys are built from user-supplied
    query parameters, so a caller can mint unlimited *fresh* keys and grow the
    store without bound. Pinned keys are exempt.
    """
    now = time.time()

    if len(store) >= cap:
        for k, (_, expires_at) in list(store.items()):
            if now > expires_at and k not in _PINNED_CACHE_KEYS:
                store.pop(k, None)

    while len(store) >= cap:
        for k in store:
            if k not in _PINNED_CACHE_KEYS:
                store.pop(k, None)
                break
        else:
            break  # everything left is pinned; nothing to evict

    store[key] = (value, now + ttl)
    store.move_to_end(key)


# One lock per in-flight cache key. Without this, ``compute`` running in a worker
# thread lets two concurrent misses on the same cold key both hit the database —
# a purely synchronous version could never race, because it never yielded.
# Entries are removed as soon as the last waiter for a key is done, so the dict
# only ever holds keys currently being computed.
_cache_locks: dict[str, tuple[asyncio.Lock, int]] = {}


async def get_cached_async(key: str, ttl: int, compute):
    """Return the cached value if fresh, else compute it in a worker thread.

    Cache hits stay on the event loop; only misses pay for a thread hop.

    Every ``compute`` in this module is synchronous pandas/SQLAlchemy work. Run
    inline in an ``async def`` it would block the single event loop for the whole
    query — the ``Semaphore(5)`` limiter does not help, because a blocked loop
    stalls every other request too, health checks included.
    """
    now = time.time()
    entry = _cache.get(key)
    if entry and now < entry[1]:
        return entry[0]

    lock, waiters = _cache_locks.get(key, (None, 0))
    if lock is None:
        lock = asyncio.Lock()
    _cache_locks[key] = (lock, waiters + 1)

    try:
        async with lock:
            # Re-check: a request we queued behind may have just populated this key.
            now = time.time()
            entry = _cache.get(key)
            if entry and now < entry[1]:
                return entry[0]

            value = await asyncio.to_thread(compute)
            _cache_put(_cache, key, value, ttl, MAX_CACHE_ENTRIES)
            return value
    finally:
        held_lock, waiters = _cache_locks.get(key, (None, 0))
        if waiters <= 1:
            _cache_locks.pop(key, None)
        else:
            _cache_locks[key] = (held_lock, waiters - 1)

def run_vn30f1m_sync():
    """Fetch and upsert today's VN30F1M 1-minute candles. Raises on failure."""
    from vnstock import Quote
    from uuid import uuid4
    import pytz
    vn_tz = pytz.timezone('Asia/Ho_Chi_Minh')
    today = datetime.now(vn_tz).strftime("%Y-%m-%d")
    # KBS is the primary source but is intermittently unreachable from Render;
    # VCI serves the same 1-min candle schema and is the reliable fallback.
    df = None
    for source in ("KBS", "VCI"):
        try:
            df = Quote(symbol="VN30F1M", source=source).history(start=today, end=today, interval="1m")
            if df is not None and len(df) > 0:
                break
        except Exception as e:
            print(f"VN30F1M fetch via {source} failed: {e}")
            df = None
    if df is None or len(df) == 0:
        return
    df = df.rename(columns={"time": "time"})
    df["time"] = pd.to_datetime(df["time"])
    df = df[["time", "open", "high", "low", "close", "volume"]]
    df = df.drop_duplicates(subset=["time"])
    df = df.replace([np.inf, -np.inf], np.nan)
    from db.connection import get_engine
    from sqlalchemy import text
    engine = get_engine()
    if engine is None:
        return
    temp_table = f"vn30f1m_temp_{uuid4().hex}"
    with engine.begin() as conn:
        try:
            df.to_sql(temp_table, conn, if_exists="replace", index=False, chunksize=500)
            conn.execute(text(f"""
                INSERT INTO vn30f1m_intraday (time, open, high, low, close, volume)
                SELECT time, open, high, low, close, volume FROM {temp_table}
                ON CONFLICT (time) DO UPDATE SET
                    open = EXCLUDED.open, high = EXCLUDED.high,
                    low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume
            """))
        finally:
            try:
                conn.execute(text(f"DROP TABLE IF EXISTS {temp_table}"))
            except Exception as cleanup_err:
                print(f"Cleanup ignored due to prior errors: {cleanup_err}")
    print(f"Live VN30F1M update fetched {len(df)} candles.")
def is_vn30f1m_open():
    import pytz
    from datetime import datetime, time as dt_time
    vn_tz = pytz.timezone('Asia/Ho_Chi_Minh')
    now = datetime.now(vn_tz)
    
    if now.weekday() > 4:
        return False
        
    current_time = now.time()
    
    # Poll slightly before open and after close
    # Morning: 8:50 - 11:45
    morning_start = dt_time(8, 50)
    morning_end = dt_time(11, 45)
    
    # Afternoon: 12:45 - 16:30 (extended past market close to cover daily pipeline at 15:02)
    afternoon_start = dt_time(12, 45)
    afternoon_end = dt_time(16, 30)
    
    if (morning_start <= current_time <= morning_end) or \
       (afternoon_start <= current_time <= afternoon_end):
        return True
        
    return False

# Circuit breaker for VN30F1M polling — KB Securities API is intermittently slow
# and frequently unreachable from Render's servers.
# After _VN30F1M_FAILURE_THRESHOLD consecutive failures, back off with exponential
# backoff (300 → 600 → 1200 → 3600s cap) so a broken API day doesn't hammer the
# thread pool every 5 minutes indefinitely.
_vn30f1m_consecutive_failures = 0
_vn30f1m_circuit_open_until = 0.0
_vn30f1m_trip_count = 0  # resets when a successful fetch is observed
_VN30F1M_FAILURE_THRESHOLD = 3
_VN30F1M_BASE_COOLDOWN = 300
_VN30F1M_MAX_COOLDOWN = 3600


def _vn30f1m_cooldown(trip_count: int) -> int:
    """Exponential backoff: 300 → 600 → 1200 → 3600s (cap)."""
    return min(_VN30F1M_BASE_COOLDOWN * (2 ** max(trip_count - 1, 0)), _VN30F1M_MAX_COOLDOWN)


def _trip_vn30f1m_circuit() -> None:
    """Increment trip count, arm the circuit breaker, and log the cooldown."""
    global _vn30f1m_consecutive_failures, _vn30f1m_circuit_open_until, _vn30f1m_trip_count
    _vn30f1m_trip_count += 1
    cooldown = _vn30f1m_cooldown(_vn30f1m_trip_count)
    _vn30f1m_circuit_open_until = time.time() + cooldown
    print(f"VN30F1M circuit breaker tripped (trip #{_vn30f1m_trip_count}) — skipping for {cooldown}s")
    _vn30f1m_consecutive_failures = 0


async def realtime_vn30f1m():
    global _vn30f1m_consecutive_failures, _vn30f1m_circuit_open_until, _vn30f1m_trip_count
    while True:
        try:
            if is_vn30f1m_open():
                if time.time() < _vn30f1m_circuit_open_until:
                    await asyncio.sleep(60)
                    continue
                try:
                    # 35s cap: lets asyncio give up after ~1 vnstock retry (30s each)
                    # instead of waiting for all 3 retries (~90s). The underlying thread
                    # runs to completion regardless, but failure is detected much sooner.
                    await asyncio.wait_for(
                        asyncio.to_thread(run_vn30f1m_sync),
                        timeout=35,
                    )
                    _vn30f1m_consecutive_failures = 0
                    _vn30f1m_trip_count = 0
                except asyncio.TimeoutError:
                    _vn30f1m_consecutive_failures += 1
                    print(f"VN30F1M update timed out (failure #{_vn30f1m_consecutive_failures})")
                    if _vn30f1m_consecutive_failures >= _VN30F1M_FAILURE_THRESHOLD:
                        _trip_vn30f1m_circuit()
                except Exception as e:
                    _vn30f1m_consecutive_failures += 1
                    print(f"Error live updating VN30F1M (failure #{_vn30f1m_consecutive_failures}): {e}")
                    if _vn30f1m_consecutive_failures >= _VN30F1M_FAILURE_THRESHOLD:
                        _trip_vn30f1m_circuit()
        except Exception as e:
            print(f"Background task error: {e}")
        await asyncio.sleep(60)


# ---------------------------------------------------------------------------
# Real-time equity quotes (shared, cached, trading-hours gated)
# ---------------------------------------------------------------------------
# One batch price-board fetch per cycle refreshes a module-level map that all
# request handlers read from _cache["live_quotes"] — the vnstock call never runs
# inside a request (Semaphore(5)) slot. Any failure leaves the map stale/empty
# and every consumer transparently falls back to daily-close values.
LIVE_QUOTES_CACHE_KEY = "live_quotes"
LIVE_QUOTES_TTL = 90  # seconds a fetched map is considered fresh
_MAX_LIVE_QUOTE_SYMBOLS = 250  # one VCI price_board call covers the full board (~225) in ~7s

# Dedicated circuit breaker (mirrors the VN30F1M one above).
_equity_quotes_consecutive_failures = 0
_equity_quotes_circuit_open_until = 0.0
_equity_quotes_trip_count = 0


def _trip_equity_quotes_circuit() -> None:
    global _equity_quotes_consecutive_failures, _equity_quotes_circuit_open_until, _equity_quotes_trip_count
    _equity_quotes_trip_count += 1
    cooldown = _vn30f1m_cooldown(_equity_quotes_trip_count)
    _equity_quotes_circuit_open_until = time.time() + cooldown
    print(f"Equity quotes circuit breaker tripped (trip #{_equity_quotes_trip_count}) — skipping for {cooldown}s")
    _equity_quotes_consecutive_failures = 0


def get_live_quote_map() -> dict:
    """Return the latest live-quote map, or {} if none fresh. Read by consumers.

    Never triggers a fetch; the background task owns refreshing. Values are
    normalized to the stock_ohlc scale by db.live_quotes.
    """
    entry = _cache.get(LIVE_QUOTES_CACHE_KEY)
    if entry and time.time() < entry[1]:
        return entry[0] or {}
    return {}


def _attach_live_price(result: dict, stock_id: str) -> dict:
    """Return a shallow copy of a (possibly cached) predict result with a fresh
    live_price attached. No-op when no quote is available, so the chart simply
    shows history as before."""
    q = get_live_quote_map().get(str(stock_id).upper())
    if q and q.get("price") is not None:
        return {**result, "live_price": q["price"], "live_change_pct": q.get("change_pct")}
    return result


def _live_quote_universe_sync() -> list:
    """Tickers worth a live quote: the full equity board (for the heatmap) plus
    open (HOLD) positions and latest AI signals (subsets, but explicit for
    clarity). Excludes the VN30F1M future, which has its own realtime path.

    Best-effort — any DB error yields [] so the fetch is simply skipped that
    cycle and consumers keep using daily-close values.
    """
    try:
        from db.connection import get_engine
        from sqlalchemy import text
        engine = get_engine()
        if engine is None:
            return []
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT stock_id FROM stocks
                UNION
                SELECT stock_id FROM trade_history WHERE status = 'HOLD'
                UNION
                SELECT stock_id FROM ai_signals
                WHERE date = (SELECT MAX(date) FROM ai_signals)
            """)).fetchall()
        return [r[0] for r in rows if r and r[0] and r[0] != "VN30F1M"]
    except Exception as e:
        print(f"Live quote universe query error: {e}")
        return []


def refresh_live_quotes_sync() -> int:
    """Fetch one batch of live quotes and store it in _cache. Returns count."""
    from db.live_quotes import get_live_quotes
    symbols = _live_quote_universe_sync()
    if not symbols:
        return 0
    symbols = symbols[:_MAX_LIVE_QUOTE_SYMBOLS]
    quotes = get_live_quotes(symbols)
    if quotes:
        # Pinned key (see _PINNED_CACHE_KEYS): stored directly so a full cache
        # can never evict the live quote map out from under the request handlers.
        _cache[LIVE_QUOTES_CACHE_KEY] = (quotes, time.time() + LIVE_QUOTES_TTL)
    return len(quotes)


def is_equity_market_open():
    """Trading window for the CASH equity board — not the same as VN30F1M.

    The future opens at 08:45 and this loop used ``is_vn30f1m_open()`` (which
    starts polling at 08:50), so for the ten minutes before the equity board
    actually opens we were fetching quotes for stocks that had not traded yet.
    Combined with the reference-price fallback in db/live_quotes._norm, that made
    every ticker read 0.00%.

    HOSE continuous session: 09:00-11:30 and 13:00-14:45 (ATC to 14:45).
    Small tails included so the closing values stay live for a few minutes.
    """
    import pytz
    from datetime import datetime, time as dt_time
    now = datetime.now(pytz.timezone('Asia/Ho_Chi_Minh'))
    if now.weekday() > 4:
        return False
    t = now.time()
    return (dt_time(9, 0) <= t <= dt_time(11, 35)) or (dt_time(13, 0) <= t <= dt_time(15, 5))


async def realtime_equity_quotes():
    """Refresh the shared live-quote map every 60s during equity trading hours."""
    global _equity_quotes_consecutive_failures, _equity_quotes_circuit_open_until, _equity_quotes_trip_count
    while True:
        try:
            if is_equity_market_open():
                if time.time() < _equity_quotes_circuit_open_until:
                    await asyncio.sleep(60)
                    continue
                try:
                    count = await asyncio.wait_for(
                        asyncio.to_thread(refresh_live_quotes_sync),
                        timeout=35,
                    )
                    _equity_quotes_consecutive_failures = 0
                    _equity_quotes_trip_count = 0
                    if count:
                        print(f"Live equity quotes refreshed: {count} symbols.")
                except asyncio.TimeoutError:
                    _equity_quotes_consecutive_failures += 1
                    print(f"Live equity quotes timed out (failure #{_equity_quotes_consecutive_failures})")
                    if _equity_quotes_consecutive_failures >= _VN30F1M_FAILURE_THRESHOLD:
                        _trip_equity_quotes_circuit()
                except Exception as e:
                    _equity_quotes_consecutive_failures += 1
                    print(f"Error refreshing live equity quotes (failure #{_equity_quotes_consecutive_failures}): {e}")
                    if _equity_quotes_consecutive_failures >= _VN30F1M_FAILURE_THRESHOLD:
                        _trip_equity_quotes_circuit()
        except Exception as e:
            print(f"Equity quotes background task error: {e}")
        await asyncio.sleep(60)


def downgrade_expired_subscriptions_sync():
    """Downgrade users whose subscription has expired back to free tier."""
    try:
        from db.connection import get_engine
        from sqlalchemy import text
        engine = get_engine()
        if engine is None:
            return
        with engine.begin() as conn:
            result = conn.execute(text("""
                UPDATE users
                SET subscription_tier = 'free',
                    subscription_period = NULL,
                    subscription_expires_at = NULL,
                    updated_at = NOW()
                WHERE subscription_tier != 'free'
                  AND subscription_expires_at IS NOT NULL
                  AND subscription_expires_at < NOW()
            """))
            if result.rowcount:
                print(f"Downgraded {result.rowcount} expired subscription(s) to free tier.")
    except Exception as e:
        print(f"Subscription downgrade task error: {e}")


async def subscription_expiry_checker():
    """Run every 6 hours: downgrade expired subscriptions and action any
    deletion requests whose grace period has elapsed.

    The deletion sweep piggybacks on this loop deliberately — a fifth asyncio
    task is not free on a 512 MB box, and neither job is time-critical to the
    hour.
    """
    from routers.account import sweep_pending_deletions_sync

    while True:
        await asyncio.to_thread(downgrade_expired_subscriptions_sync)
        try:
            await asyncio.to_thread(sweep_pending_deletions_sync)
        except Exception as e:
            print(f"Deletion sweep warning: {e}")
        await asyncio.sleep(6 * 3600)


# Send the post-signup feedback-request email this many days after the account was
# created. Timing is opportunistic, not exact — the checker only advances while the
# service is awake (Render free tier spins down after ~15 min idle).
FEEDBACK_EMAIL_DELAY_DAYS = 3


def claim_feedback_recipients_sync(limit=20):
    """Atomically stamp and return users due for the feedback email (at-most-once).

    The UPDATE...RETURNING with FOR UPDATE SKIP LOCKED claims the rows in the same
    statement that stamps feedback_email_sent_at, so an interrupted run (the box can
    spin down mid-loop) can never re-select an already-claimed user and double-send
    the form. Email is best-effort (PRODUCTION_CONSTRAINTS §5): a stamped user whose
    send later fails simply doesn't get it, rather than risking a duplicate ask.

    Only verified, active accounts are targeted — unverified addresses may be typos
    and bouncing them would hurt domain reputation. LIMIT keeps each run well under
    the shared ~100/day Resend budget so a backlog can't crowd out auth mail.
    """
    try:
        from db.connection import get_engine
        from sqlalchemy import text
        engine = get_engine()
        if engine is None:
            return []
        with engine.begin() as conn:
            rows = conn.execute(text("""
                UPDATE users SET feedback_email_sent_at = NOW()
                WHERE id IN (
                    SELECT id FROM users
                    WHERE feedback_email_sent_at IS NULL
                      AND email_verified = TRUE
                      AND is_active = TRUE
                      AND created_at <= NOW() - make_interval(days => :days)
                    ORDER BY created_at
                    LIMIT :limit
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, email, full_name
            """), {"days": FEEDBACK_EMAIL_DELAY_DAYS, "limit": limit}).mappings().all()
        return [dict(r) for r in rows]
    except Exception as e:
        print(f"Feedback recipient claim error: {e}")
        return []


async def feedback_email_checker():
    """Run every 6 hours to send the post-signup feedback-request email."""
    from utils.mailer import send_feedback_request_email
    while True:
        try:
            recipients = await asyncio.to_thread(claim_feedback_recipients_sync, 20)
            for r in recipients:
                if r.get("email"):
                    await send_feedback_request_email(r["email"], r.get("full_name"))
            if recipients:
                print(f"Sent feedback-request email to {len(recipients)} user(s).")
        except Exception as e:
            print(f"Feedback email task error: {e}")
        await asyncio.sleep(6 * 3600)


# --- Lifespan for Model Loading ---
poll_task = None
expiry_task = None
feedback_task = None
equity_quotes_task = None
@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor, poll_task, expiry_task, feedback_task, equity_quotes_task

    # Validate critical secrets before accepting traffic.
    if not os.getenv("JWT_SECRET_KEY"):
        print(
            "FATAL: JWT_SECRET_KEY env var is not set. "
            "Every server restart will invalidate all user sessions. "
            "Set it in Render → Environment → JWT_SECRET_KEY."
        )

    try:
        from models.xgb_predictor import XGBPredictor
        model_path = os.path.join(os.path.dirname(__file__), "models", "xgb_model")
        predictor = XGBPredictor.load(model_path)
        print("XGB Prediction Model loaded successfully.")
    except Exception as e:
        print(f"Prediction model load error: {e}")
    
    # Auto-migrate subscribers table
    try:
        from db.migrate_subscribers import run_migration
        run_migration()
    except Exception as e:
        print(f"Subscriber migration warning: {e}")

    # Auto-migrate users table
    try:
        from db.models_user import run_user_migration
        run_user_migration()
    except Exception as e:
        print(f"User migration warning: {e}")

    # Consent records + data-subject-rights columns (Luật 91/2025).
    try:
        from db.models_consent import run_consent_migration
        run_consent_migration()
    except Exception as e:
        print(f"Consent migration warning: {e}")

    # Auto-migrate payments table. Kept running even though nothing is sold any
    # more: historical rows must stay readable and schema-consistent, and the
    # migration is idempotent. See the note on the payments router below.
    try:
        from db.models_payment import run_payment_migration
        run_payment_migration()
    except Exception as e:
        print(f"Payment migration warning: {e}")

    # Auto-migrate ltr_signals table
    try:
        from db.ltr_signals_migration import run_ltr_migration
        run_ltr_migration()
    except Exception as e:
        print(f"LTR migration warning: {e}")

    # Auto-migrate bcd_signals table
    try:
        from db.bcd_signals_migration import run_bcd_migration
        run_bcd_migration()
    except Exception as e:
        print(f"BCD migration warning: {e}")

    # Auto-migrate reports table (Premium PDF Reports)
    try:
        from db.models_report import run_report_migration
        run_report_migration()
    except Exception as e:
        print(f"Report migration warning: {e}")

    poll_task = asyncio.create_task(realtime_vn30f1m())
    expiry_task = asyncio.create_task(subscription_expiry_checker())
    feedback_task = asyncio.create_task(feedback_email_checker())
    equity_quotes_task = asyncio.create_task(realtime_equity_quotes())

    yield
    if poll_task:
        poll_task.cancel()
    if expiry_task:
        expiry_task.cancel()
    if feedback_task:
        feedback_task.cancel()
    if equity_quotes_task:
        equity_quotes_task.cancel()
    print("Shutting down...")

def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


APP_ENV = os.getenv("APP_ENV", "production").strip().lower()
IS_PRODUCTION = APP_ENV == "production"

# The interactive docs are a map of the API: 59 paths with their parameters and
# response shapes. Everything sensitive behind them already returns 401, so this
# is disclosure rather than a breach — but a deployment does not need to hand the
# map out. Off in production, on everywhere else.
#
# /openapi.json has to go with them: /docs and /redoc are only renderers, and
# leaving the schema reachable would publish exactly what hiding them removes.
#
# ENABLE_API_DOCS overrides in either direction, so a deployed dev stack can turn
# them back on without pretending to be a local environment.
DOCS_ENABLED = _env_flag("ENABLE_API_DOCS", not IS_PRODUCTION)

app = FastAPI(
    title="DongAnh Capital AI API",
    lifespan=lifespan,
    docs_url="/docs" if DOCS_ENABLED else None,
    redoc_url="/redoc" if DOCS_ENABLED else None,
    openapi_url="/openapi.json" if DOCS_ENABLED else None,
)

# --- CORS ---
# In production, set ALLOWED_ORIGINS env var to your domain(s).
# e.g., ALLOWED_ORIGINS="https://donganhcapital.com,https://www.donganhcapital.com"
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
allow_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# When using specific origins (not "*"), enable credentials for httpOnly cookies
_allow_credentials = "*" not in allow_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    # Expose the legal headers so browser clients can actually read them; without
    # this, CORS hides any non-safelisted response header from JavaScript.
    expose_headers=["X-DAC-Disclaimer", "X-DAC-Legal"],
)


# Swagger UI and ReDoc pull scripts, styles and fonts from a CDN, so the API's
# own Content-Security-Policy would break them. They only exist when docs are
# enabled, and are exempted below rather than weakening the policy everywhere.
_DOCS_PATHS = frozenset({"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"})

# Tight for a service that answers JSON and two static confirmation pages.
#
# style-src 'unsafe-inline' is deliberate and NOT laziness: the unsubscribe and
# subscribe-confirm pages in routers/legal.py are styled entirely with inline
# style= attributes, on purpose, because they render inside a mail client's
# browser view where an external stylesheet may never load. Dropping it would
# leave a user arriving from an email looking at an unstyled page, which reads
# as a broken or spoofed site.
#
# Scripts stay fully blocked by default-src 'none', so HTML injection on those
# pages still could not execute anything.
_CSP = (
    "default-src 'none'; "
    "style-src 'unsafe-inline'; "
    "frame-ancestors 'none'; "
    "base-uri 'none'"
)


@app.middleware("http")
async def add_legal_and_security_headers(request: Request, call_next):
    """Stamp the "not investment advice" notice, then the security headers.

    A header rather than a body rewrite: rewriting bodies would mean buffering
    and re-serialising every response on a 512 MB / 0.1 vCPU box, and would
    corrupt the endpoints that legitimately return a bare JSON list. A handful of
    dict writes per request, body never touched.

    Registered after CORSMiddleware so that it runs inside it.

    setdefault, not assignment: a route that has already made a deliberate choice
    about one of these headers keeps it.
    """
    response = await call_next(request)
    path = request.url.path

    if path.startswith("/api/"):
        # NOTICE_HEADER is deliberately ASCII — HTTP headers are latin-1, and the
        # Vietnamese text would raise UnicodeEncodeError on every response.
        response.headers["X-DAC-Disclaimer"] = NOTICE_HEADER
        response.headers["X-DAC-Legal"] = f"{_LEGAL_FRONTEND_URL}/disclaimer"

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")

    if path not in _DOCS_PATHS:
        response.headers.setdefault("Content-Security-Policy", _CSP)

    # HSTS only in production. Sending it from a local HTTP server is ignored by
    # browsers, but sending it from a localhost HTTPS experiment would pin the
    # whole of localhost to HTTPS in that browser profile, which is a genuinely
    # annoying thing to undo. No `preload` — that is a one-way door.
    if IS_PRODUCTION:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )

    return response


# --- Auth Router ---
from routers.auth import router as auth_router
app.include_router(auth_router)

# --- Account Router (data-subject rights: export, deactivate, delete) ---
from routers.account import router as account_router
app.include_router(account_router)

# --- Legal Router (public: unsubscribe, subscribe confirmation, doc versions) ---
from routers.legal import router as legal_router
app.include_router(legal_router)

# --- Payments Router: DELIBERATELY NOT MOUNTED ---
# routers/payments.py, utils/sepay.py and utils/trial.py remain in the tree but
# are not registered, so /api/payments/* does not exist. DongAnh Capital is a
# non-commercial academic project with no đăng ký kinh doanh and no mã số thuế;
# taking payment would require both, plus e-invoicing under Nghị định 70/2025,
# and would recast the service as a paid securities service. Re-mounting this
# router is a business decision, not a code change — do not restore it without
# an entity behind it.

# --- News Router (MongoDB-backed, login-gated) ---
from routers.news import router as news_router
app.include_router(news_router)

# --- Macro News Router (separate Atlas cluster, login-gated) ---
from routers.macro_news import router as macro_news_router
app.include_router(macro_news_router)

# --- Chat Router (Gemini-backed AI chatbot + news analysis, Pro/Premium gated) ---
from routers.chat import router as chat_router
app.include_router(chat_router)

# --- Reports Router (R2-backed PDF reports, Premium-gated) ---
from routers.reports import router as reports_router
app.include_router(reports_router)

# --- Email Subscription Security ---
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
# Was [<>'"`;\-\-] — inside a character class the trailing \-\- is just a literal
# hyphen, so this silently rejected every address containing one
# (nguyen-van-a@gmail.com, anything @some-domain.com). The intent was to block the
# SQL comment sequence "--", which needs to be matched outside the class.
# Injection itself is already prevented by parameterised SQL; this is defence in
# depth, not the control.
DANGEROUS_CHARS = re.compile(r"[<>'\"`;]|--")


class SubscribeRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)


# IP-based rate limiter for subscribe endpoint
_subscribe_rate: dict[str, list[float]] = {}
SUBSCRIBE_RATE_LIMIT = 5      # max requests per window
SUBSCRIBE_RATE_WINDOW = 600    # 10 minutes in seconds
MAX_RATE_ENTRIES = 500         # cap stored IPs to prevent memory leak


def _check_subscribe_rate(client_ip: str) -> bool:
    """Return True if request is allowed, False if rate-limited."""
    now = time.time()

    # Evict stale entries if map is too large
    if len(_subscribe_rate) >= MAX_RATE_ENTRIES:
        stale_ips = [
            ip for ip, ts_list in _subscribe_rate.items()
            if not ts_list or ts_list[-1] < now - SUBSCRIBE_RATE_WINDOW
        ]
        for ip in stale_ips:
            _subscribe_rate.pop(ip, None)

    timestamps = _subscribe_rate.get(client_ip, [])
    # Remove timestamps outside the window
    timestamps = [t for t in timestamps if now - t < SUBSCRIBE_RATE_WINDOW]
    if len(timestamps) >= SUBSCRIBE_RATE_LIMIT:
        _subscribe_rate[client_ip] = timestamps
        return False
    timestamps.append(now)
    _subscribe_rate[client_ip] = timestamps
    return True


# --- Endpoints ---
@app.get("/")
@app.head("/")
def root():
    return {"message": "DongAnh Capital API is running", "docs": "/docs"}

@app.get("/api")
def home():
    stocks = get_stocks_from_db()
    return {
        "status": "active", 
        "model_loaded": predictor is not None,
        "stocks_available": len(stocks)
    }

@app.get("/api/health")
def health(request: Request):
    """Simple health check endpoint.

    The ``edge`` block exists to make the Cloudflare rollout verifiable in the
    right order. Enabling EDGE_SHARED_SECRET while the Transform Rule is missing
    would bucket every real user under the single Render proxy IP and rate-limit
    the whole site, so the rule has to be confirmed working first:

      - ``header_present`` — the Transform Rule is firing. True as soon as the
        rule exists, with or without the secret configured. Check this first.
      - ``enforcing`` — EDGE_SHARED_SECRET is set, so proxy headers are now
        trusted only on edge-signed requests. Flip this on once the above is true.
      - ``verified`` — this request's header actually matched the secret.

    Exposes no secret and not even the header's name — only booleans about the
    request in hand.
    """
    return {
        "status": "ok",
        "model_loaded": predictor is not None,
        "edge": {
            "header_present": edge_header_present(request),
            "enforcing": bool(EDGE_SHARED_SECRET),
            "verified": request_from_edge(request),
        },
    }

@app.get("/api/loading-progress")
def loading_progress():
    """Return how many stocks have been loaded. For NeonDB we assume all are instantly loaded."""
    stocks = get_stocks_from_db()
    return {"loaded": len(stocks), "total": len(stocks)}

@app.get("/api/stocks")
async def get_stocks(concurrency: Any = Depends(limit_concurrency)):
    """Return list of all available stock IDs (cached 120s)"""
    def compute():
        stocks = get_stocks_from_db()
        return {"count": len(stocks), "stocks": stocks}
    return await get_cached_async("stocks", 120, compute)

@app.get("/api/market-status")
async def get_market_status(concurrency: Any = Depends(limit_concurrency)):
    """Return latest snapshot for heatmap (cached 120s)"""
    def compute():
        return get_market_status_from_db()
    return await get_cached_async("market_status", 120, compute)

@app.get("/api/vnindex")
async def get_vnindex_endpoint(
    limit: Optional[int] = Query(None, ge=1, le=2000),
    concurrency: Any = Depends(limit_concurrency),
):
    """Return VNINDEX data"""
    def compute():
        df = get_vnindex_from_db(limit)
        if df.empty:
            return []
        
        # Convert Timestamp to ISO format string
        df['Date'] = df['Date'].apply(lambda x: x.isoformat() if pd.notnull(x) else None)
        return df.to_dict(orient="records")
    return await get_cached_async(f"vnindex_{limit}", 120, compute)

# These three used to be public and unauthenticated, which meant per-ticker
# entry / take-profit / stop-loss levels and a probability score were published
# to the open internet and to search-engine crawlers. That is the exact conduct
# UBCKNN penalised in April 2026 (Điều 12.4 Luật Chứng khoán). They now require a
# signed-in, verified account, which aligns the API with the UI — GATED_TABS
# already hid these views while the API served them to anyone.
@app.get("/api/ai-signals")
async def get_ai_signals_endpoint(request: Request, date: Optional[str] = None, latest: bool = False, concurrency: Any = Depends(limit_concurrency)):
    """Return AI signals for a specific date or latest"""
    await _require_verified_account(request)
    def compute():
        return get_ai_signals(date, latest)
    # cache for 2 mins
    cache_key = f"ai_signals_{date}_{latest}"
    # with_notice wraps OUTSIDE get_cached_async: the cache stores the raw
    # computed value, so mutating it in place would alias the notice across requests.
    return with_notice(await get_cached_async(cache_key, 120, compute))

@app.get("/api/ai-signals/dates")
async def get_ai_signals_dates_endpoint(request: Request, concurrency: Any = Depends(limit_concurrency)):
    """Return list of dates that have AI signals"""
    await _require_verified_account(request)
    def compute():
        return get_ai_signals_dates()
    # Returns a list — header-only notice, since turning it into a dict would
    # break the frontend contract.
    return await get_cached_async("ai_signals_dates", 120, compute)

@app.get("/api/ai-signals/summary")
async def get_ai_signals_summary_endpoint(request: Request, concurrency: Any = Depends(limit_concurrency)):
    """Return daily signal count summary"""
    await _require_verified_account(request)
    def compute():
        return get_daily_signal_summary()
    return await get_cached_async("ai_signals_summary", 120, compute)


async def _require_verified_account(request: Request):
    """Raise 401 if unauthenticated, 403 unless the email is verified.

    This is the single access rule for the whole API: a signed-in account with a
    verified email. It gates every endpoint that returns model output.
    """
    from routers.auth import get_current_user as _get_current_user
    from utils.security import has_feature_access

    user = await _get_current_user(request)  # raises 401 if unauthenticated

    if not has_feature_access(user):
        raise HTTPException(
            status_code=403,
            detail="Vui lòng xác thực email để truy cập tính năng này",
        )
    return user


@app.get("/api/ltr-signals")
async def get_ltr_signals_endpoint(
    request: Request,
    date: Optional[str] = None,
    latest: bool = False,
    concurrency: Any = Depends(limit_concurrency),
):
    """Pro-gated LTR ranked signals. Requires Pro or Premium subscription."""
    await _require_verified_account(request)

    if date and not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        raise HTTPException(status_code=400, detail="date must be in YYYY-MM-DD format")

    cache_key = f"ltr_signals_{date}_{latest}"

    def compute():
        return get_ltr_signals(date, latest)

    return with_notice(await get_cached_async(cache_key, 120, compute))


@app.get("/api/ltr-signals/dates")
async def get_ltr_signals_dates_endpoint(
    request: Request,
    concurrency: Any = Depends(limit_concurrency),
):
    """Pro-gated list of dates that have LTR signals."""
    await _require_verified_account(request)

    def compute():
        return get_ltr_signals_dates()

    return await get_cached_async("ltr_signals_dates", 120, compute)


@app.get("/api/bcd-signals")
async def get_bcd_signals_endpoint(
    request: Request,
    date: Optional[str] = None,
    latest: bool = False,
    concurrency: Any = Depends(limit_concurrency),
):
    """Pro-gated BCD breakdown-recovery signals. Requires Pro or Premium subscription."""
    await _require_verified_account(request)

    if date and not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        raise HTTPException(status_code=400, detail="date must be in YYYY-MM-DD format")

    cache_key = f"bcd_signals_{date}_{latest}"

    def compute():
        return get_bcd_signals(date, latest)

    return with_notice(await get_cached_async(cache_key, 120, compute))


@app.get("/api/bcd-signals/dates")
async def get_bcd_signals_dates_endpoint(
    request: Request,
    concurrency: Any = Depends(limit_concurrency),
):
    """Pro-gated list of dates that have BCD signals."""
    await _require_verified_account(request)

    def compute():
        return get_bcd_signals_dates()

    return await get_cached_async("bcd_signals_dates", 120, compute)


@app.get("/api/bcd-signals/summary")
async def get_bcd_signals_summary_endpoint(
    request: Request,
    concurrency: Any = Depends(limit_concurrency),
):
    """Pro-gated per-date BCD event counts (event days only), plus the model's
    current decision threshold."""
    await _require_verified_account(request)

    def compute():
        return get_bcd_signals_summary()

    return with_notice(await get_cached_async("bcd_signals_summary", 120, compute))


@app.get("/api/bcd-trade-history")
async def get_bcd_trade_history_endpoint(
    request: Request,
    status: Optional[str] = None,
    concurrency: Any = Depends(limit_concurrency),
):
    """Pro-gated BCD trade history, optionally filtered by status (TP, SL, TIMEOUT, HOLD)."""
    await _require_verified_account(request)

    def compute():
        return get_bcd_trade_history(status)

    return with_notice(await get_cached_async(f"bcd_trade_history_{status}", 120, compute))


@app.get("/api/trade-history")
async def get_trade_history_endpoint(request: Request, status: Optional[str] = None, concurrency: Any = Depends(limit_concurrency)):
    """Return trade history records, optionally filtered by status (TP, SL, TIMEOUT, HOLD)"""
    await _require_verified_account(request)
    def compute():
        return get_trade_history(status)
    cache_key = f"trade_history_{status}"
    return await get_cached_async(cache_key, 120, compute)

@app.get("/api/trade-history/stats")
async def get_trade_history_stats_endpoint(request: Request, concurrency: Any = Depends(limit_concurrency)):
    """Return portfolio stats from trade history"""
    await _require_verified_account(request)
    def compute():
        return get_trade_history_stats()
    return with_notice(await get_cached_async("trade_history_stats", 120, compute))


@app.get("/api/sectors")
async def get_sectors_endpoint(concurrency: Any = Depends(limit_concurrency)):
    """Read categories.txt and return Sector -> [tickers] mapping"""
    def compute():
        try:
            import os
            path1 = "config/categories.txt"
            path2 = "../daily_suggestion_system/categories.txt"
            target_path = path1 if os.path.exists(path1) else path2
            
            with open(target_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                
            sectors = {}
            for line in lines[2:]:
                line = line.strip()
                if not line or ':' not in line:
                    continue
                sector, tickers_str = line.split(':', 1)
                tickers = [t.strip() for t in tickers_str.split(',') if t.strip()]
                sectors[sector.strip()] = tickers
            return sectors
        except Exception as e:
            print(f"Error loading sectors: {e}")
            return {}
            
    return await get_cached_async("sectors", 3600, compute)

@app.post("/api/subscribe")
async def subscribe_email(body: SubscribeRequest, request: Request, background_tasks: BackgroundTasks):
    """Subscribe an email for product launch notifications.

    Double opt-in: nothing is mailed to the address until it confirms. This
    endpoint is unauthenticated, so without confirmation anyone could sign anyone
    else up for a list they had no way to leave.

    Security layers:
      1. Pydantic validation (length, required field)
      2. Regex email format check
      3. Dangerous char rejection (SQL injection / XSS)
      4. IP-based rate limiting, plus a per-address limit that survives IP spoofing
      5. Parameterized SQL in queries module
      6. Opaque response (never reveal if email existed)
      7. Double opt-in, with a 1/hour resend throttle enforced in SQL
    """
    # Layer 4: Rate limiting
    client_ip = get_client_ip(request)
    if not _check_subscribe_rate(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    # Layer 2 + 3: Sanitize and validate format
    email = body.email.strip().lower()

    if DANGEROUS_CHARS.search(email):
        raise HTTPException(status_code=422, detail="Invalid email format.")

    if not EMAIL_REGEX.match(email):
        raise HTTPException(status_code=422, detail="Invalid email format.")

    # Extra: reject if domain has no dot (e.g. user@localhost)
    domain = email.split("@", 1)[-1]
    if "." not in domain:
        raise HTTPException(status_code=422, detail="Invalid email format.")

    # Layer 4b: per-address limit, applied after format validation so malformed
    # input cannot fill the store. The IP limit above is only as trustworthy as
    # the proxy headers behind it; this one is keyed on the address being
    # subscribed, so rotating source IPs buys no extra attempts against it.
    if not check_identity_rate_limit(email):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    # Layers 5 + 7: parameterized insert that only yields a row when a
    # confirmation is actually due (see insert_subscriber for the conditions).
    import secrets as _secrets
    import hashlib as _hashlib
    from utils.legal import hash_ip as _hash_ip

    raw_token = _secrets.token_urlsafe(32)
    token_hash = _hashlib.sha256(raw_token.encode()).hexdigest()

    should_send = insert_subscriber(email, token_hash, _hash_ip(client_ip))
    if should_send:
        from utils.mailer import send_subscribe_confirm_email
        confirm_url = f"{PUBLIC_API_URL}/api/subscribe/confirm?token={raw_token}"
        background_tasks.add_task(send_subscribe_confirm_email, email, confirm_url)

    # Layer 6: Opaque response — identical whether the address is new, pending,
    # already confirmed, or throttled.
    return {"status": "ok", "message": "Please check your inbox to confirm your subscription."}


@app.get("/api/ohlc/{stock_id}")
async def get_ohlc(
    stock_id: str,
    # Bounded here rather than deeper in: validate_limit() raises ValueError from
    # inside get_stock_ohlc, which nothing on this path catches, so an
    # out-of-range value used to surface as a 500. Query() rejects it with a 422
    # before the handler runs, and keeps the cache-key space finite.
    limit: Optional[int] = Query(None, ge=1, le=2000),
    concurrency: Any = Depends(limit_concurrency),
):
    """Return stock OHLC data"""
    try:
        stock_id = validate_stock_id(stock_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    def compute():
        df = get_stock_ohlc(stock_id, limit)
        if df.empty:
            return []
        
        # formatted data
        formatted = df.apply(lambda row: {
            "Date": row['Date'].isoformat() if pd.notnull(row['Date']) else None,
            "Close": row['Close'],
            "Open": row['Open'],
            "High": row['High'],
            "Low": row['Low'],
            "Volume": row['Volume']
        }, axis=1).tolist()
        return formatted
    return await get_cached_async(f"ohlc_{stock_id}_{limit}", 120, compute)

@app.get("/api/predict/{stock_id}")
async def predict_stock(request: Request, stock_id: str, concurrency: Any = Depends(limit_concurrency)):
    await _require_verified_account(request)
    global predictor

    try:
        stock_id = validate_stock_id(stock_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
        
    try:
        cache_key = f"predict_{stock_id}"
        
        # Fast path for VN30F1M -> No prediction
        if stock_id == "VN30F1M":
            cached = _predict_cache.get(cache_key)
            if cached and time.time() < cached[1]:
                return cached[0]

            df = get_stock_ohlc(stock_id, limit=2000)
            if df is None or df.empty:
                raise HTTPException(status_code=400, detail="Could not fetch data for prediction.")
            formatted_history = df.apply(lambda row: {
                "Date": row['Date'].isoformat() if pd.notnull(row['Date']) else None,
                "Close": row['Close'],
                "Open": row['Open'],
                "High": row['High'],
                "Low": row['Low'],
                "Volume": row['Volume']
            }, axis=1).tolist()
            result = {
                "stock_id": stock_id,
                "history": formatted_history,
                "forecast": []
            }
            # Cache for a very short time (20s) because it's realtime
            _cache_put(_predict_cache, cache_key, result, 20, MAX_PREDICT_CACHE_ENTRIES)
            return result
        
        # 1. Check Model & Data
        if predictor is None:
            raise HTTPException(status_code=503, detail="Prediction model is not loaded.")

        cached = _predict_cache.get(cache_key)
        if cached and time.time() < cached[1]:
            return _attach_live_price(cached[0], stock_id)

        # Fetch all available data for charting and model
        df = get_stock_ohlc(stock_id, limit=None)
        
        if df is None or df.empty:
            raise HTTPException(status_code=400, detail="Could not fetch data for prediction.")
        
        if len(df) < predictor.sequence_length + 1:
             raise HTTPException(status_code=400, detail="Not enough history for this stock.")
             
        # Take all available entries for context visualization
        history_df = df.copy()
        
        # 3. Preprocess for Prediction (Compute Log Returns)
        input_prices = df.iloc[-(predictor.sequence_length + 1):].copy()
        input_prices['log_ret'] = np.log(input_prices['Close'] / input_prices['Close'].shift(1))
        input_ret = input_prices.dropna().tail(predictor.sequence_length)
        
        if len(input_ret) < predictor.sequence_length:
             raise HTTPException(status_code=400, detail="Not enough data for returns calculation.")

        # Clip (same as training)
        input_ret['log_ret'] = input_ret['log_ret'].clip(-0.15, 0.15)
        
        # Scale
        raw_vals = input_ret['log_ret'].values.reshape(-1, 1)
        X_scaled = predictor.scaler.transform(raw_vals)
        X_input = np.expand_dims(X_scaled, axis=0) # (1, seq_len, 1)
        
        # 4. Predict (Output is Scaled Log Returns)
        preds = predictor.predict(X_input)[0] 
        
        # 5. Inverse Transform & Reconstruct Price
        last_price = float(input_prices['Close'].iloc[-1])
        forecast_results = []
        last_date = history_df['Date'].iloc[-1]
        
        def inverse_transform(val):
            return float(predictor.scaler.inverse_transform([[val]])[0][0])
        
        current_med_price = last_price
        prices_low = []
        prices_high = []
        
        for i in range(len(preds)):
            ret_low = inverse_transform(preds[i, 0])
            ret_med = inverse_transform(preds[i, 1])
            ret_high = inverse_transform(preds[i, 2])
            
            next_price = current_med_price * np.exp(ret_med)
            
            if i == 0:
                price_path_low = last_price * np.exp(ret_low)
                price_path_high = last_price * np.exp(ret_high)
            else:
                 price_path_low = prices_low[-1] * np.exp(ret_low)
                 price_path_high = prices_high[-1] * np.exp(ret_high)
            
            candle_open = current_med_price
            candle_close = next_price
            candle_high = max(price_path_high, candle_open, candle_close)
            candle_low = min(price_path_low, candle_open, candle_close)
            
            current_med_price = next_price
            prices_low.append(price_path_low)
            prices_high.append(price_path_high)

            # Business days, not calendar days: a Friday prediction was putting
            # forecast candles on Saturday and Sunday, when the market is shut.
            # BDay skips weekends only — Vietnamese public holidays still land on
            # a trading day here, which is acceptable for a reference band.
            next_date = last_date + pd.tseries.offsets.BDay(i + 1)
            
            forecast_results.append({
                "Date": next_date.isoformat(),
                "Close": round(float(candle_close), 2),
                "Open": round(float(candle_open), 2),
                "High": round(float(candle_high), 2),
                "Low": round(float(candle_low), 2),
                "lower_bound": round(float(price_path_low), 2),
                "upper_bound": round(float(price_path_high), 2)
            })
        
        # Format History for Frontend
        formatted_history = history_df.apply(lambda row: {
            "Date": row['Date'].isoformat(),
            "Close": row['Close'],
            "Open": row['Open'],
            "High": row['High'],
            "Low": row['Low'],
            "Volume": row['Volume']
        }, axis=1).tolist()
        
        result = {
            "stock_id": stock_id,
            "history": formatted_history,
            "forecast": forecast_results
        }
        
        # Cache for 10 minutes
        _cache_put(_predict_cache, cache_key, result, 600, MAX_PREDICT_CACHE_ENTRIES)
        
        # Free the fetched DataFrame immediately
        del df, history_df, input_prices, input_ret
        gc.collect()

        return _attach_live_price(result, stock_id)
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Prediction error for {stock_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
