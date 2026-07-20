import sys
import unittest
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine


SRC_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC_DIR))

from daily_pipeline.bcd_trade_tracker import _load_untracked_signals
from manager.trade_manager import TradeManager


class BCDTradeTrackerTests(unittest.TestCase):
    def test_loads_all_untracked_dates_regardless_of_confidence_threshold(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.exec_driver_sql("""
                CREATE TABLE bcd_signals (
                    id INTEGER PRIMARY KEY,
                    date DATE NOT NULL,
                    stock_id TEXT NOT NULL,
                    prob REAL NOT NULL,
                    passed_threshold BOOLEAN NOT NULL,
                    entry_price REAL,
                    tp_price REAL,
                    sl_price REAL
                )
            """)
            conn.exec_driver_sql("""
                CREATE TABLE bcd_trade_history (
                    id INTEGER PRIMARY KEY,
                    stock_id TEXT NOT NULL,
                    entry_date DATE NOT NULL
                )
            """)
            conn.exec_driver_sql("""
                INSERT INTO bcd_signals
                    (id, date, stock_id, prob, passed_threshold, entry_price, tp_price, sl_price)
                VALUES
                    (1, '2026-07-16', 'KSF', 0.678, 0, 75.80, 87.17, 70.49),
                    (2, '2026-07-16', 'NKG', 0.641, 0, 11.55, 13.28, 10.74),
                    (3, '2026-07-20', 'GEE', 0.697, 0, 79.15, 91.02, 73.61),
                    (4, '2026-07-20', 'VRE', 0.674, 0, 24.20, 27.83, 22.51),
                    (5, '2026-07-20', 'DXG', 0.673, 0, 11.32, 13.01, 10.52),
                    (6, '2026-07-20', 'NOENTRY', 0.900, 1, NULL, NULL, NULL)
            """)
            conn.exec_driver_sql("""
                INSERT INTO bcd_trade_history (id, stock_id, entry_date)
                VALUES (1, 'NKG', '2026-07-16')
            """)

        signals = _load_untracked_signals(engine)

        self.assertEqual(signals["stock_id"].tolist(), ["KSF", "GEE", "VRE", "DXG"])
        self.assertEqual(
            [str(value).split(" ")[0] for value in signals["Ngay"]],
            ["2026-07-16", "2026-07-20", "2026-07-20", "2026-07-20"],
        )

    def test_backfill_batch_keeps_one_open_position_per_stock(self):
        manager = TradeManager()
        signals = pd.DataFrame([
            {"Ngay": "2026-07-16", "stock_id": "ABC", "entry_price": 10, "tp_price": 11.5, "sl_price": 9.3},
            {"Ngay": "2026-07-20", "stock_id": "ABC", "entry_price": 11, "tp_price": 12.65, "sl_price": 10.23},
        ])

        manager.add_new_signals(signals)

        self.assertEqual(len(manager.data["trades"]), 1)
        self.assertEqual(manager.data["trades"][0]["entry_date"], "2026-07-16")


if __name__ == "__main__":
    unittest.main()
