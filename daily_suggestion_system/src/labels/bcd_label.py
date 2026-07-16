"""
BCD training labels.

Ported from crawl_news `LabelEngine` (train_model_1.py), renamed to this
repo's "Ngay" convention.

Label = 1 if, entering at the open of the recovery day (the day after the
post-breakdown low D), the max high over the next `horizon` sessions reaches
>= `target_return`. Defaults (+15% / 60 sessions) must match the TP policy
in features/bcd_features.py.
"""
import numpy as np
import pandas as pd


def build_bcd_labels(recovery_df: pd.DataFrame, full_df: pd.DataFrame,
                     horizon=60, target_return=0.15) -> pd.DataFrame:
    full_df = (
        full_df.copy()
        .sort_values(["stock_id", "Ngay"])
        .reset_index(drop=True)
    )
    full_df["Ngay"] = pd.to_datetime(full_df["Ngay"])
    recovery_df = recovery_df.copy()
    recovery_df["recovery_Ngay"] = pd.to_datetime(recovery_df["recovery_Ngay"])

    stock_map = {}
    for stock, g in full_df.groupby("stock_id", sort=False):
        g = g.reset_index(drop=True)
        stock_map[stock] = {
            "dates": g["Ngay"].to_numpy(dtype="datetime64[ns]"),
            "open": g["open"].to_numpy(dtype=float),
            "high": g["high"].to_numpy(dtype=float),
        }

    results = []
    for stock, events in recovery_df.groupby("stock_id", sort=False):
        stock_data = stock_map.get(stock)
        if stock_data is None:
            continue

        dates = stock_data["dates"]
        opens = stock_data["open"]
        highs = stock_data["high"]

        for event in events.itertuples(index=False):
            if pd.isna(event.recovery_Ngay):
                continue

            recovery_date = np.datetime64(event.recovery_Ngay)
            pos = dates.searchsorted(recovery_date)

            if pos >= len(dates) or dates[pos] != recovery_date:
                continue

            entry_idx = pos
            entry_price = opens[entry_idx]

            if np.isnan(entry_price) or entry_price <= 0:
                continue

            future_highs = highs[entry_idx + 1: entry_idx + horizon + 1]
            if future_highs.size == 0 or np.all(np.isnan(future_highs)):
                continue

            max_high = float(np.nanmax(future_highs))
            future_return = (max_high / entry_price) - 1
            label = int(future_return >= target_return)

            row = event._asdict()
            row.update({
                "entry_Ngay": pd.Timestamp(dates[entry_idx]),
                "open_entry": entry_price,
                "max_high_60d": max_high,
                "future_return": future_return,
                "label": label,
            })
            results.append(row)

    return pd.DataFrame(results)
