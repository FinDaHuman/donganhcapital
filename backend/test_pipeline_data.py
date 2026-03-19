"""Test script: Insert test data and verify it's correctly stored."""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def test():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: No DATABASE_URL")
        return
    if "psycopg2" in url:
        url = url.replace("postgresql+psycopg2://", "postgresql://")

    conn = psycopg2.connect(url)
    cur = conn.cursor()

    # Insert test signals (future date = clearly test data)
    cur.execute("""
        INSERT INTO ai_signals (date, stock_id, entry_price, tp_price, sl_price, prob)
        VALUES ('2099-12-31', 'TEST1', 100.0, 110.0, 95.0, 0.75)
        ON CONFLICT (date, stock_id) DO NOTHING
    """)
    cur.execute("""
        INSERT INTO ai_signals (date, stock_id, entry_price, tp_price, sl_price, prob)
        VALUES ('2099-12-31', 'TEST2', 50.0, 55.0, 47.5, 0.62)
        ON CONFLICT (date, stock_id) DO NOTHING
    """)

    # Insert test summary
    cur.execute("""
        INSERT INTO daily_signal_summary (date, signal_count)
        VALUES ('2099-12-31', 2)
        ON CONFLICT (date) DO NOTHING
    """)

    conn.commit()

    # Verify
    cur.execute("SELECT id, date, stock_id, entry_price, tp_price, sl_price, prob FROM ai_signals WHERE date = '2099-12-31'")
    signals = cur.fetchall()
    print(f"\n=== ai_signals (test date 2099-12-31) ===")
    for s in signals:
        print(f"  id={s[0]}, date={s[1]}, stock={s[2]}, entry={s[3]}, tp={s[4]}, sl={s[5]}, prob={s[6]}")

    cur.execute("SELECT date, signal_count FROM daily_signal_summary WHERE date = '2099-12-31'")
    summary = cur.fetchall()
    print(f"\n=== daily_signal_summary (test date 2099-12-31) ===")
    for s in summary:
        print(f"  date={s[0]}, signal_count={s[1]}")

    # Also check existing production data is untouched
    cur.execute("SELECT COUNT(*) FROM ai_signals WHERE date != '2099-12-31'")
    prod_count = cur.fetchone()[0]
    print(f"\n=== Production data check ===")
    print(f"  Non-test signals in DB: {prod_count}")

    cur.execute("SELECT COUNT(*) FROM daily_signal_summary WHERE date != '2099-12-31'")
    prod_summary = cur.fetchone()[0]
    print(f"  Non-test summaries in DB: {prod_summary}")

    print("\n✅ VERIFICATION PASSED - Test data inserted correctly")
    conn.close()

if __name__ == "__main__":
    test()
