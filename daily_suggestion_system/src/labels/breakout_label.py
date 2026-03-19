import numpy as np
import pandas as pd


class BreakoutLabelEngine:

    @staticmethod
    def build(
        df: pd.DataFrame,
        tp_atr: float = 10.0,
        sl_atr: float = 6.0,
        lookahead: int = 120,
        max_return_threshold: float = 0.15,
        stock_id_col: str = None,
        entry_mode: str = "next_open",
    ) -> pd.DataFrame:

        data = df.copy()

        sort_cols = ["Ngay"] if stock_id_col is None else [stock_id_col, "Ngay"]
        data = data.sort_values(sort_cols).reset_index(drop=True)

        # =============================
        # Label columns
        # =============================
        data["label"] = np.nan
        data["entry_price"] = np.nan
        data["tp_price"] = np.nan
        data["sl_price"] = np.nan

        data["exit_price"] = np.nan
        data["exit_reason"] = None

        data["label_horizon_days"] = np.nan
        data["realized_return"] = np.nan

        data["max_return_lookahead"] = np.nan
        data["max_drawdown_lookahead"] = np.nan

        data["MFE"] = np.nan
        data["MAE"] = np.nan

        data["ret_5d"] = np.nan
        data["ret_10d"] = np.nan
        data["ret_20d"] = np.nan
        data["ret_60d"] = np.nan

        data["days_to_tp"] = np.nan
        data["days_to_sl"] = np.nan

        if stock_id_col is None:
            groups = [(None, data)]
        else:
            groups = data.groupby(stock_id_col, group_keys=False)

        for key, g in groups:

            g = g.reset_index()
            n = len(g)

            breakout_positions = g.index[g["is_breakout"] == 1]

            for pos in breakout_positions:

                if pos + 1 >= n:
                    continue

                # =============================
                # ENTRY PRICE
                # =============================
                if entry_mode == "close":
                    entry_price = g.loc[pos, "close"]
                    entry_pos = pos
                else:
                    entry_price = g.loc[pos + 1, "open"]
                    entry_pos = pos + 1

                atr = g.loc[pos, "ATR_20"]

                if pd.isna(atr) or atr <= 0:
                    continue

                tp_price = entry_price + tp_atr * atr
                sl_price = entry_price - sl_atr * atr

                original_idx = g.loc[pos, "index"]

                data.loc[original_idx, "entry_price"] = entry_price
                data.loc[original_idx, "tp_price"] = tp_price
                data.loc[original_idx, "sl_price"] = sl_price

                # =============================
                # LOOKAHEAD WINDOW
                # =============================
                end_pos = min(entry_pos + lookahead, n - 1)

                future = g.loc[entry_pos:end_pos]

                if future.empty:
                    continue

                max_high = future["high"].max()
                min_low = future["low"].min()

                max_return = (max_high - entry_price) / entry_price
                max_drawdown = (min_low - entry_price) / entry_price

                data.loc[original_idx, "max_return_lookahead"] = max_return
                data.loc[original_idx, "max_drawdown_lookahead"] = max_drawdown

                data.loc[original_idx, "MFE"] = max_high - entry_price
                data.loc[original_idx, "MAE"] = entry_price - min_low

                label = 0
                horizon_days = lookahead
                exit_price = np.nan
                exit_reason = "timeout"

                days_to_tp = np.nan
                days_to_sl = np.nan

                # =============================
                # PATH DEPENDENT LABEL
                # =============================
                for future_pos, row in future.iterrows():

                    hit_tp = row["high"] >= tp_price
                    hit_sl = row["low"] <= sl_price

                    if hit_sl and hit_tp:
                        label = 0
                        horizon_days = future_pos - entry_pos
                        exit_price = sl_price
                        exit_reason = "sl"
                        days_to_sl = horizon_days
                        break

                    if hit_sl:
                        label = 0
                        horizon_days = future_pos - entry_pos
                        exit_price = sl_price
                        exit_reason = "sl"
                        days_to_sl = horizon_days
                        break

                    if hit_tp:
                        label = 1
                        horizon_days = future_pos - entry_pos
                        exit_price = tp_price
                        exit_reason = "tp"
                        days_to_tp = horizon_days
                        break

                # =============================
                # TIMEOUT EXIT (HYBRID LABEL)
                # =============================
                if exit_reason == "timeout":

                    exit_price = future.iloc[-1]["close"]

                    if max_return >= max_return_threshold:
                        label = 1
                    else:
                        label = 0

                realized_return = (exit_price - entry_price) / entry_price

                data.loc[original_idx, "label"] = label
                data.loc[original_idx, "label_horizon_days"] = horizon_days
                data.loc[original_idx, "exit_price"] = exit_price
                data.loc[original_idx, "exit_reason"] = exit_reason
                data.loc[original_idx, "realized_return"] = realized_return

                data.loc[original_idx, "days_to_tp"] = days_to_tp
                data.loc[original_idx, "days_to_sl"] = days_to_sl

                # =============================
                # Fixed horizon returns
                # =============================
                for h, col in [(5,"ret_5d"),(10,"ret_10d"),(20,"ret_20d"),(60,"ret_60d")]:

                    if entry_pos + h < n:
                        ret = (
                            g.loc[entry_pos + h, "close"] /
                            entry_price - 1
                        )
                        data.loc[original_idx, col] = ret

        return data