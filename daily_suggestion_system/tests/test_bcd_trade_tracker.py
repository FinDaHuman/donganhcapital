import sys
import unittest
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine


SRC_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC_DIR))

from daily_pipeline.bcd_trade_tracker import _load_untracked_signals
from manager.trade_manager import TradeManager


def _signals_engine():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.exec_driver_sql("""
            CREATE TABLE bcd_signals (
                id INTEGER PRIMARY KEY,
                date DATE NOT NULL,
                stock_id TEXT NOT NULL,
                prob REAL NOT NULL,
                passed_threshold BOOLEAN NOT NULL,
                status TEXT NOT NULL,
                entry_date DATE,
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
    return engine


class BCDTradeTrackerTests(unittest.TestCase):
    def test_loads_all_untracked_dates_regardless_of_confidence_threshold(self):
        engine = _signals_engine()
        with engine.begin() as conn:
            # entry_date is the session that filled the limit order, always
            # later than the breakdown date in `date`.
            conn.exec_driver_sql("""
                INSERT INTO bcd_signals
                    (id, date, stock_id, prob, passed_threshold, status,
                     entry_date, entry_price, tp_price, sl_price)
                VALUES
                    (1, '2026-07-16', 'KSF', 0.678, 0, 'TRIGGERED', '2026-07-17', 75.50, 86.83, 70.22),
                    (2, '2026-07-16', 'NKG', 0.641, 0, 'TRIGGERED', '2026-07-17', 11.50, 13.23, 10.70),
                    (3, '2026-07-20', 'GEE', 0.697, 0, 'TRIGGERED', '2026-07-21', 75.50, 86.83, 70.22),
                    (4, '2026-07-20', 'VRE', 0.674, 0, 'TRIGGERED', '2026-07-21', 23.00, 26.45, 21.39),
                    (5, '2026-07-20', 'DXG', 0.673, 0, 'TRIGGERED', '2026-07-21', 11.05, 12.71, 10.28)
            """)
            conn.exec_driver_sql("""
                INSERT INTO bcd_trade_history (id, stock_id, entry_date)
                VALUES (1, 'NKG', '2026-07-17')
            """)

        signals = _load_untracked_signals(engine)

        self.assertEqual(signals["stock_id"].tolist(), ["KSF", "GEE", "VRE", "DXG"])
        self.assertEqual(
            [str(value).split(" ")[0] for value in signals["Ngay"]],
            ["2026-07-17", "2026-07-21", "2026-07-21", "2026-07-21"],
        )

    def test_only_triggered_signals_become_trades(self):
        """A limit order the market never reached is not a trade."""
        engine = _signals_engine()
        with engine.begin() as conn:
            conn.exec_driver_sql("""
                INSERT INTO bcd_signals
                    (id, date, stock_id, prob, passed_threshold, status,
                     entry_date, entry_price, tp_price, sl_price)
                VALUES
                    (1, '2026-07-21', 'FILLED',  0.60, 0, 'TRIGGERED', '2026-07-22', 34.50, 39.68, 32.09),
                    (2, '2026-07-21', 'WAITING', 0.90, 1, 'WAITING',   NULL, NULL, NULL, NULL),
                    (3, '2026-07-16', 'EXPIRED', 0.95, 1, 'EXPIRED',   NULL, NULL, NULL, NULL)
            """)

        signals = _load_untracked_signals(engine)

        self.assertEqual(signals["stock_id"].tolist(), ["FILLED"])

    def test_update_positions_resolves_tp_sl_and_timeout(self):
        """Pins the shared exit rules — the AI breakout tracker uses this too."""
        market = pd.DataFrame([
            # WINNER hits TP on day 2.
            {"stock_id": "WINNER", "Ngay": "2026-07-01", "high": 10.5, "low": 9.8, "close": 10.2},
            {"stock_id": "WINNER", "Ngay": "2026-07-02", "high": 11.6, "low": 10.0, "close": 11.5},
            # LOSER dips below SL on the entry day (suppressed) then again on day 3.
            {"stock_id": "LOSER", "Ngay": "2026-07-01", "high": 10.1, "low": 9.0, "close": 9.5},
            {"stock_id": "LOSER", "Ngay": "2026-07-03", "high": 9.6, "low": 9.0, "close": 9.1},
            # OPEN never reaches either level.
            {"stock_id": "OPEN", "Ngay": "2026-07-01", "high": 10.2, "low": 9.9, "close": 10.0},
            {"stock_id": "OPEN", "Ngay": "2026-07-03", "high": 10.3, "low": 9.9, "close": 10.1},
        ])

        manager = TradeManager(timeout_days=30)
        manager.data["trades"] = [
            {"stock_id": s, "entry_date": "2026-07-01", "entry_price": 10.0,
             "tp_price": 11.5, "sl_price": 9.3, "exit_date": None, "exit_price": None,
             "status": "HOLD", "return_pct": None, "holding_days": None}
            for s in ("WINNER", "LOSER", "OPEN")
        ]
        manager.update_positions(market)
        by_stock = {t["stock_id"]: t for t in manager.data["trades"]}

        self.assertEqual(by_stock["WINNER"]["status"], "TP")
        self.assertEqual(by_stock["WINNER"]["exit_date"], "2026-07-02")
        self.assertEqual(by_stock["WINNER"]["exit_price"], 11.5)

        self.assertEqual(by_stock["LOSER"]["status"], "SL")
        self.assertEqual(by_stock["LOSER"]["exit_date"], "2026-07-03")

        self.assertEqual(by_stock["OPEN"]["status"], "HOLD")
        self.assertIsNone(by_stock["OPEN"]["exit_date"])

    def test_update_positions_times_out_at_the_last_close(self):
        market = pd.DataFrame([
            {"stock_id": "STALE", "Ngay": "2026-07-01", "high": 10.2, "low": 9.9, "close": 10.0},
            {"stock_id": "STALE", "Ngay": "2026-08-05", "high": 10.3, "low": 9.9, "close": 10.4},
        ])
        manager = TradeManager(timeout_days=30)
        manager.data["trades"] = [{
            "stock_id": "STALE", "entry_date": "2026-07-01", "entry_price": 10.0,
            "tp_price": 11.5, "sl_price": 9.3, "exit_date": None, "exit_price": None,
            "status": "HOLD", "return_pct": None, "holding_days": None,
        }]
        manager.update_positions(market)

        trade = manager.data["trades"][0]
        self.assertEqual(trade["status"], "TIMEOUT")
        self.assertEqual(trade["exit_date"], "2026-08-05")
        self.assertEqual(trade["exit_price"], 10.4)

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
