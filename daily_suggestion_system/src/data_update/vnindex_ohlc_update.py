import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
import numpy as np
import pytz
from sqlalchemy import text

sys.path.append(str(Path(__file__).resolve().parents[3] / "backend"))
from market_data import history

from data_access.db_connection import get_engine


def update_vnindex_ohlc(start="2009-06-01", end=None):

    engine = get_engine()

    print("Downloading VNINDEX data...")

    if end is None:
        end = datetime.now(pytz.timezone("Asia/Ho_Chi_Minh")).strftime("%Y-%m-%d")

    # KBS first: its bars matched the stored open/high/low/close on every day of
    # 2026 (checked 2026-09-28). VCI is only a fallback — same close, but its low
    # differs on some days and its volume includes put-through trades while KBS's
    # settled bar does not. No model reads index_volume; it feeds the VNINDEX chart.
    market_df = None
    for source in ("KBS", "VCI"):
        try:
            market_df = history("VNINDEX", start=start, end=end, interval="1d", source=source)
            break
        except Exception as e:
            print(f"VNINDEX fetch via {source} failed: {e}")
            if source == "VCI":
                raise

    if market_df is None or len(market_df) == 0:
        print("No VNINDEX data")
        return pd.DataFrame()

    market_df = market_df.sort_values("time")

    market_df = market_df.rename(columns={
        "time": "Ngay",
        "open": "index_open",
        "high": "index_high",
        "low": "index_low",
        "close": "index_close",
        "volume": "index_volume"
    })

    market_df["Ngay"] = pd.to_datetime(market_df["Ngay"])

    market_df = market_df[
        [
            "Ngay",
            "index_open",
            "index_high",
            "index_low",
            "index_close",
            "index_volume"
        ]
    ]

    # Remove duplicate in dataframe
    market_df = market_df.drop_duplicates(subset=["Ngay"])

    # avoid numeric error
    market_df = market_df.replace([np.inf, -np.inf], np.nan)

    with engine.begin() as conn:

        # Insert temp table
        market_df.to_sql(
            "vnindex_temp",
            conn,
            if_exists="replace",
            index=False,
            chunksize=500,
            method="multi"
        )

        # Upsert main table (DO UPDATE to fix any previously corrupted rows)
        conn.execute(text("""
        INSERT INTO vnindex_ohlc (
            "Ngay",
            index_open,
            index_high,
            index_low,
            index_close,
            index_volume
        )
        SELECT
            "Ngay",
            index_open,
            index_high,
            index_low,
            index_close,
            index_volume
        FROM vnindex_temp
        ON CONFLICT ("Ngay") DO UPDATE SET
            index_open = EXCLUDED.index_open,
            index_high = EXCLUDED.index_high,
            index_low = EXCLUDED.index_low,
            index_close = EXCLUDED.index_close,
            index_volume = EXCLUDED.index_volume
        """))

        # Remove temp table
        conn.execute(text("DROP TABLE vnindex_temp"))

    print("VNINDEX updated:", len(market_df), "rows")

    return market_df
