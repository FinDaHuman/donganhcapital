import time

import numpy as np
import pandas as pd
from sqlalchemy import text

from vnstock import Quote

from data_access.db_connection import get_engine

REQUEST_SPACING_SECONDS = 4
RATE_LIMIT_BACKOFF_SECONDS = 60
RETURN_LOOKBACK_DAYS = 10


class StockDataUpdater:
    def __init__(self, stock_list_path, from_date, to_date):
        self.stock_list_path = stock_list_path
        self.from_date = pd.to_datetime(from_date).strftime("%Y-%m-%d")
        self.to_date = pd.to_datetime(to_date).strftime("%Y-%m-%d")
        self.fetch_from_date = (
            pd.to_datetime(self.from_date) - pd.Timedelta(days=RETURN_LOOKBACK_DAYS)
        ).strftime("%Y-%m-%d")

        self.stock_list = self._load_stock_list()
        self.failed_tickers = []

    def _load_stock_list(self):
        with open(self.stock_list_path, "r", encoding="utf-8-sig") as f:
            data = f.read().strip()

        stocks = [
            s.strip().upper().replace("\ufeff", "")
            for s in data.split(",")
            if s.strip()
        ]

        # Preserve file order while removing duplicates to avoid wasting API quota.
        return list(dict.fromkeys(stocks))

    def _download_with_retry(self, stock_id, max_retry=5):
        for attempt in range(max_retry):
            try:
                df = Quote(symbol=stock_id, source="VCI").history(
                    start=self.fetch_from_date,
                    end=self.to_date,
                    interval="1d",
                )

                if df is not None and len(df) > 0:
                    return df

                return pd.DataFrame()
            except Exception as e:
                print(f"{stock_id} retry {attempt + 1}/{max_retry} error:", e)

                error_text = str(e).lower()
                if "rate limit" in error_text or "giới hạn api" in error_text:
                    time.sleep(RATE_LIMIT_BACKOFF_SECONDS)
                    continue

            time.sleep(REQUEST_SPACING_SECONDS)

        print(f"{stock_id} FAILED after retries")
        return None

    def fetch_all(self):
        all_dfs = []

        for stock_id in self.stock_list:
            print(f"Downloading {stock_id}")

            df = self._download_with_retry(stock_id)
            time.sleep(REQUEST_SPACING_SECONDS)

            if df is None:
                self.failed_tickers.append(stock_id)
                continue

            if len(df) == 0:
                print(f"No data {stock_id}")
                continue

            df = df.sort_values("time")
            df = df.rename(columns={"time": "Ngay"})

            df["stock_id"] = stock_id
            df["Ngay"] = pd.to_datetime(df["Ngay"])

            df["adj_open"] = df["open"]
            df["adj_high"] = df["high"]
            df["adj_low"] = df["low"]
            df["adj_close"] = df["close"]

            df["return"] = df["adj_close"].pct_change()
            df["log_return"] = np.log(df["adj_close"] / df["adj_close"].shift(1))
            df["thaydoi"] = df["return"]
            df = df[df["Ngay"] >= pd.to_datetime(self.from_date)]
            df = df.dropna(subset=["return", "log_return", "thaydoi"])

            keep_cols = [
                "Ngay",
                "stock_id",
                "open",
                "high",
                "low",
                "close",
                "adj_open",
                "adj_high",
                "adj_low",
                "adj_close",
                "volume",
                "return",
                "log_return",
                "thaydoi",
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
                method="multi",
            )

            conn.execute(
                text(
                    """
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
            ON CONFLICT ("stock_id","Ngay") DO UPDATE SET
                open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                adj_open = EXCLUDED.adj_open,
                adj_high = EXCLUDED.adj_high,
                adj_low = EXCLUDED.adj_low,
                adj_close = EXCLUDED.adj_close,
                volume = EXCLUDED.volume,
                return = EXCLUDED.return,
                log_return = EXCLUDED.log_return,
                thaydoi = EXCLUDED.thaydoi
            """
                )
            )

            conn.execute(text("DROP TABLE stock_ohlc_temp"))

        print("Insert finished (upserted latest data)")

    def run(self):
        print("START UPDATE")

        df = self.fetch_all()

        if self.failed_tickers:
            raise RuntimeError(
                "Stock download failed for "
                + ", ".join(self.failed_tickers[:10])
                + (" ..." if len(self.failed_tickers) > 10 else "")
            )

        if df.empty:
            print("No data downloaded")
            return df

        self.insert_database(df)

        print("UPDATE FINISHED")
        return df
