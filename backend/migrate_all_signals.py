"""
Migration script to bulk-load ALL daily signal JSONs and trade history into NeonDB.
Loads:
  - daily/*.json → ai_signals + daily_signal_summary
  - history/trade_history.json → trade_history
Safe to run multiple times (ON CONFLICT DO NOTHING / DO UPDATE).
"""
import os
import json
import glob
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DAILY_DIR = os.path.join(os.path.dirname(__file__), "..", "daily_suggestion_system", "src", "signals", "daily")
HISTORY_FILE = os.path.join(os.path.dirname(__file__), "..", "daily_suggestion_system", "src", "signals", "history", "trade_history.json")


def get_connection():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: No DATABASE_URL found.")
        return None
    if url.startswith("postgresql+psycopg2://"):
        url = url.replace("postgresql+psycopg2://", "postgresql://")
    return psycopg2.connect(url)


def ensure_tables(cursor):
    """Create tables if they don't exist."""
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
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS daily_signal_summary (
      date DATE PRIMARY KEY,
      signal_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS trade_history (
      id SERIAL PRIMARY KEY,
      stock_id VARCHAR(10) NOT NULL,
      entry_date DATE NOT NULL,
      entry_price NUMERIC,
      tp_price NUMERIC,
      sl_price NUMERIC,
      exit_date DATE,
      exit_price NUMERIC,
      status VARCHAR(10) NOT NULL,
      return_pct NUMERIC,
      holding_days INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(stock_id, entry_date)
    );
    """)
    print("Tables verified/created.")


def load_daily_signals(cursor):
    """Load all daily JSON files into ai_signals and daily_signal_summary."""
    json_files = sorted(glob.glob(os.path.join(DAILY_DIR, "*.json")))
    if not json_files:
        print(f"WARNING: No JSON files found in {DAILY_DIR}")
        return

    signals_inserted = 0
    summaries_inserted = 0

    for filepath in json_files:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        date_str = data["date"]
        signal_count = data.get("signal_count", len(data.get("signals", [])))
        signals = data.get("signals", [])

        # Insert into daily_signal_summary
        cursor.execute("""
            INSERT INTO daily_signal_summary (date, signal_count)
            VALUES (%s, %s)
            ON CONFLICT (date) DO UPDATE SET signal_count = EXCLUDED.signal_count, updated_at = NOW()
        """, (date_str, signal_count))
        summaries_inserted += 1

        # Insert each signal into ai_signals
        for sig in signals:
            cursor.execute("""
                INSERT INTO ai_signals (date, stock_id, entry_price, tp_price, sl_price, prob)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (date, stock_id) DO NOTHING
            """, (
                date_str,
                sig["stock_id"],
                sig.get("entry_price"),
                sig.get("tp_price"),
                sig.get("sl_price"),
                sig.get("prob"),
            ))
            signals_inserted += 1

    print(f"Daily signals: {signals_inserted} signal rows processed, {summaries_inserted} summary rows upserted.")


def load_trade_history(cursor):
    """Load trade_history.json into trade_history table."""
    if not os.path.exists(HISTORY_FILE):
        print(f"WARNING: {HISTORY_FILE} not found, skipping trade history.")
        return

    with open(HISTORY_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    trades = data.get("trades", [])
    rows_inserted = 0

    for trade in trades:
        # Parse dates - handle "YYYY-MM-DD HH:MM:SS" format
        entry_date = trade["entry_date"].split(" ")[0] if trade.get("entry_date") else None
        exit_date = trade["exit_date"].split(" ")[0] if trade.get("exit_date") else None

        cursor.execute("""
            INSERT INTO trade_history (stock_id, entry_date, entry_price, tp_price, sl_price, exit_date, exit_price, status, return_pct, holding_days)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (stock_id, entry_date) DO NOTHING
        """, (
            trade["stock_id"],
            entry_date,
            trade.get("entry_price"),
            trade.get("tp_price"),
            trade.get("sl_price"),
            exit_date,
            trade.get("exit_price"),
            trade["status"],
            trade.get("return_pct"),
            trade.get("holding_days"),
        ))
        rows_inserted += 1

    print(f"Trade history: {rows_inserted} trade rows processed.")


def verify(cursor):
    """Print verification counts."""
    cursor.execute("SELECT COUNT(*) FROM ai_signals")
    sig_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM daily_signal_summary")
    sum_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM trade_history")
    trade_count = cursor.fetchone()[0]
    print(f"\n=== Verification ===")
    print(f"  ai_signals:          {sig_count} rows")
    print(f"  daily_signal_summary: {sum_count} rows")
    print(f"  trade_history:        {trade_count} rows")


def main():
    conn = get_connection()
    if not conn:
        return

    cursor = conn.cursor()
    try:
        ensure_tables(cursor)
        load_daily_signals(cursor)
        load_trade_history(cursor)
        conn.commit()
        verify(cursor)
        print("\n✅ Migration complete!")
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
