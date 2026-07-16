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

    logger.info("BCD signals migration completed successfully")
