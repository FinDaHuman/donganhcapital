"""
BCD model rolling features + the B->C entry line.

Ported from crawl_news `BCDFeatureEngine` (stock_features.py) and
`calc_bcd_entry` (buy_plan.py), renamed to this repo's "Ngay" convention.

The 16 model features = 10 rolling features built here (all shifted 1 day to
avoid look-ahead) + 6 pattern-structure features written by BCDEventEngine
on the breakdown row (bc_return, bc_days, cd_days, peak_to_b, peak_to_c,
breakdown_strength).

Feature params must stay identical between training and inference:
    lookback_peak=60, ma_ma=200

`calc_bc_line` / `line_price_on` are the single definition of the entry line.
Inference (bcd_daily_predict), the trigger evaluator (bcd_signal_trigger) and
the training labels (labels/bcd_label) all go through them, so a signal, the
trade opened from it and the label it was trained on describe the same trade.
"""
from datetime import date, timedelta

import numpy as np
import pandas as pd

BCD_FEATURE_COLS = [
    "ret_20", "ret_60", "volatility_5", "volatility_20",
    "distance_to_peak", "distance_to_ma200",
    "ma_vol_5", "ma_vol_20", "volume_z",
    "ATR_compression_ratio",
    "bc_return", "bc_days", "cd_days",
    "peak_to_b", "peak_to_c",
    "breakdown_strength",
]

# Same take-profit / stop-loss policy as the source system (buy_plan.py):
# TP = entry * 1.15 (matches the +15%/60-session label), SL = entry * 0.93.
TP_MULT = 1.15
SL_MULT = 0.93

# How long a signal keeps its resting limit order alive before it is dropped.
# Calendar days, matching buy_plan.MAX_WAITING_DAYS.
MAX_WAITING_DAYS = 10

# The B->C line is only drawn when B and C are at least this far apart;
# below it the two points are too close for the slope to mean anything and we
# fall back to a flat level (buy_plan.calc_bcd_entry uses the same 2%).
MIN_BC_SEPARATION = 0.02


def build_bcd_features(df: pd.DataFrame, lookback_peak=60, ma_ma=200) -> pd.DataFrame:
    df = df.copy()
    df = df.sort_values(["stock_id", "Ngay"]).reset_index(drop=True)

    g = df.groupby("stock_id")

    # PRICE RETURNS
    df["ret_20"] = g["close"].transform(lambda x: x.pct_change(20).shift(1))
    df["ret_60"] = g["close"].transform(lambda x: x.pct_change(60).shift(1))

    # VOLATILITY
    df["volatility_5"] = g["close"].transform(
        lambda x: x.pct_change().rolling(5).std().shift(1)
    )
    df["volatility_20"] = g["close"].transform(
        lambda x: x.pct_change().rolling(20).std().shift(1)
    )

    # DISTANCE TO PEAK
    rolling_peak = g["close"].transform(
        lambda x: x.rolling(lookback_peak).max().shift(1)
    )
    df["distance_to_peak"] = df["close"] / rolling_peak - 1

    # MA200 DISTANCE
    ma200 = g["close"].transform(lambda x: x.rolling(ma_ma).mean().shift(1))
    df["distance_to_ma200"] = df["close"] / ma200 - 1

    # VOLUME FEATURES
    df["ma_vol_5"] = g["volume"].transform(lambda x: x.rolling(5).mean().shift(1))
    df["ma_vol_20"] = g["volume"].transform(lambda x: x.rolling(20).mean().shift(1))

    vol_std_20 = g["volume"].transform(lambda x: x.rolling(20).std().shift(1))
    df["volume_z"] = (df["volume"] - df["ma_vol_20"]) / (vol_std_20 + 1e-9)

    # ATR COMPRESSION RATIO
    prev_close = g["close"].shift(1)
    high_low = df["high"] - df["low"]
    high_close = (df["high"] - prev_close).abs()
    low_close = (df["low"] - prev_close).abs()
    df["_tr"] = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)

    g = df.groupby("stock_id")
    atr5 = g["_tr"].transform(lambda x: x.rolling(5).mean())
    atr20 = g["_tr"].transform(lambda x: x.rolling(20).mean())
    df["ATR_compression_ratio"] = (
        (atr5 / (atr20 + 1e-9)).groupby(df["stock_id"]).shift(1)
    )
    df = df.drop(columns=["_tr"])

    return df


def line_price_on(anchor_date, anchor_price: float, slope: float, target_date) -> float:
    """Price of the B->C line on `target_date`.

    The slope is per CALENDAR day (as in buy_plan.calc_bcd_entry), so the line
    keeps falling across weekends and holidays.
    """
    days = (pd.Timestamp(target_date) - pd.Timestamp(anchor_date)).days
    return float(anchor_price) + float(slope) * days


def calc_bc_line(row) -> tuple[date, float, float] | None:
    """The support line to rest a limit buy on, as (anchor_date, anchor_price, slope).

    Normal case: the line through the B and C closes, extended forward. Because
    C is a lower bottom than B the slope is always negative, so the level keeps
    dropping for as long as the signal waits.

    When B and C are closer than MIN_BC_SEPARATION the slope is noise, so we
    fall back to a flat line at the breakdown candle's mid price — the same
    fallback level buy_plan.calc_bcd_entry uses, just held horizontal instead of
    projected.

    Returns None when neither branch has usable prices.
    """
    b_price = row.get("B_close")
    c_price = row.get("C_close")
    b_date = row.get("B_Ngay")
    c_date = row.get("C_Ngay")

    if (
        b_price is not None and c_price is not None
        and not pd.isna(b_price) and not pd.isna(c_price)
        and not pd.isna(b_date) and not pd.isna(c_date)
    ):
        bv = float(b_price)
        cv = float(c_price)
        if bv > 0 and abs(cv - bv) / bv >= MIN_BC_SEPARATION:
            b_dt = pd.Timestamp(b_date)
            c_dt = pd.Timestamp(c_date)
            if c_dt >= b_dt:
                days_range = (c_dt - b_dt).days or 1
                return b_dt.date(), bv, (cv - bv) / days_range

    # Fallback: flat line at the mid of the breakdown candle.
    signal_date = row.get("Ngay")
    if signal_date is None or pd.isna(signal_date):
        return None
    o = row.get("open")
    c = row.get("close")
    if c is not None and not pd.isna(c) and float(c) > 0:
        level = (float(o) + float(c)) / 2 if (o is not None and not pd.isna(o) and float(o) > 0) else float(c)
        return pd.Timestamp(signal_date).date(), level, 0.0
    return None


def expiry_date(signal_date, waiting_days: int = MAX_WAITING_DAYS) -> date:
    """Last calendar day on which a signal's limit order is still live."""
    return (pd.Timestamp(signal_date) + timedelta(days=waiting_days)).date()


def find_line_touch(bars, anchor_date, anchor_price, slope, signal_date,
                    waiting_days: int = MAX_WAITING_DAYS) -> tuple[date, float] | None:
    """First session where the market reaches the line, as (entry_date, fill_price).

    `bars` is the ticker's sessions in ascending date order, carrying
    "Ngay"/open/low. Returns None while the line has not been reached.

    Two details decide whether this backtest is tradeable:

    1. The scan starts the session AFTER `signal_date`. The breakdown is only
       known once that day has closed (the pipeline runs 2 min after the bell),
       so no order could have been resting during it. crawl_news
       buy_plan.update_statuses scans from the signal date inclusive, which
       quietly books fills that were impossible.

    2. The fill is min(open, line), not the day's low. The line is a resting
       limit buy: it fills at the limit when the market trades down to it, or
       at the open when the session gapped straight through. Booking the low
       would credit the trade with a price nobody can hit.
    """
    sig = pd.Timestamp(signal_date)
    expires = pd.Timestamp(expiry_date(signal_date, waiting_days))

    for _, bar in bars.iterrows():
        d = pd.Timestamp(bar["Ngay"])
        if d <= sig:
            continue
        if d > expires:
            break

        low = bar["low"]
        if low is None or pd.isna(low) or float(low) <= 0:
            continue

        level = line_price_on(anchor_date, anchor_price, slope, d)
        if float(low) <= level:
            o = bar["open"]
            fill = min(float(o), level) if (o is not None and not pd.isna(o) and float(o) > 0) else level
            return d.date(), float(fill)

    return None
