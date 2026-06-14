"""
Migration: Create subscribers table for email notification subscriptions.

Run standalone:
    python -m db.migrate_subscribers

Or import and call:
    from db.migrate_subscribers import run_migration
    run_migration()
"""

from db.connection import get_engine
from sqlalchemy import text


MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS subscribers (
    id SERIAL PRIMARY KEY,
    email VARCHAR(254) UNIQUE NOT NULL,
    subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'website'
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
"""


def run_migration():
    """Create the subscribers table if it doesn't exist."""
    engine = get_engine()
    if engine is None:
        print("ERROR: No database connection available.")
        return False

    try:
        with engine.begin() as conn:
            for statement in MIGRATION_SQL.strip().split(";"):
                statement = statement.strip()
                if statement:
                    conn.execute(text(statement))
        print("Migration complete: 'subscribers' table ready.")
        return True
    except Exception as e:
        print(f"Migration error: {e}")
        return False


if __name__ == "__main__":
    run_migration()
