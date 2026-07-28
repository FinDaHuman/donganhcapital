"""
BCD model training script — run locally, NOT in GitHub Actions.

Ported from crawl_news `backend/pipelines/backup/training/train_model_1.py`,
retrained from scratch on this repo's stock_ohlc data (the source repo never
shipped its .pkl and its database is a different project).

Model: LGBMClassifier (binary). One training row per breakdown event that the
market actually filled; label = 1 if that trade closed at TP rather than SL or
TIMEOUT (see labels/bcd_label.py). Events whose limit order was never reached
are excluded, so `prob` reads as "given a fill, does this reach +15% first?".

Universe: ALL tickers in stock_ohlc. Unlike LTR (cross-sectional ranking over
a curated universe), BCD is event-conditional — the pattern detector is the
universe filter, so train and inference both run on the full table.

Data split:
  Train : < 2023-01-01
  Val   : 2023–2024           (early stopping + threshold selection only)
  Test  : >= 2025-01-01       (true holdout)

The validation window is two years rather than the source recipe's one: on a
single year it held only 59 events, which stopped training at 8 trees and left
the holdout AUC near chance.

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
from events.bcd import BCDEventEngine
from features.bcd_features import BCD_FEATURE_COLS, build_bcd_features
from labels.bcd_label import build_bcd_labels

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

# --- Constants ---
TRAIN_START      = "2010-01-01"   # events are rare (~a few per stock per decade) — use all history
SPLIT_DATE_TRAIN = pd.Timestamp("2023-01-01")
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

    breakdown_df = event_df[event_df["breakdown"] == 1].copy()
    log.info(f"  Detected breakdown events: {len(breakdown_df):,}")

    log.info("Simulating the trade each event would have produced …")
    train_df = build_bcd_labels(breakdown_df, event_df)
    del event_df, breakdown_df
    gc.collect()

    log.info(f"  Events that filled and closed: {len(train_df):,}")
    outcomes = train_df["exit_status"].value_counts()
    log.info("Exit mix:\n" + outcomes.to_string())

    per_year = train_df.groupby(train_df["Ngay"].dt.year)["label"].agg(["count", "mean"])
    log.info("Events per year (count / win rate):\n" + per_year.to_string())

    return train_df


def prepare_split(train_df: pd.DataFrame):
    train_df = train_df.sort_values(["Ngay", "stock_id"]).reset_index(drop=True)

    train_set = train_df[train_df["Ngay"] < SPLIT_DATE_TRAIN].copy()
    val_set = train_df[
        (train_df["Ngay"] >= SPLIT_DATE_TRAIN) & (train_df["Ngay"] < SPLIT_DATE_VAL)
    ].copy()
    test_set = train_df[train_df["Ngay"] >= SPLIT_DATE_VAL].copy()

    log.info(f"  Train : {len(train_set):,} events (< 2023)")
    log.info(f"  Val   : {len(val_set):,} events (2023–2024 — early stopping + threshold only)")
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
        # Replaces the default binary_logloss. Without this LightGBM tracks both
        # metrics and stops on whichever stalls first — scale_pos_weight makes
        # logloss degrade almost immediately, which cut training off at ~10
        # trees no matter how high the patience was set.
        metric="auc",
    )

    log.info("Fitting LGBMClassifier …")
    clf.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        eval_metric="auc",
        callbacks=[
            lgb.early_stopping(150, first_metric_only=True, verbose=True),
            lgb.log_evaluation(period=100),
        ],
    )
    log.info(f"Best iteration: {clf.best_iteration_}")
    return clf


# A threshold is only meaningful if enough validation events clear it —
# otherwise "100% precision on 1 signal" wins the scan and the number is noise.
MIN_THRESHOLD_SUPPORT = 20


def pick_threshold(clf, X_val, y_val, min_support: int = MIN_THRESHOLD_SUPPORT) -> float:
    """Precision-maximizing threshold on the validation set (source recipe),
    restricted to thresholds that still flag `min_support` events."""
    proba_val = clf.predict_proba(X_val)[:, 1]
    best_prec, best_thr, best_n = 0.0, 0.8, 0  # fallback
    for t in np.linspace(0.05, 0.95, 181):
        pred = (proba_val >= t).astype(int)
        n = int(pred.sum())
        if n < min_support:
            continue
        prec = precision_score(y_val, pred, zero_division=0)
        if prec > best_prec:
            best_prec, best_thr, best_n = prec, t, n

    if best_n == 0:
        log.warning(
            f"  No threshold flags {min_support}+ validation events "
            f"(val size {len(y_val)}) — falling back to {best_thr:.2f}"
        )
        return float(best_thr)

    log.info(
        f"  Best val precision: {best_prec:.4f} at threshold {best_thr:.4f} "
        f"({best_n} of {len(y_val)} events flagged)"
    )
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
