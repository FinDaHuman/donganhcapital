"""
Idempotent migration for the bcd_signals table.
Called from main.py lifespan on every Render startup.
Kept in sync with the inline DDL in
daily_suggestion_system/src/daily_pipeline/bcd_daily_predict.py.
"""
import logging
from sqlalchemy import text
from db.connection import get_engine

logger = logging.getLogger(__name__)


def run_bcd_migration():
    engine = get_engine()
    if engine is None:
        logger.warning("No database engine available, skipping BCD migration")
        return

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS bcd_signals (
                id               BIGSERIAL PRIMARY KEY,
                date             DATE        NOT NULL,
                stock_id         VARCHAR(10) NOT NULL,
                prob             REAL        NOT NULL,
                passed_threshold BOOLEAN     NOT NULL DEFAULT FALSE,
                entry_price      REAL,
                tp_price         REAL,
                sl_price         REAL,
                peak_date        DATE,
                peak_price       REAL,
                b_date           DATE,
                b_price          REAL,
                c_date           DATE,
                c_price          REAL,
                breakdown_price  REAL,
                created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT bcd_signals_date_stock_uq UNIQUE (date, stock_id)
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_bcd_signals_date ON bcd_signals (date DESC)
        """))
        # Entry lifecycle: a signal is now a resting limit order on the B->C
        # line, so it waits for the market to come to it instead of being
        # filled on the breakdown day. entry_price/tp_price/sl_price stay NULL
        # until status flips to TRIGGERED.
        for stmt in (
            "ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'WAITING'",
            "ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS entry_date DATE",
            "ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS expires_on DATE",
            "ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS line_anchor_date DATE",
            "ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS line_anchor_price REAL",
            "ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS line_slope REAL",
            "ALTER TABLE bcd_signals ADD COLUMN IF NOT EXISTS model_threshold REAL",
        ):
            conn.execute(text(stmt))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_bcd_signals_status ON bcd_signals (status)
        """))
        # Serves the trade-history join, which now keys on entry_date.
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_bcd_signals_stock_entry
                ON bcd_signals (stock_id, entry_date)
        """))
        # Kept in sync with the inline DDL in
        # daily_suggestion_system/src/daily_pipeline/bcd_trade_tracker.py.
        conn.execute(text("""
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
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_bcd_trade_history_status ON bcd_trade_history (status)
        """))

    logger.info("BCD signals migration completed successfully")
