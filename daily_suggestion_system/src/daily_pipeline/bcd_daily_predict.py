"""
BCD daily inference: detect B-C-D breakdown events on the latest trading day,
score their recovery probability, and persist to bcd_signals.

Called from run_daily_pipeline.py as Step 5 (non-fatal).
Can also be run directly for testing:
    cd daily_suggestion_system/src/daily_pipeline
    python bcd_daily_predict.py

Unlike LTR, zero signals is the NORMAL outcome — the model only fires on days
when a stock completes a B-C-D breakdown pattern.
"""
import gc
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sqlalchemy import text

SRC_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SRC_DIR))

from data_access.db_connection import get_engine
from data_access.stock_data_loader import load_stock_data
from events.bcd import BCDEventEngine
from features.bcd_features import BCD_FEATURE_COLS, SL_MULT, TP_MULT, build_bcd_features, calc_bcd_entry

log = logging.getLogger(__name__)

# 500 days: covers the 200-day MA + 60-day peak + max pattern span (~60 sessions) + buffer
INFERENCE_LOOKBACK_DAYS = 500
MODEL_PATH = Path(__file__).resolve().parents[2] / "model" / "bcd_model.pkl"

# Kept in sync with backend/db/bcd_signals_migration.py (belt-and-suspenders,
# same convention as ltr_daily_predict.py).
_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS bcd_signals (
    id               BIGSERIAL PRIMARY KEY,
    date             DATE        NOT NULL,
    stock_id         VARCHAR(10) NOT NULL,
    prob             REAL        NOT NULL,
    passed_threshold BOOLEAN     NOT NULL DEFAULT FALSE,
    entry_price      REAL,
    tp_price         REAL,
    sl_price         REAL,
    peak_date        DATE,
    peak_price       REAL,
    b_date           DATE,
    b_price          REAL,
    c_date           DATE,
    c_price          REAL,
    breakdown_price  REAL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bcd_signals_date_stock_uq UNIQUE (date, stock_id)
);
CREATE INDEX IF NOT EXISTS idx_bcd_signals_date ON bcd_signals (date DESC);
"""


def _ensure_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(_CREATE_TABLE_SQL))


def _to_date_str(value):
    if pd.isna(value):
        return None
    return pd.Timestamp(value).strftime("%Y-%m-%d")


def detect_and_score() -> pd.DataFrame | None:
    """
    Detect breakdown events for the latest trading day, score them, and write
    bcd_signals rows (all events, with passed_threshold flagging high-confidence
    ones).

    Returns the signals DataFrame on success (possibly empty — a no-event day),
    None if inference cannot run (missing model, no data, …).
    """
    engine = get_engine()
    if engine is None:
        log.error("BCD: No database engine available")
        return None

    _ensure_table(engine)

    if not MODEL_PATH.exists():
        log.error(f"BCD: Model not found at {MODEL_PATH} — run bcd_training.py first")
        return None

    model_data = joblib.load(MODEL_PATH)
    clf = model_data["model"]
    feature_cols = model_data.get("features", BCD_FEATURE_COLS)
    best_threshold = float(model_data.get("best_threshold", 0.8))
    medians = model_data.get("medians", {})

    start_date = (datetime.now() - timedelta(days=INFERENCE_LOOKBACK_DAYS)).strftime("%Y-%m-%d")

    log.info(f"BCD: Loading stock data from {start_date} …")
    stock_df = load_stock_data(engine, start_date=start_date)

    if stock_df.empty:
        log.warning("BCD: No stock data returned — skipping")
        return None

    log.info("BCD: Building features + detecting events …")
    feat_df = build_bcd_features(stock_df, lookback_peak=60, ma_ma=200)
    del stock_df
    gc.collect()

    event_df = BCDEventEngine.build(
        feat_df,
        lookback=20, drop_pct=0.15, confirm_days=2,
        max_bc_days=20, max_cd_days=20,
    )
    del feat_df
    gc.collect()

    # Infer signal date from the latest date present in the data
    latest_date = event_df["Ngay"].max()
    today_str = latest_date.strftime("%Y-%m-%d")

    today_events = event_df[
        (event_df["Ngay"] == latest_date) & (event_df["breakdown"] == 1)
    ].copy()
    del event_df
    gc.collect()

    if today_events.empty:
        # Normal outcome — still clear the date so re-runs stay idempotent
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM bcd_signals WHERE date = :d"), {"d": today_str})
        log.info(f"BCD: No breakdown events for {today_str}")
        return pd.DataFrame()

    X = (
        today_events[feature_cols]
        .replace([np.inf, -np.inf], np.nan)
        .fillna(pd.Series(medians))
        .astype("float32")
    )
    probs = clf.predict_proba(X)[:, 1]
    today_events = today_events.assign(prob=probs)
    today_events["passed_threshold"] = today_events["prob"] >= best_threshold
    today_events = today_events.sort_values("prob", ascending=False).reset_index(drop=True)

    rows = []
    for _, row in today_events.iterrows():
        entry = calc_bcd_entry(row)
        rows.append({
            "date": today_str,
            "stock_id": str(row["stock_id"]),
            "prob": float(row["prob"]),
            "passed_threshold": bool(row["passed_threshold"]),
            "entry_price": float(entry) if entry is not None else None,
            "tp_price": float(entry * TP_MULT) if entry is not None else None,
            "sl_price": float(entry * SL_MULT) if entry is not None else None,
            "peak_date": _to_date_str(row.get("peak_Ngay")),
            "peak_price": float(row["peak_before_B"]) if not pd.isna(row.get("peak_before_B")) else None,
            "b_date": _to_date_str(row.get("B_Ngay")),
            "b_price": float(row["B_close"]) if not pd.isna(row.get("B_close")) else None,
            "c_date": _to_date_str(row.get("C_Ngay")),
            "c_price": float(row["C_close"]) if not pd.isna(row.get("C_close")) else None,
            "breakdown_price": float(row["breakdown_close"]) if not pd.isna(row.get("breakdown_close")) else None,
        })

    # DELETE then INSERT in one transaction — avoids stale rows from re-runs
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM bcd_signals WHERE date = :d"), {"d": today_str})
        conn.execute(
            text("""
                INSERT INTO bcd_signals
                    (date, stock_id, prob, passed_threshold, entry_price, tp_price, sl_price,
                     peak_date, peak_price, b_date, b_price, c_date, c_price, breakdown_price)
                VALUES
                    (:date, :stock_id, :prob, :passed_threshold, :entry_price, :tp_price, :sl_price,
                     :peak_date, :peak_price, :b_date, :b_price, :c_date, :c_price, :breakdown_price)
            """),
            rows,
        )

    result = pd.DataFrame(rows)
    log.info(
        f"BCD: Saved {len(result)} signals for {today_str} "
        f"({int(result['passed_threshold'].sum())} above threshold {best_threshold:.2f})"
    )
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    for _cand in [Path(__file__).resolve().parents[2] / ".env",
                  Path(__file__).resolve().parents[3] / "backend" / ".env"]:
        if _cand.exists():
            from dotenv import load_dotenv
            load_dotenv(_cand)
            break

    result = detect_and_score()
    if result is not None and not result.empty:
        print(result.to_string())
