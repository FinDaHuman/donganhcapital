"""
Report metadata model and migration for DongAnh Capital.

The PDF bytes live in private Cloudflare R2 (see ``db/r2.py``). Postgres stores
ONLY metadata (~one small row per report) so this stays well within the NeonDB
500 MB budget. ``object_key`` is deterministic from the filename, which makes the
upload script idempotent (upsert on ``object_key``).
"""

from db.connection import get_engine
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


def run_report_migration():
    """Create the reports table if it doesn't exist (idempotent)."""
    engine = get_engine()
    if engine is None:
        logger.warning("No database engine available, skipping report migration")
        return

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS reports (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                stock_id VARCHAR(20) NOT NULL,
                sector VARCHAR(100),
                report_date DATE NOT NULL,
                title VARCHAR(255),
                file_name VARCHAR(255) NOT NULL,
                object_key VARCHAR(512) NOT NULL,
                file_size_bytes INTEGER NOT NULL,
                checksum VARCHAR(64) NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
        """))

        # object_key is the upsert conflict target (deterministic from filename).
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_object_key
            ON reports(object_key);
        """))
        # Supports the default list query (active reports, newest first).
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_reports_active_date
            ON reports(is_active, report_date DESC);
        """))

    logger.info("Report migration completed successfully")
