import sys
import unittest
from pathlib import Path

import pandas as pd


SRC_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC_DIR))

from features.bcd_features import (
    MAX_WAITING_DAYS,
    calc_bc_line,
    expiry_date,
    find_line_touch,
    line_price_on,
)
from labels.bcd_label import build_bcd_labels


def _bars(rows):
    """rows: (date, open, low) — high/close are irrelevant to the fill."""
    return pd.DataFrame(
        [{"Ngay": pd.Timestamp(d), "open": o, "low": lo} for d, o, lo in rows]
    )


def _ohlc(rows, stock_id="TEST"):
    """rows: (date, open, high, low, close)."""
    return pd.DataFrame([
        {"stock_id": stock_id, "Ngay": pd.Timestamp(d),
         "open": o, "high": h, "low": lo, "close": c}
        for d, o, h, lo, c in rows
    ])


def _event(signal_date, stock_id="TEST"):
    """A breakdown row with a flat line at 100 (B and C under 2% apart)."""
    return pd.DataFrame([{
        "stock_id": stock_id,
        "Ngay": pd.Timestamp(signal_date),
        "B_Ngay": pd.Timestamp("2026-06-01"), "B_close": 100.0,
        "C_Ngay": pd.Timestamp("2026-06-10"), "C_close": 99.5,
        "open": 100.0, "close": 100.0,
    }])


class BCLineTests(unittest.TestCase):
    def test_line_falls_at_a_calendar_day_slope(self):
        """B->C is interpolated over calendar days, so it keeps dropping over weekends."""
        # VCG: B 2026-07-13 @ 17.60 -> C 2026-07-21 @ 15.50 over 8 calendar days.
        anchor, price, slope = calc_bc_line({
            "B_Ngay": pd.Timestamp("2026-07-13"), "B_close": 17.60,
            "C_Ngay": pd.Timestamp("2026-07-21"), "C_close": 15.50,
            "Ngay": pd.Timestamp("2026-07-27"), "open": 15.55, "close": 15.30,
        })
        self.assertEqual(anchor, pd.Timestamp("2026-07-13").date())
        self.assertAlmostEqual(price, 17.60)
        self.assertAlmostEqual(slope, -0.2625)
        self.assertAlmostEqual(line_price_on(anchor, price, slope, "2026-07-27"), 13.925)

    def test_flat_fallback_when_b_and_c_are_too_close(self):
        """Under 2% apart the slope is noise, so the level is held horizontal."""
        # GEE: B 80.10 -> C 80.00 is 0.12% apart; mid of the breakdown candle is 78.45.
        anchor, price, slope = calc_bc_line({
            "B_Ngay": pd.Timestamp("2026-07-10"), "B_close": 80.10,
            "C_Ngay": pd.Timestamp("2026-07-15"), "C_close": 80.00,
            "Ngay": pd.Timestamp("2026-07-20"), "open": 80.90, "close": 76.00,
        })
        self.assertEqual(anchor, pd.Timestamp("2026-07-20").date())
        self.assertAlmostEqual(price, 78.45)
        self.assertEqual(slope, 0.0)
        # A flat line stays put no matter how far out it is projected.
        self.assertAlmostEqual(line_price_on(anchor, price, slope, "2026-08-30"), 78.45)

    def test_returns_none_without_usable_prices(self):
        self.assertIsNone(calc_bc_line({
            "B_Ngay": None, "B_close": None, "C_Ngay": None, "C_close": None,
            "Ngay": pd.Timestamp("2026-07-20"), "open": None, "close": None,
        }))


class FindLineTouchTests(unittest.TestCase):
    # A flat line at 100 keeps the arithmetic obvious.
    ANCHOR, PRICE, SLOPE = pd.Timestamp("2026-07-01").date(), 100.0, 0.0
    SIGNAL = pd.Timestamp("2026-07-01")

    def _touch(self, rows):
        return find_line_touch(_bars(rows), self.ANCHOR, self.PRICE, self.SLOPE, self.SIGNAL)

    def test_fills_at_the_line_when_the_day_trades_down_to_it(self):
        touch = self._touch([
            ("2026-07-02", 104.0, 101.0),   # never reaches 100
            ("2026-07-03", 103.0, 99.0),    # dips through -> limit fills at 100
        ])
        self.assertEqual(touch, (pd.Timestamp("2026-07-03").date(), 100.0))

    def test_fills_at_the_open_when_the_session_gaps_below_the_line(self):
        """A limit at 100 cannot fill at 100 in a session that opened at 95."""
        touch = self._touch([("2026-07-02", 95.0, 90.0)])
        self.assertEqual(touch, (pd.Timestamp("2026-07-02").date(), 95.0))

    def test_never_fills_at_the_days_low(self):
        """The literal 'entry at that day's low' rule would book 90 here."""
        touch = self._touch([("2026-07-02", 103.0, 90.0)])
        self.assertEqual(touch[1], 100.0)

    def test_ignores_the_breakdown_day_itself(self):
        """The signal only exists after that close, so no order was resting."""
        touch = self._touch([
            ("2026-07-01", 101.0, 95.0),    # breakdown day, already below the line
            ("2026-07-06", 104.0, 103.0),   # nothing later reaches it
        ])
        self.assertIsNone(touch)

    def test_takes_the_first_touch_not_the_deepest(self):
        touch = self._touch([
            ("2026-07-02", 103.0, 99.0),
            ("2026-07-03", 98.0, 80.0),
        ])
        self.assertEqual(touch, (pd.Timestamp("2026-07-02").date(), 100.0))

    def test_stops_looking_after_the_waiting_window(self):
        """Day 11 is past expiry, so the touch does not count."""
        expires = expiry_date(self.SIGNAL)
        self.assertEqual(expires, pd.Timestamp("2026-07-11").date())
        self.assertIsNone(self._touch([("2026-07-12", 103.0, 90.0)]))
        # The same bar one day earlier is still inside the window.
        self.assertIsNotNone(self._touch([("2026-07-11", 103.0, 90.0)]))

    def test_falling_line_waits_longer_and_buys_cheaper(self):
        """The B->C slope is the point: each day it asks a lower price."""
        rows = [
            ("2026-07-02", 103.0, 101.0),
            ("2026-07-03", 99.0, 97.0),
        ]
        # Held flat at 102, the order fills on the first session at 102.
        self.assertEqual(
            find_line_touch(_bars(rows), self.ANCHOR, 102.0, 0.0, self.SIGNAL),
            (pd.Timestamp("2026-07-02").date(), 102.0),
        )
        # Sloping down 2/day it is at 100 on 07-02 (missed) and 98 on 07-03.
        self.assertEqual(
            find_line_touch(_bars(rows), self.ANCHOR, 102.0, -2.0, self.SIGNAL),
            (pd.Timestamp("2026-07-03").date(), 98.0),
        )

    def test_skips_bars_with_no_price(self):
        touch = self._touch([
            ("2026-07-02", 103.0, 0.0),     # halted / no trades
            ("2026-07-03", 103.0, 99.0),
        ])
        self.assertEqual(touch, (pd.Timestamp("2026-07-03").date(), 100.0))

    def test_waiting_window_is_calendar_days(self):
        self.assertEqual(MAX_WAITING_DAYS, 10)
        self.assertEqual(expiry_date("2026-07-27"), pd.Timestamp("2026-08-06").date())


class BuildLabelsTests(unittest.TestCase):
    """The label must describe the trade the tracker would really have taken."""

    SIGNAL = "2026-07-01"

    def _label(self, rows):
        return build_bcd_labels(_event(self.SIGNAL), _ohlc(rows))

    def test_take_profit_is_a_win(self):
        out = self._label([
            ("2026-07-01", 101, 102, 100.5, 101),   # breakdown day, ignored
            ("2026-07-02", 101, 101, 99.0, 100),    # fills at 100
            ("2026-07-03", 100, 116, 100.0, 115),   # high >= 115 -> TP
        ])
        self.assertEqual(len(out), 1)
        row = out.iloc[0]
        self.assertEqual(row["entry_price"], 100.0)
        self.assertEqual(row["exit_status"], "TP")
        self.assertEqual(row["label"], 1)
        self.assertAlmostEqual(row["trade_return"], 0.15)

    def test_stop_loss_is_a_loss(self):
        out = self._label([
            ("2026-07-02", 101, 101, 99.0, 100),    # fills at 100
            ("2026-07-03", 100, 100, 92.0, 93),     # day 1: SL suppressed
            ("2026-07-04", 93, 94, 90.0, 91),       # day 2: low <= 93 -> SL
        ])
        row = out.iloc[0]
        self.assertEqual(row["exit_status"], "SL")
        self.assertEqual(row["label"], 0)
        self.assertAlmostEqual(row["trade_return"], -0.07)

    def test_stop_loss_is_suppressed_for_the_first_two_days(self):
        """A -7% dip on the fill day itself does not close the trade."""
        out = self._label([
            ("2026-07-02", 101, 101, 90.0, 95),     # fills at 100, low already < 93
            ("2026-07-03", 95, 116, 95.0, 115),     # TP the next day
        ])
        row = out.iloc[0]
        self.assertEqual(row["exit_status"], "TP")
        self.assertEqual(row["label"], 1)

    def test_events_the_market_never_reached_are_dropped(self):
        out = self._label([
            ("2026-07-02", 105, 106, 104.0, 105),
            ("2026-07-03", 105, 107, 104.0, 106),
        ])
        self.assertTrue(out.empty)

    def test_trades_still_open_at_the_end_of_data_are_dropped(self):
        """An unfinished trade has no outcome to learn from."""
        out = self._label([
            ("2026-07-02", 101, 101, 99.0, 100),    # fills at 100
            ("2026-07-03", 100, 101, 99.0, 100),    # neither TP nor SL, not timed out
        ])
        self.assertTrue(out.empty)

    def test_timeout_exits_at_the_close_around_day_60(self):
        """Not at the last price in the table — that would be look-ahead."""
        rows = [("2026-07-02", 101, 101, 99.0, 100)]              # fills at 100
        # A year of flat sessions: never TP, never SL.
        for i in range(1, 300):
            d = (pd.Timestamp("2026-07-02") + pd.Timedelta(days=i)).strftime("%Y-%m-%d")
            rows.append((d, 100, 101, 99.5, 100 + i * 0.1))       # drifts steadily up
        out = self._label(rows)

        row = out.iloc[0]
        self.assertEqual(row["exit_status"], "TIMEOUT")
        # ~60 calendar days after entry, not 300.
        self.assertLessEqual((row["exit_Ngay"] - row["entry_Ngay"]).days, 62)
        self.assertLess(row["exit_price"], 110)

    def test_label_follows_first_touch_not_the_eventual_high(self):
        """The old label called this a win; the tracker had already stopped out."""
        out = self._label([
            ("2026-07-02", 101, 101, 99.0, 100),    # fills at 100
            ("2026-07-03", 100, 100, 95.0, 96),
            ("2026-07-04", 96, 97, 90.0, 91),       # SL at 93 first
            ("2026-07-05", 91, 130, 91.0, 129),     # only then +30%
        ])
        row = out.iloc[0]
        self.assertEqual(row["exit_status"], "SL")
        self.assertEqual(row["label"], 0)


if __name__ == "__main__":
    unittest.main()
