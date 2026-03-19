import numpy as np

def build_features_sepa(df, breakout_col="is_breakout"):

    df = df.copy()
    df = df.sort_values(["stock_id", "Ngay"]).reset_index(drop=True)

    # =====================================================
    # 1️⃣ TREND ALIGNMENT
    # =====================================================

    df["ma50"] = df.groupby("stock_id")["close"] \
        .transform(lambda x: x.rolling(50, min_periods=50).mean().shift(1))

    df["ma150"] = df.groupby("stock_id")["close"] \
        .transform(lambda x: x.rolling(150, min_periods=150).mean().shift(1))

    df["ma200"] = df.groupby("stock_id")["close"] \
        .transform(lambda x: x.rolling(200, min_periods=200).mean().shift(1))

    df["ma50_gt_ma150"] = (df["ma50"] > df["ma150"]).astype(int)
    df["ma150_gt_ma200"] = (df["ma150"] > df["ma200"]).astype(int)
    df["price_gt_ma50"] = (df["close"].shift(1) > df["ma50"]).astype(int)

    # =====================================================
    # 52W HIGH + RELATIVE STRENGTH
    # =====================================================

    rolling_252_high = (
        df.groupby("stock_id")["close"]
        .transform(lambda x: x.rolling(252, min_periods=252).max().shift(1))
    )

    df["distance_from_52w_high"] = df["close"].shift(1) / rolling_252_high - 1

    df["ret_60d"] = df.groupby("stock_id")["close"] \
        .transform(lambda x: x.pct_change(60).shift(1))

    df["RS_percentile_60d"] = df.groupby("Ngay")["ret_60d"].rank(pct=True)

    # RS NEW HIGH (giữ lại vì rất mạnh)

    rs_line = df["close"] / df["index_close"]

    rs_120_high = (
        rs_line.groupby(df["stock_id"])
        .transform(lambda x: x.rolling(120, min_periods=120).max().shift(1))
    )

    df["RS_new_high"] = (rs_line > rs_120_high).astype(int)

    # =====================================================
    # BASE STRUCTURE
    # =====================================================

    prev_close = df.groupby("stock_id")["close"].shift(1)

    df["tr"] = np.maximum(
        df["high"] - df["low"],
        np.maximum(
            abs(df["high"] - prev_close),
            abs(df["low"] - prev_close)
        )
    )

    df["atr_14"] = df.groupby("stock_id")["tr"] \
        .transform(lambda x: x.rolling(14, min_periods=14).mean().shift(1))

    df["atr_60"] = df.groupby("stock_id")["atr_14"] \
        .transform(lambda x: x.rolling(60, min_periods=60).mean().shift(1))

    df["volatility_compression_ratio"] = df["atr_14"] / df["atr_60"]

    rolling_low_60 = (
        df.groupby("stock_id")["low"]
        .transform(lambda x: x.rolling(60, min_periods=60).min().shift(1))
    )

    rolling_high_60 = (
        df.groupby("stock_id")["high"]
        .transform(lambda x: x.rolling(60, min_periods=60).max().shift(1))
    )

    df["base_depth_percent"] = rolling_low_60 / rolling_high_60 - 1

    df["price_tightness_20"] = (
        df.groupby("stock_id")["close"]
        .transform(lambda x: x.rolling(20, min_periods=20).std().shift(1))
    )

    # =====================================================
    # VOLUME
    # =====================================================

    df["volume_ma20"] = df.groupby("stock_id")["volume"] \
        .transform(lambda x: x.rolling(20, min_periods=20).mean().shift(1))

    df["volume_ma50"] = df.groupby("stock_id")["volume"] \
        .transform(lambda x: x.rolling(50, min_periods=50).mean().shift(1))

    # =====================================================
    # BREAKOUT CONFIRMATION
    # =====================================================

    rolling_high_20 = (
        df.groupby("stock_id")["high"]
        .transform(lambda x: x.rolling(20, min_periods=20).max().shift(1))
    )

    df["breakout_strength"] = df["close"].shift(1) / rolling_high_20 - 1

    df["breakout_volume_ratio"] = (
        df["volume"] / (df["volume_ma20"] + 1e-6)
    )

    # =====================================================
    # RESISTANCE PRESSURE
    # =====================================================

    rolling_high_30 = (
        df.groupby("stock_id")["high"]
        .transform(lambda x: x.rolling(30, min_periods=30).max().shift(1))
    )

    df["near_resistance"] = (
        df["close"].shift(1) >= rolling_high_30 * 0.97
    ).astype(int)

    df["resistance_tests_30d"] = (
        df.groupby("stock_id")["near_resistance"]
        .transform(lambda x: x.rolling(30, min_periods=5).sum().shift(1))
    )

    return df