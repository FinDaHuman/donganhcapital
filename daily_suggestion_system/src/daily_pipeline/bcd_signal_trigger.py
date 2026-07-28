"""
BCD signal trigger: turn WAITING signals into real entries.

Called from run_daily_pipeline.py as Step 6 (non-fatal), between inference
(Step 5) and the trade tracker (Step 7).

A BCD signal is a resting limit buy on the B->C line, not a fill. This step
walks the sessions after the breakdown day and, on the first one whose low
reaches the line, records the entry:

    WAITING  --low reaches the line-->  TRIGGERED  (trade tracker opens it)
             --10 calendar days pass-->  EXPIRED   (no trade, ever)

This is the lifecycle crawl_news implements in buy_plan.update_statuses
('waiting' -> 'hold' / 'fail'); the original port dropped it and filled every
signal on the breakdown day at a projected price that often never traded.

Can also be run directly:
    cd daily_suggestion_system/src/daily_pipeline
    python bcd_signal_trigger.py
"""
import logging
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import text

SRC_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SRC_DIR))

from data_access.db_connection import get_engine
from data_access.stock_data_loader import load_stock_data
from features.bcd_features import (
    MAX_WAITING_DAYS,
    SL_MULT,
    TP_MULT,
    find_line_touch,
)

log = logging.getLogger(__name__)

# Kept in sync with backend/db/bcd_signals_migration.py and
# bcd_daily_predict.py (belt-and-suspenders, the convention in this package).
# Repeated here so the step still works when Step 5 failed and left the table
# on the old shape.
_ENSURE_COLUMNS_SQL = """
ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'WAITING';
ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS entry_date DATE;
ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS expires_on DATE;
ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS line_anchor_date DATE;
ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS line_anchor_price REAL;
ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS line_slope REAL;
ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS model_threshold REAL;
CREATE INDEX IF NOT EXISTS idx_bcd_signals_status ON bcd_signals (status);
CREATE INDEX IF NOT EXISTS idx_bcd_signals_stock_entry ON bcd_signals (stock_id, entry_date);
"""

_SELECT_WAITING = """
SELECT id, date, stock_id, status, expires_on,
       line_anchor_date, line_anchor_price, line_slope
FROM bcd_signals
WHERE line_anchor_price IS NOT NULL
  AND ({scope})
ORDER BY date ASC, stock_id ASC
"""

_UPDATE_TRIGGERED = text("""
UPDATE bcd_signals
   SET status      = 'TRIGGERED',
       entry_date  = :entry_date,
       entry_price = :entry_price,
       tp_price    = :tp_price,
       sl_price    = :sl_price
 WHERE id = :id
""")

_UPDATE_EXPIRED = text("""
UPDATE bcd_signals
   SET status      = 'EXPIRED',
       entry_date  = NULL,
       entry_price = NULL,
       tp_price    = NULL,
       sl_price    = NULL
 WHERE id = :id
""")

# Only reachable under rescan_all, when a row carries a stale non-WAITING
# status; keeps a full rescan self-sufficient rather than depending on the
# caller having reset the table first.
_UPDATE_WAITING = text("""
UPDATE bcd_signals
   SET status      = 'WAITING',
       entry_date  = NULL,
       entry_price = NULL,
       tp_price    = NULL,
       sl_price    = NULL
 WHERE id = :id
   AND status <> 'WAITING'
""")


def _ensure_columns(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(_ENSURE_COLUMNS_SQL))


def _load_signals(engine, rescan_all: bool) -> pd.DataFrame:
    # rescan_all re-derives every row from scratch, which is what the backfill
    # needs; the daily run only has to look at what is still waiting.
    scope = "TRUE" if rescan_all else "status = 'WAITING'"
    return pd.read_sql(text(_SELECT_WAITING.format(scope=scope)), engine)


def evaluate_bcd_triggers(engine=None, rescan_all: bool = False) -> dict | None:
    """Resolve WAITING signals against the market.

    Returns {"triggered": n, "expired": n, "waiting": n}, or None if the step
    could not run. Idempotent: re-running with rescan_all=True reproduces
    identical rows, because the fill depends only on stored OHLC.
    """
    engine = engine or get_engine()
    if engine is None:
        log.error("BCD trigger: No database engine available")
        return None

    _ensure_columns(engine)

    signals = _load_signals(engine, rescan_all)
    if signals.empty:
        log.info("BCD trigger: no signals to evaluate")
        return {"triggered": 0, "expired": 0, "waiting": 0}

    # Only need bars from the oldest open signal onward, plus the waiting
    # window — never the full history.
    start_date = pd.Timestamp(signals["date"].min()).strftime("%Y-%m-%d")
    market_df = load_stock_data(engine, start_date=start_date)
    if market_df.empty:
        log.warning("BCD trigger: No market data returned — skipping")
        return None

    market_df = market_df.sort_values(["stock_id", "Ngay"])
    bars_by_stock = {sid: g for sid, g in market_df.groupby("stock_id")}
    latest_session = pd.Timestamp(market_df["Ngay"].max())

    triggered, expired, still_waiting = [], [], []

    for _, sig in signals.iterrows():
        bars = bars_by_stock.get(sig["stock_id"])
        touch = None
        if bars is not None and not bars.empty:
            touch = find_line_touch(
                bars,
                sig["line_anchor_date"],
                float(sig["line_anchor_price"]),
                float(sig["line_slope"]),
                sig["date"],
            )

        if touch is not None:
            entry_date, entry_price = touch
            triggered.append({
                "id": int(sig["id"]),
                "entry_date": str(entry_date),
                "entry_price": entry_price,
                "tp_price": entry_price * TP_MULT,
                "sl_price": entry_price * SL_MULT,
            })
            continue

        # No touch. Only give up once the market has actually traded past the
        # window — otherwise the signal is simply still young.
        expires_on = sig["expires_on"]
        if expires_on is not None and not pd.isna(expires_on) and latest_session > pd.Timestamp(expires_on):
            expired.append({"id": int(sig["id"])})
        else:
            still_waiting.append({"id": int(sig["id"])})

    with engine.begin() as conn:
        if triggered:
            conn.execute(_UPDATE_TRIGGERED, triggered)
        if expired:
            conn.execute(_UPDATE_EXPIRED, expired)
        if still_waiting:
            conn.execute(_UPDATE_WAITING, still_waiting)

    result = {"triggered": len(triggered), "expired": len(expired), "waiting": len(still_waiting)}
    log.info(
        f"BCD trigger: {result['triggered']} filled, {result['expired']} expired "
        f"(no touch in {MAX_WAITING_DAYS}d), {result['waiting']} still waiting"
    )
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    for _cand in [Path(__file__).resolve().parents[2] / ".env",
                  Path(__file__).resolve().parents[3] / "backend" / ".env"]:
        if _cand.exists():
            from dotenv import load_dotenv
            load_dotenv(_cand)
            break

    evaluate_bcd_triggers()
