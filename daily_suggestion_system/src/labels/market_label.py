def add_market_label(train_df):

    df = train_df.copy()
    df["market_label"] = 1

    # =========================
    # Downtrend (giữ nguyên)
    # =========================
    downtrend_mask = (
        (df["index_drawdown_1y"] < -0.18) &
        (
            (df["index_ma200_slope_20d_pct"] < -0.006) |
            (df["index_dist_ma200"] < -0.04)
        )
    )

    df.loc[downtrend_mask, "market_label"] = 0

    # =========================
    # Uptrend (siết lại)
    # =========================
    uptrend_mask = (
        (df["index_drawdown_1y"] > -0.08) &          # từ -0.09 → -0.08
        (df["index_ma200_slope_20d_pct"] > 0.007) &  # từ 0.006 → 0.007
        (df["index_dist_ma200"] > 0.035) &           # từ 0.03 → 0.035
        (df["index_vol_ratio"] < 1.35)
    )

    df.loc[uptrend_mask, "market_label"] = 2

    return df