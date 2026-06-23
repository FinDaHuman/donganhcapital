import gc
from pathlib import Path

import numpy as np
import pandas as pd

from features.market_features import MarketRegimeFeatureBuilder
from labels.market_label import add_market_label


UNIVERSE_PATH = Path(__file__).resolve().parent.parent / "ltr_stock_universe.csv"

LTR_FEATURE_COLS = [
    # ── Returns ─────────────────────────────────────────────────────────────
    "ret_1d", "ret_3d", "ret_5d", "ret_10d",
    # ── Volume ──────────────────────────────────────────────────────────────
    "vol_ratio_5d", "vol_ratio_20d", "vol_ratio_60d", "vol_ratio_90d",
    "vol_thrust_5d",          # count of accumulation days (vol > 1.5× MA20) in last 5
    # ── Price action ────────────────────────────────────────────────────────
    "intraday", "gap", "close_vs_range",
    # ── MA distances ────────────────────────────────────────────────────────
    "dist_ma5", "dist_ma10", "dist_ma20", "dist_ma50",
    # ── Volatility / momentum ───────────────────────────────────────────────
    "atr_ratio", "rsi_14",
    "bb_width_ratio",         # BB width / 50-period rolling avg — squeeze detection
    # ── Relative strength ───────────────────────────────────────────────────
    "rs_5d",                  # stock ret_5d minus index ret_5d
    "rs_new_high_60d",        # 1 if RS line (close/index_close) at 60-day high
    "pos_52w",                # close / 52-week rolling high
    # ── Market regime ───────────────────────────────────────────────────────
    "market_label", "index_dist_ma200", "index_vol_ratio",
    "index_ret_1d", "index_ret_5d",
    # ── Calendar ────────────────────────────────────────────────────────────
    "dow",
]


def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / (avg_loss + 1e-9)
    return 100.0 - (100.0 / (1.0 + rs))


def build_ltr_features(stock_df: pd.DataFrame, market_df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute all LTR features on the full stock universe.

    Timing convention — every feature at row (stock_id, T) uses only data ≤ T:
    - Post-close pipeline runs at ~15:05, so today's OHLC/volume are fully known.
    - MA denominators use .shift(1) to exclude today's close from the rolling average.
    - Market regime features from MarketRegimeFeatureBuilder already shift internally
      (features at row T reflect T-1 market close). No second shift is applied here.

    float32 throughout to keep peak RAM under ~400 MB on 8 GB machines.
    """
    df = stock_df.copy().sort_values(["stock_id", "Ngay"]).reset_index(drop=True)
    df["Ngay"] = pd.to_datetime(df["Ngay"])

    # ── Market regime (build once, join on date) ────────────────────────────
    mf = MarketRegimeFeatureBuilder.build(market_df)
    mf = add_market_label(mf)
    mf["Ngay"] = pd.to_datetime(mf["Ngay"])
    # index_ret_5d: shift(1) → at row T, value = 5-day return ending at T-1
    mf["index_ret_5d"] = mf["index_close"].pct_change(5).shift(1)

    regime_cols = [
        "market_label", "index_dist_ma200", "index_vol_ratio",
        "index_ret_1d", "index_ret_5d",
    ]
    # Keep index_close for RS-new-high computation; drop after use
    mf_slim = mf[["Ngay", "index_close"] + regime_cols].copy()
    del mf
    gc.collect()

    # ── Short-term returns ───────────────────────────────────────────────────
    # Default-arg capture (_n=n) avoids the classic Python closure bug in loops
    for n, col in [(1, "ret_1d"), (3, "ret_3d"), (5, "ret_5d"), (10, "ret_10d")]:
        df[col] = (
            df.groupby("stock_id")["close"]
            .transform(lambda x, _n=n: x.pct_change(_n))
            .astype("float32")
        )

    # ── Volume ratios ────────────────────────────────────────────────────────
    vol_ma20 = df.groupby("stock_id")["volume"].transform(
        lambda x: x.rolling(20, min_periods=20).mean()
    )
    for n, col in [(5, "vol_ratio_5d"), (20, "vol_ratio_20d"),
                   (60, "vol_ratio_60d"), (90, "vol_ratio_90d")]:
        ma = df.groupby("stock_id")["volume"].transform(
            lambda x, _n=n: x.rolling(_n, min_periods=_n).mean()
        )
        df[col] = (df["volume"] / (ma + 1e-9)).clip(0, 20).astype("float32")

    # ── Volume thrust — count of accumulation days in last 5 ─────────────────
    # Accumulation day: today's volume > 1.5× 20-day average (institutional buying signal)
    df["_vol_above"] = (df["volume"] > 1.5 * vol_ma20).astype("float32")
    df["vol_thrust_5d"] = (
        df.groupby("stock_id")["_vol_above"]
        .transform(lambda x: x.rolling(5, min_periods=5).sum())
        .astype("float32")
    )
    df.drop(columns=["_vol_above"], inplace=True)

    # ── Intraday, gap, close-vs-range ────────────────────────────────────────
    prev_close = df.groupby("stock_id")["close"].shift(1)
    df["intraday"]       = ((df["close"] - df["open"]) / (df["open"] + 1e-9)).astype("float32")
    df["gap"]            = ((df["open"] - prev_close) / (prev_close + 1e-9)).astype("float32")
    rng = df["high"] - df["low"]
    df["close_vs_range"] = ((df["close"] - df["low"]) / (rng + 1e-9)).astype("float32")

    # ── MA distances (MA uses shift(1) to exclude today's close) ────────────
    for n, col in [(5, "dist_ma5"), (10, "dist_ma10"), (20, "dist_ma20"), (50, "dist_ma50")]:
        ma = df.groupby("stock_id")["close"].transform(
            lambda x, _n=n: x.rolling(_n, min_periods=_n).mean().shift(1)
        )
        df[col] = ((df["close"] - ma) / (ma + 1e-9)).astype("float32")

    # ── ATR ratio ────────────────────────────────────────────────────────────
    prev_c = df.groupby("stock_id")["close"].shift(1)
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - prev_c).abs(),
        (df["low"]  - prev_c).abs(),
    ], axis=1).max(axis=1)
    df["_tr"] = tr
    atr14 = df.groupby("stock_id")["_tr"].transform(
        lambda x: x.rolling(14, min_periods=14).mean()
    )
    df["atr_ratio"] = (atr14 / (df["close"] + 1e-9)).astype("float32")
    df.drop(columns=["_tr"], inplace=True)

    # ── RSI 14 ───────────────────────────────────────────────────────────────
    df["rsi_14"] = (
        df.groupby("stock_id")["close"]
        .transform(lambda x: _rsi(x, period=14))
        .astype("float32")
    )

    # ── Bollinger Band width ratio (squeeze detector) ────────────────────────
    # BB width = 4 × std20 / MA20 (= (upper - lower) / midline)
    # Ratio vs its own 50-period rolling mean: < 1 means squeeze (volatility compressed)
    std20 = df.groupby("stock_id")["close"].transform(
        lambda x: x.rolling(20, min_periods=20).std().shift(1)
    )
    ma20_close = df.groupby("stock_id")["close"].transform(
        lambda x: x.rolling(20, min_periods=20).mean().shift(1)
    )
    df["_bb_width"] = 4.0 * std20 / (ma20_close + 1e-9)
    bb_width_ma50 = df.groupby("stock_id")["_bb_width"].transform(
        lambda x: x.rolling(50, min_periods=50).mean()
    )
    df["bb_width_ratio"] = (df["_bb_width"] / (bb_width_ma50 + 1e-9)).clip(0, 5).astype("float32")
    df.drop(columns=["_bb_width"], inplace=True)

    # ── 52-week position ─────────────────────────────────────────────────────
    rolling_max_252 = df.groupby("stock_id")["close"].transform(
        lambda x: x.rolling(252, min_periods=20).max().shift(1)
    )
    df["pos_52w"] = (df["close"] / (rolling_max_252 + 1e-9)).astype("float32")

    # ── Day of week ──────────────────────────────────────────────────────────
    df["dow"] = df["Ngay"].dt.dayofweek.astype("int8")

    # ── Join market features (includes index_close for RS computation) ───────
    df = df.merge(mf_slim, on="Ngay", how="left")
    del mf_slim
    gc.collect()

    for col in ["index_dist_ma200", "index_vol_ratio", "index_ret_1d", "index_ret_5d"]:
        df[col] = df[col].astype("float32")

    # ── Relative strength vs index ───────────────────────────────────────────
    df["rs_5d"] = (df["ret_5d"] - df["index_ret_5d"]).astype("float32")

    # ── RS line new 60-day high (binary momentum confirmation) ───────────────
    # RS line = close[T] / index_close[T] — both fully known post-close.
    # rs_60d_max uses shift(1) so it reflects the prior 60-day window (T-60 to T-1),
    # making rs_new_high_60d a look-ahead-free "is today a new RS high?" signal.
    df["_rs_line"] = df["close"] / (df["index_close"] + 1e-9)
    rs_60d_max = df.groupby("stock_id")["_rs_line"].transform(
        lambda x: x.rolling(60, min_periods=60).max().shift(1)
    )
    df["rs_new_high_60d"] = (df["_rs_line"] >= rs_60d_max - 1e-9).astype("float32")
    df.drop(columns=["_rs_line", "index_close"], inplace=True)

    return df
