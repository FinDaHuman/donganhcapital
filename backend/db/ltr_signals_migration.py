"""
Idempotent migration for the ltr_signals table.
Called from main.py lifespan on every Render startup.
"""
import logging
from sqlalchemy import text
from db.connection import get_engine

logger = logging.getLogger(__name__)


def run_ltr_migration():
    engine = get_engine()
    if engine is None:
        logger.warning("No database engine available, skipping LTR migration")
        return

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ltr_signals (
                id         BIGSERIAL PRIMARY KEY,
                date       DATE        NOT NULL,
                stock_id   VARCHAR(10) NOT NULL,
                rank       SMALLINT    NOT NULL,
                score      REAL        NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT ltr_signals_date_stock_uq UNIQUE (date, stock_id)
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_ltr_signals_date ON ltr_signals (date DESC)
        """))

    logger.info("LTR signals migration completed successfully")
