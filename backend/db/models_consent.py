"""Consent records and data-subject-rights columns.

Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 (in force 01/01/2026) requires that
consent be demonstrable, withdrawable, and that subjects can access, correct and
erase their data. Before this migration the backend recorded no consent at all —
there was no evidence that any user had ever accepted the Terms, and no column
in which to record it.

Follows the project's existing startup-migration pattern: idempotent DDL run on
every boot, no Alembic.
"""

from db.connection import get_engine
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


# Split on ";" by the runner below, so no statement may contain one.
_STATEMENTS = [
    # ── Consent state on the user row ──
    # Denormalised onto `users` so the "does this account need to re-consent?"
    # check is free on every /me call, with no extra query on a 0.1 vCPU box.
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(20)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMP WITH TIME ZONE",

    # ── Deletion / deactivation lifecycle ──
    # deleted_at is the tombstone; anonymized_at records when the scrub ran.
    # They are separate because a deletion request can be pending (grace period)
    # before the scrub happens.
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP WITH TIME ZONE",

    # Durable rate limit for the data-export endpoint. The in-memory limiter
    # resets on every Render cold start, so it cannot be the real control.
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_export_at TIMESTAMP WITH TIME ZONE",

    # ── Append-only consent log ──
    # user_id is ON DELETE SET NULL and email_hash is carried separately, so the
    # evidence survives anonymisation of the account it refers to. Append-only is
    # a convention enforced by there being no UPDATE or DELETE path in the code.
    """
    CREATE TABLE IF NOT EXISTS consent_log (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        email_hash CHAR(64),
        doc VARCHAR(20) NOT NULL,
        version VARCHAR(20) NOT NULL,
        action VARCHAR(20) NOT NULL,
        channel VARCHAR(20) NOT NULL DEFAULT 'web',
        ip_hash CHAR(64),
        user_agent VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_consent_log_user ON consent_log(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_consent_log_email ON consent_log(email_hash)",

    # ── Grandfather existing accounts ──
    # Accounts created before consent capture existed are recorded as having
    # accepted the then-current documents at signup. This is an honest
    # reconstruction, not an assertion of fresh consent — and because the
    # version recorded ('2026-06') is older than the current one, every such
    # user is prompted to re-consent at next sign-in anyway.
    # Idempotent: the WHERE clause means a second run is a no-op.
    """
    UPDATE users
       SET terms_version = '2026-06',
           terms_accepted_at = created_at,
           privacy_version = '2026-06',
           privacy_accepted_at = created_at
     WHERE terms_accepted_at IS NULL
    """,
]


def run_consent_migration():
    """Create consent columns and the consent_log table. Idempotent."""
    engine = get_engine()
    if engine is None:
        logger.warning("No database engine available, skipping consent migration")
        return

    with engine.begin() as conn:
        for statement in _STATEMENTS:
            conn.execute(text(statement))

    logger.info("Consent migration complete")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_consent_migration()
