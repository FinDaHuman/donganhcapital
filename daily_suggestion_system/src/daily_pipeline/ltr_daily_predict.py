"""
LTR daily inference: score all stocks for today and persist top-20 to ltr_signals.

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
from features.ltr_features import build_ltr_features, LTR_FEATURE_COLS

log = logging.getLogger(__name__)

INFERENCE_LOOKBACK_DAYS = 450   # covers 252-day rolling max + buffer
MODEL_PATH = Path(__file__).resolve().parents[2] / "model" / "ltr_model.pkl"
TOP_N = 20

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


def score_all_stocks() -> pd.DataFrame | None:
    """
    Compute LTR scores for the latest trading day and write top-20 to ltr_signals.

    Returns the top-20 DataFrame on success, None if scoring cannot run
    (missing model, no data, etc.).
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
    stock_df = load_stock_data(engine, start_date=start_date)
    market_df = load_market_data(engine, start_date=start_date)

    if stock_df.empty:
        log.warning("LTR: No stock data returned — skipping")
        return None

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
    scores = clf.predict_proba(X)[:, 1]   # P(>6% over 3 days)

    today_df = today_df.assign(score=scores)
    today_df = today_df.sort_values("score", ascending=False).reset_index(drop=True)
    today_df["rank"] = today_df.index + 1
    top20 = today_df.head(TOP_N)[["stock_id", "rank", "score"]].copy()

    # DELETE then INSERT in one transaction — avoids stale rows from re-runs
    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM ltr_signals WHERE date = :today"),
            {"today": today_str},
        )
        for _, row in top20.iterrows():
            conn.execute(
                text("""
                    INSERT INTO ltr_signals (date, stock_id, rank, score)
                    VALUES (:date, :stock_id, :rank, :score)
                """),
                {
                    "date": today_str,
                    "stock_id": str(row["stock_id"]),
                    "rank": int(row["rank"]),
                    "score": float(row["score"]),
                },
            )

    log.info(f"LTR: Saved {len(top20)} signals for {today_str}")
    return top20


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    # Support loading .env for local dev runs
    from pathlib import Path as _P
    for _cand in [_P(__file__).resolve().parents[2] / ".env",
                  _P(__file__).resolve().parents[3] / "backend" / ".env"]:
        if _cand.exists():
            from dotenv import load_dotenv
            load_dotenv(_cand)
            break

    result = score_all_stocks()
    if result is not None:
        print(result.to_string())
