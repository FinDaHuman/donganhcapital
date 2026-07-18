"""
BCD trade tracker: manage the lifecycle of trades opened from bcd_signals
(threshold-passers only) in the bcd_trade_history table.

Called from run_daily_pipeline.py as Step 6 (non-fatal). Unlike the AI tracker
(embedded in daily_predict.predict_today, which early-returns on no-signal
days), this step runs unconditionally every day so open BCD positions still
resolve TP/SL/TIMEOUT on the frequent zero-event days.

Can also be run directly for testing:
    cd daily_suggestion_system/src/daily_pipeline
    python bcd_trade_tracker.py
"""
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
from sqlalchemy import text

SRC_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SRC_DIR))

from data_access.db_connection import get_engine
from data_access.stock_data_loader import load_stock_data
from manager.trade_manager import TradeManager

log = logging.getLogger(__name__)

# 60 calendar days matches the model's 60-session recovery horizon
# (AI breakout uses 30).
TIMEOUT_DAYS = 60

# Only needs enough history to resolve open positions (max hold = TIMEOUT_DAYS).
MARKET_LOOKBACK_DAYS = 120

# Kept in sync with backend/db/bcd_signals_migration.py (belt-and-suspenders,
# same convention as bcd_daily_predict.py). Column set mirrors trade_history.
_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS bcd_trade_history (
    id           BIGSERIAL PRIMARY KEY,
    stock_id     VARCHAR(10) NOT NULL,
    entry_date   DATE        NOT NULL,
    entry_price  DOUBLE PRECISION,
    tp_price     DOUBLE PRECISION,
    sl_price     DOUBLE PRECISION,
    exit_date    DATE,
    exit_price   DOUBLE PRECISION,
    status       VARCHAR(10) NOT NULL DEFAULT 'HOLD',
    return_pct   DOUBLE PRECISION,
    holding_days INTEGER,
    CONSTRAINT bcd_trade_history_stock_entry_uq UNIQUE (stock_id, entry_date)
);
CREATE INDEX IF NOT EXISTS idx_bcd_trade_history_status ON bcd_trade_history (status);
"""


def _ensure_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(_CREATE_TABLE_SQL))


def _load_new_signals(engine) -> pd.DataFrame:
    """Latest-date bcd_signals rows that are actionable trades."""
    query = text("""
    SELECT date AS "Ngay", stock_id, entry_price, tp_price, sl_price
    FROM bcd_signals
    WHERE date = (SELECT MAX(date) FROM bcd_signals)
      AND passed_threshold = TRUE
      AND entry_price IS NOT NULL
    """)
    return pd.read_sql(query, engine)


def update_bcd_trades():
    """
    Update open BCD positions against latest market data, open new trades from
    today's threshold-passing signals, and upsert everything to
    bcd_trade_history. Returns the number of tracked trades, or None if the
    step could not run.
    """
    engine = get_engine()
    if engine is None:
        log.error("BCD tracker: No database engine available")
        return None

    _ensure_table(engine)

    tm = TradeManager(engine, table="bcd_trade_history", timeout_days=TIMEOUT_DAYS)

    start_date = (datetime.now() - timedelta(days=MARKET_LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    market_df = load_stock_data(engine, start_date=start_date)
    if market_df.empty:
        log.warning("BCD tracker: No market data returned — skipping")
        return None

    tm.update_positions(market_df)

    new_signals = _load_new_signals(engine)
    # bcd_signals' MAX(date) can stay the same for days (zero-event days are
    # normal), so drop signals already tracked — otherwise a closed trade would
    # be re-added as HOLD and the upsert would wipe its exit fields.
    if not new_signals.empty:
        tracked = {(t["stock_id"], t["entry_date"]) for t in tm.data["trades"]}
        keep = new_signals.apply(
            lambda r: (str(r["stock_id"]), str(r["Ngay"]).split(" ")[0]) not in tracked,
            axis=1,
        )
        new_signals = new_signals[keep]
    log.info(f"BCD tracker: {len(new_signals)} new actionable signals to open")
    tm.add_new_signals(new_signals)

    tm.finalize()
    tm.save_to_db()

    n = len(tm.data["trades"])
    log.info(f"BCD tracker: {n} trades tracked in bcd_trade_history")
    return n


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    for _cand in [Path(__file__).resolve().parents[2] / ".env",
                  Path(__file__).resolve().parents[3] / "backend" / ".env"]:
        if _cand.exists():
            from dotenv import load_dotenv
            load_dotenv(_cand)
            break

    update_bcd_trades()
