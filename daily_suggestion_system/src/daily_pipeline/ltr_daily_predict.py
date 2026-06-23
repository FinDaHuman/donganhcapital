"""
LTR daily inference: score all universe stocks for today and persist top-5 to ltr_signals.

Called from run_daily_pipeline.py as Step 4 (non-fatal).
Can also be run directly for testing:
    cd daily_suggestion_system/src/daily_pipeline
    python ltr_daily_predict.py
"""
import gc
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path

import joblib
import pandas as pd
from sqlalchemy import text

SRC_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SRC_DIR))

from data_access.db_connection import get_engine
from data_access.stock_data_loader import load_stock_data
from data_access.market_data_loader import load_market_data
from features.ltr_features import build_ltr_features, LTR_FEATURE_COLS, UNIVERSE_PATH

log = logging.getLogger(__name__)

# 500 days: covers the 252-day rolling max + 50-day MA + BB-width 50-period rolling + buffer
INFERENCE_LOOKBACK_DAYS = 500
MODEL_PATH = Path(__file__).resolve().parents[2] / "model" / "ltr_model.pkl"
# Top-5 matches the evaluated and gated serving window (go/no-go validated on P@5 only)
TOP_N = 5

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS ltr_signals (
    id         BIGSERIAL PRIMARY KEY,
    date       DATE        NOT NULL,
    stock_id   VARCHAR(10) NOT NULL,
    rank       SMALLINT    NOT NULL,
    score      REAL        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ltr_signals_date_stock_uq UNIQUE (date, stock_id)
);
CREATE INDEX IF NOT EXISTS idx_ltr_signals_date ON ltr_signals (date DESC);
"""


def _ensure_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(_CREATE_TABLE_SQL))


def _load_universe_tickers() -> list[str] | None:
    """Return the 167-stock curated universe. None = abort (fail closed)."""
    if not UNIVERSE_PATH.exists():
        log.error(f"LTR: Universe CSV not found at {UNIVERSE_PATH} — aborting to prevent out-of-distribution scoring")
        return None
    universe = pd.read_csv(UNIVERSE_PATH, usecols=["stock_id"])
    return universe["stock_id"].dropna().unique().tolist()


def score_all_stocks() -> pd.DataFrame | None:
    """
    Compute LTR scores for the latest trading day and write top-5 to ltr_signals.

    Returns the top-5 DataFrame on success, None if scoring cannot run
    (missing model, no data, missing universe CSV, etc.).
    """
    engine = get_engine()
    if engine is None:
        log.error("LTR: No database engine available")
        return None

    _ensure_table(engine)

    if not MODEL_PATH.exists():
        log.error(f"LTR: Model not found at {MODEL_PATH} — run ltr_training.py first")
        return None

    clf = joblib.load(MODEL_PATH)

    start_date = (datetime.now() - timedelta(days=INFERENCE_LOOKBACK_DAYS)).strftime("%Y-%m-%d")

    log.info(f"LTR: Loading stock/market data from {start_date} …")
    stock_df  = load_stock_data(engine,  start_date=start_date)
    market_df = load_market_data(engine, start_date=start_date)

    if stock_df.empty:
        log.warning("LTR: No stock data returned — skipping")
        return None

    # Restrict to the curated 167-stock universe for train/inference consistency.
    # Fail closed: if the CSV is missing we cannot score safely (model is OOD on other tickers).
    universe_tickers = _load_universe_tickers()
    if universe_tickers is None:
        return None
    before = stock_df["stock_id"].nunique()
    stock_df = stock_df[stock_df["stock_id"].isin(universe_tickers)].reset_index(drop=True)
    log.info(f"LTR: Universe filter: {before} -> {stock_df['stock_id'].nunique()} tickers")

    log.info("LTR: Building features …")
    feature_df = build_ltr_features(stock_df, market_df)
    del stock_df, market_df
    gc.collect()

    # Infer scoring date from the latest date present in features
    latest_date = feature_df["Ngay"].max()
    today_str = latest_date.strftime("%Y-%m-%d")
    log.info(f"LTR: Scoring stocks for {today_str}")

    today_df = (
        feature_df[feature_df["Ngay"] == latest_date]
        .dropna(subset=LTR_FEATURE_COLS)
        .copy()
        .reset_index(drop=True)
    )
    del feature_df
    gc.collect()

    if today_df.empty:
        log.warning(f"LTR: No scoreable stocks for {today_str} (all rows had NaN features)")
        return None

    X = today_df[LTR_FEATURE_COLS].astype("float32")
    scores = clf.predict_proba(X)[:, 1]   # LTR breakout score (>8% over 5 trading days)

    today_df = today_df.assign(score=scores)
    today_df = today_df.sort_values("score", ascending=False).reset_index(drop=True)
    today_df["rank"] = today_df.index + 1
    top_n = today_df.head(TOP_N)[["stock_id", "rank", "score"]].copy()

    # DELETE then INSERT in one transaction — avoids stale rows from re-runs
    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM ltr_signals WHERE date = :today"),
            {"today": today_str},
        )
        for _, row in top_n.iterrows():
            conn.execute(
                text("""
                    INSERT INTO ltr_signals (date, stock_id, rank, score)
                    VALUES (:date, :stock_id, :rank, :score)
                """),
                {
                    "date":     today_str,
                    "stock_id": str(row["stock_id"]),
                    "rank":     int(row["rank"]),
                    "score":    float(row["score"]),
                },
            )

    log.info(f"LTR: Saved {len(top_n)} signals for {today_str}")
    return top_n


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    for _cand in [Path(__file__).resolve().parents[2] / ".env",
                  Path(__file__).resolve().parents[3] / "backend" / ".env"]:
        if _cand.exists():
            from dotenv import load_dotenv
            load_dotenv(_cand)
            break

    result = score_all_stocks()
    if result is not None:
        print(result.to_string())
