import pandas as pd
import numpy as np
from sqlalchemy import text

from vnstock import Vnstock
from sqlalchemy import text
from data_access.db_connection import get_engine

vn = Vnstock()


def update_vnindex_ohlc(start="2009-06-01", end=None):

    engine = get_engine()

    print("Downloading VNINDEX data...")

    stock = vn.stock(symbol="VNINDEX", source="VCI")

    market_df = stock.quote.history(
        start=start,
        end=end,
        interval="1d"
    )

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

    # loại duplicate trong dataframe
    market_df = market_df.drop_duplicates(subset=["Ngay"])

    # tránh lỗi numeric
    market_df = market_df.replace([np.inf, -np.inf], np.nan)

    with engine.begin() as conn:

        # 1️⃣ insert vào bảng tạm
        market_df.to_sql(
            "vnindex_temp",
            conn,
            if_exists="replace",
            index=False,
            chunksize=500,
            method="multi"
        )

        # 2️⃣ upsert vào bảng chính
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
        ON CONFLICT ("Ngay") DO NOTHING
        """))

        # 3️⃣ drop bảng tạm
        conn.execute(text("DROP TABLE vnindex_temp"))

    print("VNINDEX updated:", len(market_df), "rows")

    return market_df