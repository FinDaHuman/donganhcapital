"""
BCD training labels.

Each breakdown event is labelled by simulating the trade the production system
would actually have taken:

    1. Rest a limit buy on the B->C line (features.bcd_features.calc_bc_line).
    2. Fill on the first session after the breakdown whose low reaches that
       line, at min(open, line) — features.bcd_features.find_line_touch.
    3. Run the position through the same TP/SL/TIMEOUT rules the tracker uses —
       manager.trade_manager.resolve_trade_exit.
    4. label = 1 iff the trade closes at TP.

Two consequences worth knowing:

* Events the market never came back to are DROPPED, not labelled 0. They cost
  nothing (the order simply never fills), so the model's job is the conditional
  question "given a fill, does this reach +15% before -7%?". That is exactly
  what a WAITING card on the BCD tab is claiming.

* The label is a FIRST-TOUCH outcome. The previous version asked whether the
  max high over 60 sessions reached +15% and ignored the stop entirely, so it
  scored trades as wins that the tracker had already closed at -7%.

Every rule here is imported, never restated, so a label and the trade it
describes cannot drift apart.
"""
import sys
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd

SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from features.bcd_features import (
    MAX_WAITING_DAYS,
    SL_MULT,
    TP_MULT,
    calc_bc_line,
    find_line_touch,
)
from manager.trade_manager import resolve_trade_exit

# Calendar days an open position is held before it is forced out at the close.
# Matches bcd_trade_tracker.TIMEOUT_DAYS.
TIMEOUT_DAYS = 60


def build_bcd_labels(event_df: pd.DataFrame, full_df: pd.DataFrame,
                     waiting_days: int = MAX_WAITING_DAYS,
                     timeout_days: int = TIMEOUT_DAYS) -> pd.DataFrame:
    """Label breakdown events by simulating their trade.

    Args:
        event_df: breakdown rows (breakdown == 1) carrying B_Ngay/B_close,
            C_Ngay/C_close and the breakdown candle's open/close.
        full_df: the full OHLC history the events were detected on.

    Returns one row per event that produced a trade, with the event's own
    columns plus entry_Ngay, entry_price, tp_price, sl_price, exit_Ngay,
    exit_price, exit_status, trade_return and label.
    """
    full_df = (
        full_df.copy()
        .sort_values(["stock_id", "Ngay"])
        .reset_index(drop=True)
    )
    full_df["Ngay"] = pd.to_datetime(full_df["Ngay"])

    bars_by_stock = {}
    for stock, g in full_df.groupby("stock_id", sort=False):
        g = g.reset_index(drop=True)
        bars_by_stock[stock] = (g, g["Ngay"].to_numpy(dtype="datetime64[ns]"))

    results = []
    for stock, events in event_df.groupby("stock_id", sort=False):
        entry = bars_by_stock.get(stock)
        if entry is None:
            continue
        bars, dates = entry
        if len(bars) == 0:
            continue

        for _, event in events.iterrows():
            line = calc_bc_line(event)
            if line is None:
                continue
            anchor_date, anchor_price, slope = line

            signal_ts = pd.Timestamp(event["Ngay"])
            # Slice to the waiting window before scanning: without this each
            # event would walk the ticker's whole history back to 2010.
            i0 = dates.searchsorted(np.datetime64(signal_ts), side="right")
            i1 = dates.searchsorted(
                np.datetime64(signal_ts + timedelta(days=waiting_days)), side="right"
            )
            touch = find_line_touch(
                bars.iloc[i0:i1], anchor_date, anchor_price, slope, event["Ngay"],
                waiting_days=waiting_days,
            )
            if touch is None:
                # Never filled — not a trade, nothing to learn from it.
                continue

            entry_date, entry_price = touch
            if entry_price <= 0:
                continue

            tp_price = entry_price * TP_MULT
            sl_price = entry_price * SL_MULT

            # Cut the holding window at the timeout date, and treat its last
            # bar as "today". The tracker runs daily, so it closes a timed-out
            # position at the close of the session that crosses the limit —
            # handing it the full history instead would exit every historical
            # trade at the latest price in the table.
            entry_ts = pd.Timestamp(entry_date)
            j0 = dates.searchsorted(np.datetime64(entry_ts), side="left")
            # Include the first session at or after the timeout date — that is
            # the one the tracker would close on. Stopping at the last session
            # strictly inside the window would leave a trade that expires over
            # a weekend looking like it never resolved.
            j1 = dates.searchsorted(
                np.datetime64(entry_ts + timedelta(days=timeout_days)), side="left"
            ) + 1
            held = bars.iloc[j0:j1]
            if len(held) == 0:
                continue

            status, exit_date, exit_price = resolve_trade_exit(
                held, entry_date, entry_price, tp_price, sl_price,
                held.iloc[-1]["Ngay"], timeout_days,
            )
            if status == "HOLD":
                # Still open at the end of the data — the outcome has not
                # happened yet, so it cannot be a training label.
                continue

            row = event.to_dict()
            row.update({
                "entry_Ngay": entry_ts,
                "entry_price": entry_price,
                "tp_price": tp_price,
                "sl_price": sl_price,
                "exit_Ngay": pd.Timestamp(exit_date),
                "exit_price": float(exit_price),
                "exit_status": status,
                "trade_return": (float(exit_price) / entry_price) - 1,
                "label": int(status == "TP"),
            })
            results.append(row)

    return pd.DataFrame(results)
