import pandas as pd
import numpy as np
from datetime import datetime
from sqlalchemy import text
from vnstock import Vnstock
import sys
import os

# Add parent directory to path to allow importing data_access
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from src.data_access.db_connection import get_engine

def update_vn30f1m_intraday():
    vn = Vnstock()
    engine = get_engine()

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
        return

    if df is None or len(df) == 0:
        print("No intraday data returned")
        return

    df = df.rename(columns={"time": "time"})
    df["time"] = pd.to_datetime(df["time"])
    df = df[["time", "open", "high", "low", "close", "volume"]]
    df = df.drop_duplicates(subset=["time"])
    df = df.replace([np.inf, -np.inf], np.nan)

    with engine.begin() as conn:
        df.to_sql("vn30f1m_temp", conn,
                  if_exists="replace",
                  index=False,
                  chunksize=500)

        conn.execute(text("""
            INSERT INTO vn30f1m_intraday 
                (time, open, high, low, close, volume)
            SELECT 
                time, open, high, low, close, volume
            FROM vn30f1m_temp
            ON CONFLICT (time) DO UPDATE SET
                open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                volume = EXCLUDED.volume
        """))

        conn.execute(text("DROP TABLE vn30f1m_temp"))

    print(f"Saved {len(df)} candles for {today}")

if __name__ == "__main__":
    update_vn30f1m_intraday()
