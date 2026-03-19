import pandas as pd
import numpy as np

class BreakoutEventEngine:

    @staticmethod
    def build(
        df: pd.DataFrame,
        breakout_lookback=60,
        min_base_length=20,
        max_base_length=120,
        breakout_buffer=0.012,
        cooldown_days=20,
        min_volume_ratio=1.2,
        max_atr_pct=0.08
    ):

        df = df.copy()
        df = df.sort_values(["stock_id", "Ngay"]).reset_index(drop=True)

        results = []

        for stock, g in df.groupby("stock_id"):

            g = g.copy().reset_index(drop=True)

            last_breakout_idx = -999

            # ============================
            # Rolling High
            # ============================
            g["rolling_high"] = (
                g["close"]
                .rolling(breakout_lookback, min_periods=breakout_lookback)
                .max()
                .shift(1)
            )

            # ============================
            # True Range / ATR
            # ============================
            high_low = g["high"] - g["low"]
            high_prev_close = (g["high"] - g["close"].shift()).abs()
            low_prev_close = (g["low"] - g["close"].shift()).abs()

            g["true_range"] = pd.concat(
                [high_low, high_prev_close, low_prev_close],
                axis=1
            ).max(axis=1)

            g["ATR_20"] = g["true_range"].rolling(20).mean().shift(1)
            g["ATR_pct"] = g["ATR_20"] / g["close"].shift(1)

            # ============================
            # Volume metrics
            # ============================
            if "volume" in g.columns:

                g["vol_ma20"] = g["volume"].rolling(20).mean().shift(1)
                g["vol_ma50"] = g["volume"].rolling(50).mean().shift(1)

                g["breakout_volume_ratio"] = (
                    g["volume"] / g["vol_ma20"]
                )

            # ============================
            # Initialize event columns
            # ============================
            g["is_breakout"] = 0

            g["base_length"] = np.nan
            g["base_depth"] = np.nan
            g["base_return"] = np.nan

            g["contraction_ratio"] = np.nan
            g["tight_range_15"] = np.nan

            g["base_atr_mean"] = np.nan
            g["base_volatility"] = np.nan

            g["vol_dryup_ratio"] = np.nan

            g["breakout_strength_atr"] = np.nan
            g["breakout_range"] = np.nan
            g["close_strength"] = np.nan

            g["ret_20d_pre"] = np.nan
            g["ret_60d_pre"] = np.nan

            # ============================
            # Main detection loop
            # ============================
            for i in range(breakout_lookback, len(g)):

                # cooldown
                if i - last_breakout_idx < cooldown_days:
                    continue

                if pd.isna(g.loc[i, "rolling_high"]):
                    continue

                breakout_level = g.loc[i, "rolling_high"] * (1 + breakout_buffer)

                # breakout detection (intraday + close confirm)
                if g.loc[i, "high"] <= breakout_level:
                    continue

                if g.loc[i, "close"] <= breakout_level:
                    continue

                # ATR sanity check
                if g.loc[i, "ATR_pct"] > max_atr_pct:
                    continue

                # volume confirmation
                if "volume" in g.columns:
                    if g.loc[i, "breakout_volume_ratio"] < min_volume_ratio:
                        continue

                # ============================
                # Extract base
                # ============================
                best_score = -np.inf
                best_metrics = None
                best_len = None

                for base_len in range(min_base_length, max_base_length + 1):

                    if i - base_len < 0:
                        break

                    base = g.iloc[i-base_len:i]

                    base_high = base["high"].max()
                    base_low = base["low"].min()

                    base_depth = (base_high - base_low) / base_high

                    base_return = (
                        base["close"].iloc[-1] /
                        base["close"].iloc[0] - 1
                    )

                    atr_series = base["ATR_pct"].dropna()

                    if len(atr_series) < 10:
                        continue

                    first_half = atr_series.iloc[:len(atr_series)//2].mean()
                    second_half = atr_series.iloc[len(atr_series)//2:].mean()

                    if first_half <= 0:
                        continue

                    contraction_ratio = second_half / first_half

                    tight_window = base.iloc[-15:]

                    tight_range = (
                        tight_window["high"].max() -
                        tight_window["low"].min()
                    ) / tight_window["high"].max()

                    base_volatility = base["close"].pct_change().std()
                    base_atr_mean = base["ATR_pct"].mean()

                    if "volume" in base.columns:

                        first_vol = base["volume"].iloc[:base_len//2].mean()
                        last_vol = base["volume"].iloc[base_len//2:].mean()

                        if first_vol > 0:
                            vol_dryup = last_vol / first_vol
                        else:
                            vol_dryup = np.nan
                    else:
                        vol_dryup = np.nan

                    length_penalty = 0.002 * base_len

                    score = (
                        -base_depth
                        -contraction_ratio
                        -tight_range
                        + (1 - vol_dryup if not np.isnan(vol_dryup) else 0)
                        + length_penalty
                    )


                    if score > best_score:

                        best_score = score
                        best_len = base_len

                        best_metrics = (
                            base_depth,
                            base_return,
                            contraction_ratio,
                            tight_range,
                            base_volatility,
                            base_atr_mean,
                            vol_dryup
                        )

                if best_metrics is None:
                    continue

                # ============================
                # Breakout features
                # ============================
                breakout_strength = np.nan

                if g.loc[i, "ATR_20"] > 0:

                    breakout_strength = (
                        g.loc[i, "close"] -
                        g.loc[i, "rolling_high"]
                    ) / g.loc[i, "ATR_20"]

                breakout_range = (
                    g.loc[i, "high"] -
                    g.loc[i, "low"]
                ) / g.loc[i, "close"]

                close_strength = (
                    g.loc[i, "close"] -
                    g.loc[i, "low"]
                ) / (
                    g.loc[i, "high"] -
                    g.loc[i, "low"] + 1e-9
                )

                # ============================
                # Pre-breakout momentum
                # ============================
                ret20 = np.nan
                ret60 = np.nan

                if i >= 21:
                    ret20 = (
                        g.loc[i-1, "close"] /
                        g.loc[i-21, "close"] - 1
                    )

                if i >= 61:
                    ret60 = (
                        g.loc[i-1, "close"] /
                        g.loc[i-61, "close"] - 1
                    )


                # ============================
                # Register event
                # ============================
                g.loc[i, "is_breakout"] = 1
                last_breakout_idx = i

                g.loc[i, "base_length"] = best_len
                g.loc[i, "base_depth"] = best_metrics[0]
                g.loc[i, "base_return"] = best_metrics[1]

                g.loc[i, "contraction_ratio"] = best_metrics[2]
                g.loc[i, "tight_range_15"] = best_metrics[3]

                g.loc[i, "base_volatility"] = best_metrics[4]
                g.loc[i, "base_atr_mean"] = best_metrics[5]

                g.loc[i, "vol_dryup_ratio"] = best_metrics[6]

                g.loc[i, "breakout_strength_atr"] = breakout_strength
                g.loc[i, "breakout_range"] = breakout_range
                g.loc[i, "close_strength"] = close_strength

                g.loc[i, "ret_20d_pre"] = ret20
                g.loc[i, "ret_60d_pre"] = ret60

            results.append(g)

        return pd.concat(results).reset_index(drop=True)