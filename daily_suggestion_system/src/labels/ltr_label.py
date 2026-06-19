import pandas as pd


def build_ltr_labels(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add 3-day forward >6% binary label to the stock dataframe.

    Label at row T = 1 if close[T+3] / close[T] - 1 > 0.06, else 0.
    The last 3 rows per stock get pd.NA (used for inference, not training).

    3-day horizon avoids the HOSE circuit-breaker problem: stocks predicted to
    rise >6% close-to-close in 1 day tend to gap up ~5.5% at the open, leaving
    no entry room. Over 3 trading days the move can develop after entry at open[T+1].

    Input df must be sorted by [stock_id, Ngay] with a 'close' column.
    """
    df = df.copy().sort_values(["stock_id", "Ngay"]).reset_index(drop=True)

    next_close_3d = df.groupby("stock_id")["close"].shift(-3)
    next_return = next_close_3d / df["close"] - 1

    df["ltr_label"] = (next_return > 0.06).astype("Int8")  # nullable int
    df.loc[next_close_3d.isna(), "ltr_label"] = pd.NA

    return df
