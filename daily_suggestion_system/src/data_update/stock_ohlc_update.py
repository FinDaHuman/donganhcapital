import time
import numpy as np
import pandas as pd
from sqlalchemy import text

from vnstock import Vnstock
from data_access.db_connection import get_engine

vn = Vnstock()


class StockDataUpdater:

    def __init__(self,
                 stock_list_path,
                 from_date,
                 to_date):

        self.stock_list_path = stock_list_path

        self.from_date = pd.to_datetime(from_date).strftime("%Y-%m-%d")
        self.to_date = pd.to_datetime(to_date).strftime("%Y-%m-%d")

        self.stock_list = self._load_stock_list()

    # ------------------------------------
    # LOAD STOCK LIST
    # ------------------------------------

    def _load_stock_list(self):

        with open(self.stock_list_path, "r", encoding="utf-8-sig") as f:
            data = f.read().strip()

        return [
            s.strip().upper().replace("\ufeff", "")
            for s in data.split(",")
        ]

    # ------------------------------------
    # DOWNLOAD DATA WITH RETRY
    # ------------------------------------

    def _download_with_retry(self, stock_id, max_retry=5):

        for attempt in range(max_retry):

            try:

                stock = vn.stock(symbol=stock_id, source="KBS")

                df = stock.quote.history(
                    start=self.from_date,
                    end=self.to_date,
                    interval="1d"
                )

                if df is not None and len(df) > 0:
                    return df

            except Exception as e:

                print(f"{stock_id} retry {attempt+1}/{max_retry} error:", e)

            time.sleep(4)

        print(f"{stock_id} FAILED after retries")
        return None

    # ------------------------------------
    # DOWNLOAD ALL
    # ------------------------------------

    def fetch_all(self):

        all_dfs = []

        for stock_id in self.stock_list:

            print(f"Downloading {stock_id}")

            df = self._download_with_retry(stock_id)

            time.sleep(2)

            if df is None or len(df) == 0:
                print(f"No data {stock_id}")
                continue

            df = df.sort_values("time")

            df = df.rename(columns={
                "time": "Ngay"
            })

            df["stock_id"] = stock_id
            df["Ngay"] = pd.to_datetime(df["Ngay"])

            df["adj_open"] = df["open"]
            df["adj_high"] = df["high"]
            df["adj_low"] = df["low"]
            df["adj_close"] = df["close"]

            df["return"] = df["adj_close"].pct_change()
            df["log_return"] = np.log(df["adj_close"] / df["adj_close"].shift(1))
            df["thaydoi"] = df["return"]
            # drop dòng không tính được return (ngày đầu)
            df = df.dropna(subset=["return", "log_return", "thaydoi"])

            keep_cols = [
                "Ngay", "stock_id",
                "open", "high", "low", "close",
                "adj_open", "adj_high", "adj_low", "adj_close",
                "volume", "return", "log_return", "thaydoi"
            ]

            df = df[keep_cols]

            all_dfs.append(df)

        if len(all_dfs) == 0:
            return pd.DataFrame()

        final_df = pd.concat(all_dfs, ignore_index=True)

        final_df = final_df.sort_values(["stock_id", "Ngay"])

        final_df = final_df.drop_duplicates(subset=["stock_id", "Ngay"])

        print("Download finished")

        return final_df

    # ------------------------------------
    # INSERT DATABASE
    # ------------------------------------

    def insert_database(self, df):

        if df.empty:
            print("No data to insert")
            return

        engine = get_engine()

        df = df.drop_duplicates(subset=["stock_id", "Ngay"])
        df = df.replace([np.inf, -np.inf], np.nan)

        with engine.begin() as conn:

            df.to_sql(
                "stock_ohlc_temp",
                conn,
                if_exists="replace",
                index=False,
                chunksize=500,
                method="multi"
            )

            conn.execute(text("""
            INSERT INTO stock_ohlc (
                "Ngay", stock_id,
                open, high, low, close,
                adj_open, adj_high, adj_low, adj_close,
                volume, return, log_return, thaydoi
            )
            SELECT
                "Ngay", stock_id,
                open, high, low, close,
                adj_open, adj_high, adj_low, adj_close,
                volume, return, log_return, thaydoi
            FROM stock_ohlc_temp
            ON CONFLICT ("stock_id","Ngay") DO NOTHING
            """))

            conn.execute(text("DROP TABLE stock_ohlc_temp"))

        print("Insert finished (duplicates skipped)")

    # ------------------------------------
    # FULL PIPELINE
    # ------------------------------------

    def run(self):

        print("START UPDATE")

        df = self.fetch_all()

        if df.empty:
            print("No data downloaded")
            return

        self.insert_database(df)

        print("UPDATE FINISHED")