"""
BCD model rolling features + entry/TP/SL rules.

Ported from crawl_news `BCDFeatureEngine` (stock_features.py) and
`calc_bcd_entry` (buy_plan.py), renamed to this repo's "Ngay" convention.

The 16 model features = 10 rolling features built here (all shifted 1 day to
avoid look-ahead) + 6 pattern-structure features written by BCDEventEngine
on the breakdown row (bc_return, bc_days, cd_days, peak_to_b, peak_to_c,
breakdown_strength).

Feature params must stay identical between training and inference:
    lookback_peak=60, ma_ma=200
"""
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


def calc_bcd_entry(row) -> float | None:
    """Entry = projection of the B->C close line to the signal (breakdown) date.

    Requires |C-B|/B >= 2%; otherwise falls back to the breakdown day's
    (open + close) / 2. Mirrors crawl_news buy_plan.calc_bcd_entry, except the
    projection target is the signal date rather than the wall-clock date, so
    re-runs of a past date produce identical prices.
    """
    b_price = row.get("B_close")
    c_price = row.get("C_close")
    b_date = row.get("B_Ngay")
    c_date = row.get("C_Ngay")
    signal_date = row.get("Ngay")

    if (
        b_price is not None and c_price is not None
        and not pd.isna(b_price) and not pd.isna(c_price)
        and not pd.isna(b_date) and not pd.isna(c_date)
    ):
        bv = float(b_price)
        cv = float(c_price)
        if bv > 0 and abs(cv - bv) / bv >= 0.02:
            b_dt = pd.Timestamp(b_date)
            c_dt = pd.Timestamp(c_date)
            if c_dt >= b_dt:
                days_range = (c_dt - b_dt).days or 1
                price_slope = (cv - bv) / days_range
                days_from_b = (pd.Timestamp(signal_date) - b_dt).days
                return float(bv + price_slope * days_from_b)

    # Fallback: mid of the breakdown candle
    o = row.get("open")
    c = row.get("close")
    if o is not None and c is not None and not pd.isna(c) and float(c) > 0:
        if not pd.isna(o) and float(o) > 0:
            return (float(o) + float(c)) / 2
        return float(c)
    return None
