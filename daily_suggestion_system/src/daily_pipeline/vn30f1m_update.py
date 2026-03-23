import pandas as pd
import numpy as np
from datetime import datetime
from sqlalchemy import text
from vnstock import Vnstock
import sys
import os
from uuid import uuid4

from data_access.db_connection import get_engine

def update_vn30f1m_intraday():
    vn = Vnstock()
    engine = get_engine()
    
    if not engine:
        print("No database engine available")
        raise RuntimeError("No database engine available")

    today = datetime.today().strftime("%Y-%m-%d")

    print(f"Fetching VN30F1M intraday for {today}...")

    try:
        stock = vn.stock(symbol="VN30F1M", source="VCI")
        df = stock.quote.history(
            start=today,
            end=today,
            interval="1m"
        )
    except Exception as e:
        print(f"VN30F1M fetch failed: {e}")
        raise RuntimeError(f"VN30F1M fetch failed: {e}")

    if df is None or len(df) == 0:
        print("No intraday data returned")
        raise RuntimeError("No intraday data returned")

    df = df.rename(columns={"time": "time"})
    df["time"] = pd.to_datetime(df["time"])
    df = df[["time", "open", "high", "low", "close", "volume"]]
    df = df.drop_duplicates(subset=["time"])
    df = df.replace([np.inf, -np.inf], np.nan)

    temp_table = f"vn30f1m_temp_{uuid4().hex}"
    
    with engine.begin() as conn:
        try:
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
            conn.execute(text(f"DROP TABLE IF EXISTS {temp_table}"))

    print(f"Saved {len(df)} candles for {today}")

if __name__ == "__main__":
    update_vn30f1m_intraday()
