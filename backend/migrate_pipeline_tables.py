"""
Migration script to create tables needed for the daily signal pipeline.
Creates: ai_signals, daily_signal_summary
Safe to run multiple times (IF NOT EXISTS).
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def migrate():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("No DATABASE_URL found.")
        return

    # psycopg2 needs postgresql:// instead of postgresql+psycopg2://
    if url.startswith("postgresql+psycopg2://"):
        url = url.replace("postgresql+psycopg2://", "postgresql://")

    conn = psycopg2.connect(url)
    cursor = conn.cursor()

    # 1. ai_signals table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_signals (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      stock_id VARCHAR(10) NOT NULL,
      entry_price NUMERIC,
      tp_price NUMERIC,
      sl_price NUMERIC,
      prob NUMERIC,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(date, stock_id)
    );
    """)
    print("ai_signals table created/verified")

    # 2. daily_signal_summary table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS daily_signal_summary (
      date DATE PRIMARY KEY,
      signal_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    """)
    print("daily_signal_summary table created/verified")

    conn.commit()
    cursor.close()
    conn.close()
    print("Migration complete!")

if __name__ == "__main__":
    migrate()
