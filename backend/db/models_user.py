"""
User database model and migration for DongAnh Capital authentication.
Uses direct SQL migration (matching existing project pattern with NeonDB).
"""

from db.connection import get_engine
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


def run_user_migration():
    """Create users table if it doesn't exist.
    
    Security design:
    - email is unique and indexed for fast lookups
    - google_id indexed for OAuth lookups
    - hashed_password is nullable (Google-only users don't have one)
    - refresh_token_hash stores bcrypt hash of refresh token (not the token itself)
    - failed_login_attempts + locked_until implement account lockout
    """
    engine = get_engine()
    if engine is None:
        logger.warning("No database engine available, skipping user migration")
        return

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(254) NOT NULL,
                hashed_password VARCHAR(255),
                full_name VARCHAR(100),
                avatar_url VARCHAR(500),
                google_id VARCHAR(50),
                auth_provider VARCHAR(20) NOT NULL DEFAULT 'email',
                risk_appetite VARCHAR(20) NOT NULL DEFAULT 'moderate',
                subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free',
                subscription_period VARCHAR(20),
                subscription_expires_at TIMESTAMP WITH TIME ZONE,
                failed_login_attempts INTEGER NOT NULL DEFAULT 0,
                locked_until TIMESTAMP WITH TIME ZONE,
                refresh_token_hash VARCHAR(255),
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
        """))

        # Safe column additions for existing tables
        conn.execute(text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS subscription_period VARCHAR(20);
        """))

        # Refresh token rotation — keep one previous hash so concurrent-tab
        # requests that present the just-rotated-away token aren't mis-classified
        # as theft and don't trigger a full session wipe.
        conn.execute(text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS refresh_token_prev_hash VARCHAR(255);
        """))
        conn.execute(text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS refresh_rotated_at TIMESTAMP WITH TIME ZONE;
        """))

        # Password reset: store only the SHA-256 hash of the token (never the token
        # itself), mirroring the refresh_token_hash convention. Ephemeral — cleared
        # on use — so it lives on the users row rather than a separate table.
        conn.execute(text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(255);
        """))
        conn.execute(text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMP WITH TIME ZONE;
        """))

        # Free Pro trial offer (limited-time, 1 week). One claim per account,
        # enforced naturally by the unique users.email row: NULL = never claimed,
        # a timestamp = claimed (never cleared, so the trial can't be re-claimed
        # even after it expires and the user returns to the free tier).
        conn.execute(text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS pro_trial_claimed_at TIMESTAMP WITH TIME ZONE;
        """))

        # Create indexes safely (IF NOT EXISTS)
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
            ON users(email);
        """))
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
            ON users(google_id)
            WHERE google_id IS NOT NULL;
        """))
        # Partial index: only the handful of rows with an active reset token.
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_users_reset_token_hash
            ON users(reset_token_hash)
            WHERE reset_token_hash IS NOT NULL;
        """))

    logger.info("User migration completed successfully")
