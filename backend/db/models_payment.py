"""
Payment database model and migration for DongAnh Capital.
Stores payment orders, tracks subscription status.
"""

from db.connection import get_engine
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


def run_payment_migration():
    """Create payments table if it doesn't exist.
    
    Payment flow:
    1. User creates order → status='pending', expires in 30 min
    2. SePay webhook confirms payment → status='completed'
    3. User's subscription tier is updated
    4. Expired unpaid orders → status='expired' (cleanup job)
    """
    engine = get_engine()
    if engine is None:
        logger.warning("No database engine available, skipping payment migration")
        return

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS payments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                order_code VARCHAR(50) NOT NULL,
                amount INTEGER NOT NULL,
                plan VARCHAR(20) NOT NULL,
                period VARCHAR(20) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                sepay_ref VARCHAR(100),
                sepay_transaction_id VARCHAR(100),
                bank_account VARCHAR(50),
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                completed_at TIMESTAMP WITH TIME ZONE,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                subscription_start TIMESTAMP WITH TIME ZONE,
                subscription_end TIMESTAMP WITH TIME ZONE
            );
        """))

        # Safe column additions for existing tables
        conn.execute(text("""
            ALTER TABLE payments
            ADD COLUMN IF NOT EXISTS credit_amount INTEGER NOT NULL DEFAULT 0;
        """))

        # Create indexes
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order_code
            ON payments(order_code);
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_payments_user_id
            ON payments(user_id);
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_payments_status
            ON payments(status);
        """))

    logger.info("Payment migration completed successfully")
