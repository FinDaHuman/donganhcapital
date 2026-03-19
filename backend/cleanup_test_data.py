"""Cleanup: Remove test data from NeonDB after verification."""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def cleanup():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: No DATABASE_URL")
        return
    if "psycopg2" in url:
        url = url.replace("postgresql+psycopg2://", "postgresql://")

    conn = psycopg2.connect(url)
    cur = conn.cursor()

    cur.execute("DELETE FROM ai_signals WHERE date = '2099-12-31'")
    deleted_signals = cur.rowcount
    cur.execute("DELETE FROM daily_signal_summary WHERE date = '2099-12-31'")
    deleted_summary = cur.rowcount

    conn.commit()
    print(f"Cleaned up: {deleted_signals} test signals, {deleted_summary} test summaries")
    conn.close()

if __name__ == "__main__":
    cleanup()
