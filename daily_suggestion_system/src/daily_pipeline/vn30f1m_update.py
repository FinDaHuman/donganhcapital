import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import pytz
from sqlalchemy import text
import sys
import os
from uuid import uuid4
from pathlib import Path

# Share the API's calendar so its poller and the batch writer reject the same dates.
sys.path.append(str(Path(__file__).resolve().parents[3] / 'backend'))
from market_calendar import filter_intraday_sessions
from market_data import history

from data_access.db_connection import get_engine

def update_vn30f1m_intraday():
    engine = get_engine()
    
    if not engine:
        print("No database engine available")
        raise RuntimeError("No database engine available")

    vn_tz = pytz.timezone('Asia/Ho_Chi_Minh')
    now = datetime.now(vn_tz)
    today = now.strftime("%Y-%m-%d")
    # Rolling window rather than today-only, matching database_update.py. This
    # table is the one place in the pipeline that could not repair itself: the
    # fetch asked for "today" and nothing else, so a day missed for any reason
    # was gone permanently — re-running the next day just asked for the new
    # today. The upsert is ON CONFLICT (time) DO UPDATE, so re-fetching days we
    # already hold rewrites identical rows and costs one request.
    #
    # Widened 3 -> 10 days on 2026-08-07. Three days was not enough to survive a
    # real outage: no run happened between 2026-07-31 and 2026-08-03, so Jul 31
    # fell out of every subsequent window and was still missing a week later.
    # This is one request either way, so the only thing that grows is the
    # response payload.
    start = (now - timedelta(days=10)).strftime("%Y-%m-%d")

    print(f"Fetching VN30F1M intraday for {start} -> {today}...")

    try:
        df = history(
            "VN30F1M",
            start=start,
            end=today,
            interval="1m"
        )
    except Exception as e:
        print(f"VN30F1M fetch failed: {e}")
        raise RuntimeError(f"VN30F1M fetch failed: {e}")

    if df is None or len(df) == 0:
        # Empty is NOT an error. Raising here used to turn the whole run red
        # while steps 1, 2 and 4-7 had all succeeded and written real rows —
        # which teaches everyone to ignore a red run, and that is how a genuine
        # failure eventually gets missed.
        #
        # Note this is a weaker signal than it looks now that the window spans
        # several days: a weekend still contains a Friday, so zero rows across
        # the whole window means an extended holiday (Tet) or a broken source,
        # not an ordinary quiet day. The caller logs it at WARNING for that
        # reason.
        #
        # A real problem still raises: a missing engine and a failed fetch are
        # both handled above, and any DB write error propagates below. Only
        # "the source returned zero rows" is treated as ordinary.
        print(f"No intraday data for {start} -> {today} - extended holiday, or check the source")
        return 0

    df = filter_intraday_sessions(df)
    if df.empty:
        print(f"No trading-session intraday data for {start} -> {today}")
        return 0

    df = df.rename(columns={"time": "time"})
    df["time"] = pd.to_datetime(df["time"])
    df = df[["time", "open", "high", "low", "close", "volume"]]
    df = df.drop_duplicates(subset=["time"])
    df = df.replace([np.inf, -np.inf], np.nan)

    temp_table = f"vn30f1m_temp_{uuid4().hex}"
    
    try:
        with engine.begin() as conn:
            df.to_sql(temp_table, conn,
                      if_exists="replace",
                      index=False,
                      chunksize=500)

            conn.execute(text(f"""
                INSERT INTO vn30f1m_intraday 
                    (time, open, high, low, close, volume)
                SELECT 
                    time, open, high, low, close, volume
                FROM {temp_table}
                ON CONFLICT (time) DO UPDATE SET
                    open = EXCLUDED.open,
                    high = EXCLUDED.high,
                    low = EXCLUDED.low,
                    close = EXCLUDED.close,
                    volume = EXCLUDED.volume
            """))
    finally:
        with engine.begin() as conn:
            conn.execute(text(f"DROP TABLE IF EXISTS {temp_table}"))

    print(f"Saved {len(df)} candles; latest market timestamp: {df['time'].max()}")
    return len(df)

if __name__ == "__main__":
    update_vn30f1m_intraday()
