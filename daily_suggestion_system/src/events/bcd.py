"""
BCD (B-C-D breakdown) event detection.

Ported from crawl_news `backend/pipelines/processors/features/stock_features.py`
(BCDEventEngine) and `backend/pipelines/backup/training/train_model_1.py`
(RecoveryPointEngine), renamed to this repo's "Ngay" column convention.

Pattern: price drops >= drop_pct from the lookback-window peak -> local bottom B
-> weak rebound -> lower bottom C -> a close below C = the breakdown day.
The model scores each breakdown day for the probability of a >= +15% recovery
within 60 sessions (see labels/bcd_label.py).

The event parameters used here MUST stay identical between training and
inference, otherwise the feature distribution shifts:
    lookback=20, drop_pct=0.15, confirm_days=2, max_bc_days=20, max_cd_days=20
"""
import numpy as np
import pandas as pd


class BCDEventEngine:
    @staticmethod
    def build(
        df: pd.DataFrame,
        lookback=20,
        drop_pct=0.15,
        confirm_days=2,
        max_bc_days=20,
        max_cd_days=20,
    ) -> pd.DataFrame:
        def is_lowest_in_lookback(arr, idx, lookback):
            start = max(0, idx - lookback + 1)
            return idx == start + np.argmin(arr[start:idx + 1])

        df = (
            df.copy()
            .sort_values(["stock_id", "Ngay"])
            .reset_index(drop=True)
        )

        df["Ngay"] = pd.to_datetime(df["Ngay"])

        # event flags
        df["bcdevent"] = 0
        df["breakdown"] = 0

        # event columns
        df["peak_Ngay"] = pd.NaT
        df["B_Ngay"] = pd.NaT
        df["C_Ngay"] = pd.NaT
        df["breakdown_Ngay"] = pd.NaT

        df["peak_before_B"] = np.nan
        df["peak_before_C"] = np.nan

        df["B_close"] = np.nan
        df["C_close"] = np.nan
        df["breakdown_close"] = np.nan

        df["bc_return"] = np.nan
        df["bc_days"] = np.nan
        df["cd_days"] = np.nan
        df["peak_to_b"] = np.nan
        df["peak_to_c"] = np.nan
        df["breakdown_strength"] = np.nan

        for stock, g in df.groupby("stock_id", sort=False):
            g = g.reset_index()

            orig_idx = g["index"].to_numpy()
            close = g["close"].to_numpy(dtype=float)
            ngay = g["Ngay"].to_numpy()

            n = len(g)
            i = lookback

            while i < n:
                # 1) DROP > drop_pct FROM PEAK
                start = max(0, i - lookback)
                peak_price = close[start:i + 1].max()
                drop_real = (close[i] / peak_price) - 1

                if drop_real > -drop_pct:
                    i += 1
                    continue

                # 2) FIND B
                B_idx = i
                B_close = close[i]
                last_B_update = i

                j = i + 1
                while j < n:
                    cj = close[j]
                    if cj < B_close:
                        B_close = cj
                        B_idx = j
                        last_B_update = j
                    if j - last_B_update >= confirm_days:
                        break
                    j += 1

                if last_B_update + confirm_days >= n:
                    i += 1
                    continue

                if not is_lowest_in_lookback(close, B_idx, lookback):
                    i += 1
                    continue

                peak_window_start = max(0, B_idx - lookback)
                peak_rel_idx = int(np.argmax(close[peak_window_start:B_idx + 1]))
                peak_idx = peak_window_start + peak_rel_idx
                peak_before_B = close[peak_idx]

                # 3) FIND C
                C_idx = None
                C_close = None
                last_C_update = None

                k = B_idx + confirm_days + 1
                upper_bc = min(B_idx + max_bc_days + 1, n)

                while k < upper_bc:
                    ck = close[k]
                    if ck < B_close:
                        C_idx = k
                        C_close = ck
                        last_C_update = k

                        m = k + 1
                        while m < upper_bc:
                            cm = close[m]
                            if cm < C_close:
                                C_close = cm
                                C_idx = m
                                last_C_update = m
                            if m - last_C_update >= confirm_days:
                                break
                            m += 1
                        break
                    k += 1

                if C_idx is None:
                    i += 1
                    continue

                if not is_lowest_in_lookback(close, C_idx, lookback):
                    i += 1
                    continue

                peak_before_C = close[max(0, C_idx - lookback):C_idx + 1].max()

                # 4) FIND BREAKDOWN
                breakdown_idx = None
                k = C_idx + confirm_days + 1
                upper_cd = min(C_idx + max_cd_days + 1, n)

                while k < upper_cd:
                    if close[k] < C_close:
                        breakdown_idx = k
                        break
                    k += 1

                if breakdown_idx is None:
                    i += 1
                    continue

                breakdown_close = close[breakdown_idx]

                # SAVE EVENT
                oidx = orig_idx[breakdown_idx]
                df.at[oidx, "bcdevent"] = 1
                df.at[oidx, "breakdown"] = 1

                df.at[oidx, "peak_Ngay"] = ngay[peak_idx]
                df.at[oidx, "B_Ngay"] = ngay[B_idx]
                df.at[oidx, "C_Ngay"] = ngay[C_idx]
                df.at[oidx, "breakdown_Ngay"] = ngay[breakdown_idx]

                df.at[oidx, "peak_before_B"] = peak_before_B
                df.at[oidx, "peak_before_C"] = peak_before_C

                df.at[oidx, "B_close"] = B_close
                df.at[oidx, "C_close"] = C_close
                df.at[oidx, "breakdown_close"] = breakdown_close

                df.at[oidx, "bc_return"] = (C_close / B_close) - 1
                df.at[oidx, "bc_days"] = C_idx - B_idx
                df.at[oidx, "cd_days"] = breakdown_idx - C_idx
                df.at[oidx, "peak_to_b"] = (B_close / peak_before_B) - 1
                df.at[oidx, "peak_to_c"] = (C_close / peak_before_C) - 1
                df.at[oidx, "breakdown_strength"] = (breakdown_close / C_close) - 1

                i = breakdown_idx + 1

        return df


class RecoveryPointEngine:
    """Training-only: locate the post-breakdown low D and the recovery day (D+1)."""

    @staticmethod
    def build(df, recovery_window=20):
        df = df.copy()
        df["Ngay"] = pd.to_datetime(df["Ngay"])
        logs = []

        for stock, g in df.groupby("stock_id", sort=False):
            g = g.reset_index(drop=True)
            low = g["low"].to_numpy()
            close = g["close"].to_numpy()
            open_ = g["open"].to_numpy()
            ngay = g["Ngay"].to_numpy()

            b_ngay = g["B_Ngay"].to_numpy()
            c_ngay = g["C_Ngay"].to_numpy()
            breakdown_ngay = g["breakdown_Ngay"].to_numpy()
            c_close_arr = g["C_close"].to_numpy()

            event_rows = np.flatnonzero(g["breakdown"].to_numpy() == 1)

            for idx in event_rows:
                c_close = c_close_arr[idx]
                if pd.isna(c_close):
                    continue

                end_idx = min(idx + recovery_window + 1, len(g))
                if idx + 1 >= end_idx:
                    continue

                future_lows = low[idx + 1:end_idx]
                if len(future_lows) == 0:
                    continue

                d_idx = idx + 1 + np.argmin(future_lows)
                d_low = low[d_idx]

                recovery_idx = d_idx + 1
                if recovery_idx >= len(g):
                    recovery_idx = -1

                logs.append({
                    "stock_id": stock,
                    "B_Ngay": b_ngay[idx],
                    "C_Ngay": c_ngay[idx],
                    "breakdown_Ngay": breakdown_ngay[idx],
                    "C_close": c_close,
                    "D_Ngay": ngay[d_idx],
                    "D_low": d_low,
                    "recovery_Ngay": ngay[recovery_idx] if recovery_idx >= 0 else pd.NaT,
                    "recovery_open": open_[recovery_idx] if recovery_idx >= 0 else np.nan,
                    "recovery_close": close[recovery_idx] if recovery_idx >= 0 else np.nan,
                    "recovery_found": int(recovery_idx >= 0),
                })

        return pd.DataFrame(logs)
