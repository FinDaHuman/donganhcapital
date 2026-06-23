import pandas as pd


def build_ltr_labels(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add 5-day forward >8% binary label to the stock dataframe.

    Label at row T = 1 if close[T+5] / close[T] - 1 > 0.08, else 0.
    The last 5 rows per stock get pd.NA (used for inference, not training).

    5-day horizon avoids the HOSE circuit-breaker gap problem while giving
    the move enough time to develop after entry at open[T+1]. The 3-day
    horizon with 10% target required near-limit-up action every day; 5 days
    at 8% is more broadly achievable and tradeable.

    8% threshold targets meaningful breakouts. Base rate is ~3–5%, so
    scale_pos_weight will be ~20–30× (auto-computed from base_rate).

    Input df must be sorted by [stock_id, Ngay] with a 'close' column.
    """
    df = df.copy().sort_values(["stock_id", "Ngay"]).reset_index(drop=True)

    next_close_5d = df.groupby("stock_id")["close"].shift(-5)
    next_return = next_close_5d / df["close"] - 1

    df["ltr_label"] = (next_return > 0.08).astype("Int8")  # nullable int
    df.loc[next_close_5d.isna(), "ltr_label"] = pd.NA

    return df
