"""
BCD model training script — run locally, NOT in GitHub Actions.

Ported from crawl_news `backend/pipelines/backup/training/train_model_1.py`,
retrained from scratch on this repo's stock_ohlc data (the source repo never
shipped its .pkl and its database is a different project).

Model: LGBMClassifier (binary). One training row per detected B-C-D breakdown
event; label = 1 if the stock gains >= +15% within 60 sessions after entering
at the recovery-day open (see labels/bcd_label.py).

Universe: ALL tickers in stock_ohlc. Unlike LTR (cross-sectional ranking over
a curated universe), BCD is event-conditional — the pattern detector is the
universe filter, so train and inference both run on the full table.

Data split (same shape as the source recipe):
  Train : < 2024-01-01
  Val   : 2024                (early stopping + threshold selection only)
  Test  : >= 2025-01-01       (true holdout)

Usage:
    cd daily_suggestion_system/src/training
    python bcd_training.py

Requires DATABASE_URL in one of:
  - Environment variable (set before running)
  - daily_suggestion_system/.env
  - backend/.env
"""
import gc
import logging
import sys
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from lightgbm import LGBMClassifier
from sklearn.metrics import precision_score, recall_score, roc_auc_score

# --- Path setup ---
SRC_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SRC_DIR))

for candidate in [
    SRC_DIR.parents[0] / ".env",
    SRC_DIR.parents[1] / "backend" / ".env",
]:
    if candidate.exists():
        load_dotenv(candidate)
        break

from data_access.db_connection import get_engine
from data_access.stock_data_loader import load_stock_data
from events.bcd import BCDEventEngine, RecoveryPointEngine
from features.bcd_features import BCD_FEATURE_COLS, build_bcd_features
from labels.bcd_label import build_bcd_labels

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

# --- Constants ---
TRAIN_START      = "2010-01-01"   # events are rare (~a few per stock per decade) — use all history
SPLIT_DATE_TRAIN = pd.Timestamp("2024-01-01")
SPLIT_DATE_VAL   = pd.Timestamp("2025-01-01")
MODEL_SAVE_PATH  = Path(__file__).resolve().parents[2] / "model" / "bcd_model.pkl"


def build_dataset(stock_df: pd.DataFrame) -> pd.DataFrame:
    log.info("Building BCD rolling features …")
    feat_df = build_bcd_features(stock_df, lookback_peak=60, ma_ma=200)
    gc.collect()

    log.info("Detecting B-C-D events …")
    event_df = BCDEventEngine.build(
        feat_df,
        lookback=20, drop_pct=0.15, confirm_days=2,
        max_bc_days=20, max_cd_days=20,
    )
    del feat_df
    gc.collect()

    log.info("Locating recovery points …")
    recovery_df = RecoveryPointEngine.build(event_df, recovery_window=20)

    log.info("Building labels (+15% within 60 sessions) …")
    label_df = build_bcd_labels(recovery_df, event_df, horizon=60, target_return=0.15)

    breakdown_df = event_df[event_df["breakdown"] == 1].copy()
    log.info(f"  Detected breakdown events: {len(breakdown_df):,}")
    del event_df
    gc.collect()

    train_df = breakdown_df.merge(
        label_df[["stock_id", "breakdown_Ngay", "label", "future_return", "recovery_Ngay", "D_Ngay"]],
        on=["stock_id", "breakdown_Ngay"],
        how="inner",
    )
    log.info(f"  Labeled training rows: {len(train_df):,}")

    per_year = train_df.groupby(train_df["Ngay"].dt.year)["label"].agg(["count", "mean"])
    log.info("Events per year (count / positive rate):\n" + per_year.to_string())

    return train_df


def prepare_split(train_df: pd.DataFrame):
    train_df = train_df.sort_values(["Ngay", "stock_id"]).reset_index(drop=True)

    train_set = train_df[train_df["Ngay"] < SPLIT_DATE_TRAIN].copy()
    val_set = train_df[
        (train_df["Ngay"] >= SPLIT_DATE_TRAIN) & (train_df["Ngay"] < SPLIT_DATE_VAL)
    ].copy()
    test_set = train_df[train_df["Ngay"] >= SPLIT_DATE_VAL].copy()

    log.info(f"  Train : {len(train_set):,} events (< 2024)")
    log.info(f"  Val   : {len(val_set):,} events (2024 — early stopping + threshold only)")
    log.info(f"  Test  : {len(test_set):,} events (2025+ — holdout)")

    X_train = train_set[BCD_FEATURE_COLS].replace([np.inf, -np.inf], np.nan).astype("float32")
    medians = X_train.median()

    def prep(df):
        X = df[BCD_FEATURE_COLS].replace([np.inf, -np.inf], np.nan).astype("float32")
        return X.fillna(medians)

    return (
        prep(train_set), train_set["label"].values,
        prep(val_set), val_set["label"].values,
        prep(test_set), test_set["label"].values,
        medians,
    )


def train(X_train, y_train, X_val, y_val):
    n_pos = int((y_train == 1).sum())
    n_neg = int((y_train == 0).sum())
    scale_pos_weight = n_neg / (n_pos + 1e-9)
    log.info(f"  Train positives: {n_pos:,} / {len(y_train):,}  scale_pos_weight={scale_pos_weight:.2f}")

    clf = LGBMClassifier(
        objective="binary",
        n_estimators=5000,
        learning_rate=0.02,
        num_leaves=31,
        max_depth=-1,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_samples=20,
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        n_jobs=-1,
        verbose=-1,
    )

    log.info("Fitting LGBMClassifier …")
    clf.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        eval_metric="auc",
        callbacks=[lgb.early_stopping(50, verbose=True), lgb.log_evaluation(period=100)],
    )
    log.info(f"Best iteration: {clf.best_iteration_}")
    return clf


def pick_threshold(clf, X_val, y_val) -> float:
    """Precision-maximizing threshold on the validation set (source recipe)."""
    proba_val = clf.predict_proba(X_val)[:, 1]
    best_prec, best_thr = 0.0, 0.8  # fallback
    for t in np.linspace(0.05, 0.95, 181):
        pred = (proba_val >= t).astype(int)
        prec = precision_score(y_val, pred, zero_division=0)
        if prec > best_prec:
            best_prec, best_thr = prec, t
    log.info(f"  Best val precision: {best_prec:.4f} at threshold {best_thr:.4f}")
    return float(best_thr)


def report(clf, threshold, X, y, name):
    if len(y) == 0:
        log.warning(f"  {name}: empty set, skipping metrics")
        return
    proba = clf.predict_proba(X)[:, 1]
    pred = (proba >= threshold).astype(int)
    auc = roc_auc_score(y, proba) if len(np.unique(y)) > 1 else float("nan")
    prec = precision_score(y, pred, zero_division=0)
    rec = recall_score(y, pred, zero_division=0)
    log.info(
        f"  {name}: AUC={auc:.4f}  precision@thr={prec:.4f}  recall@thr={rec:.4f}  "
        f"flagged={int(pred.sum())}/{len(y)}  base_rate={y.mean():.4f}"
    )


def save_model(clf, threshold, medians):
    MODEL_SAVE_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": clf,
            "features": BCD_FEATURE_COLS,
            "best_threshold": threshold,
            "medians": medians.to_dict(),
        },
        MODEL_SAVE_PATH,
        compress=3,
    )
    size_mb = MODEL_SAVE_PATH.stat().st_size / 1e6
    log.info(f"Model saved → {MODEL_SAVE_PATH}  ({size_mb:.1f} MB)")


def print_feature_importance(clf):
    importance = pd.Series(clf.feature_importances_, index=BCD_FEATURE_COLS).sort_values(ascending=False)
    log.info("Feature importances:\n" + importance.to_string())


def main():
    engine = get_engine()
    log.info("Loading stock OHLC from NeonDB …")
    stock_df = load_stock_data(engine, start_date=TRAIN_START)
    log.info(f"  {len(stock_df):,} rows, {stock_df['stock_id'].nunique()} tickers")

    train_df = build_dataset(stock_df)
    del stock_df
    gc.collect()

    X_train, y_train, X_val, y_val, X_test, y_test, medians = prepare_split(train_df)
    del train_df
    gc.collect()

    clf = train(X_train, y_train, X_val, y_val)
    threshold = pick_threshold(clf, X_val, y_val)

    report(clf, threshold, X_train, y_train, "Train")
    report(clf, threshold, X_val, y_val, "Val  ")
    report(clf, threshold, X_test, y_test, "Test ")

    print_feature_importance(clf)
    save_model(clf, threshold, medians)
    log.info("BCD training complete.")


if __name__ == "__main__":
    main()
