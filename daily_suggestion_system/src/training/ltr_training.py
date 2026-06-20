"""
LTR model training script — run locally, NOT in GitHub Actions.

Hardware target: ~8 GB RAM, Intel i7 Gen 11, RTX 3050 Ti
  - float32 features keep peak RAM under ~400 MB
  - n_jobs=-1 uses all CPU cores

Model choice — LGBMClassifier (binary cross-entropy):
  LGBMRanker / LambdaRank was evaluated but dropped. With a ~2-4% binary positive
  rate and ~167 stocks per day, the overwhelming majority of training pairs are
  (negative, negative), contributing zero gradient to LambdaRank's pairwise loss.
  A calibrated LGBMClassifier ranked by predict_proba[:,1] produces the same
  ranking at serving time without gradient starvation.

Data split (3-way — avoids early-stopping leaking into holdout):
  Train : 2015-01-01 to 2022-12-31
  Val   : 2023-01-01 to 2023-12-31   (early stopping only — model never fits on this)
  Test  : 2024-01-01 to present      (true holdout — never seen during training or val)

Usage:
    cd daily_suggestion_system/src/training
    python ltr_training.py

Requires DATABASE_URL in one of:
  - Environment variable (set before running)
  - daily_suggestion_system/.env
  - backend/.env
"""
import sys
import gc
import joblib
import logging
from pathlib import Path

import numpy as np
import pandas as pd
import lightgbm as lgb
from lightgbm import LGBMClassifier
from dotenv import load_dotenv

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
from data_access.market_data_loader import load_market_data
from features.ltr_features import build_ltr_features, LTR_FEATURE_COLS
from labels.ltr_label import build_ltr_labels

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

# --- Constants ---
TRAIN_START     = "2015-01-01"
VAL_START       = pd.Timestamp("2023-01-01")   # validation window start (early stopping)
SPLIT_DATE      = pd.Timestamp("2024-01-01")   # true holdout start
TRAIN_END       = "2026-12-31"
MODEL_SAVE_PATH = Path(__file__).resolve().parents[2] / "model" / "ltr_model.pkl"


def load_data():
    engine = get_engine()
    log.info("Loading stock OHLC from NeonDB …")
    stock_df = load_stock_data(engine, start_date=TRAIN_START, end_date=TRAIN_END)
    log.info(f"  stock_df: {len(stock_df):,} rows, {stock_df['stock_id'].nunique()} tickers")

    log.info("Loading market (VNINDEX) data …")
    market_df = load_market_data(engine, start_date=TRAIN_START, end_date=TRAIN_END)
    log.info(f"  market_df: {len(market_df):,} rows")
    return stock_df, market_df


def check_history_depth(stock_df: pd.DataFrame, min_days: int = 300):
    """Warn about tickers with thin history; exclude from training but keep for inference."""
    counts = stock_df.groupby("stock_id")["Ngay"].count()
    thin = counts[counts < min_days]
    if not thin.empty:
        log.warning(
            f"{len(thin)} tickers have < {min_days} trading days and will be excluded from training: "
            f"{thin.index.tolist()}"
        )
    return counts[counts >= min_days].index.tolist()


def build_dataset(stock_df: pd.DataFrame, market_df: pd.DataFrame):
    log.info("Building LTR features …")
    feature_df = build_ltr_features(stock_df, market_df)
    gc.collect()

    log.info("Building LTR labels …")
    labeled_df = build_ltr_labels(feature_df)
    del feature_df
    gc.collect()

    before = len(labeled_df)
    labeled_df = labeled_df.dropna(subset=LTR_FEATURE_COLS + ["ltr_label"]).reset_index(drop=True)
    log.info(f"  Dropped {before - len(labeled_df):,} rows with NaN features/labels; {len(labeled_df):,} remain")
    labeled_df["ltr_label"] = labeled_df["ltr_label"].astype(int)

    base_rate = labeled_df["ltr_label"].mean()
    log.info(f"  Base rate (>6% next day): {base_rate:.4f} ({base_rate*100:.2f}%)")
    log.info(f"  Total positives: {labeled_df['ltr_label'].sum():,} / {len(labeled_df):,}")

    return labeled_df, base_rate


def prepare_split(labeled_df: pd.DataFrame):
    labeled_df = labeled_df.sort_values(["Ngay", "stock_id"]).reset_index(drop=True)

    train_df = labeled_df[labeled_df["Ngay"] < VAL_START].copy()
    val_df   = labeled_df[(labeled_df["Ngay"] >= VAL_START) & (labeled_df["Ngay"] < SPLIT_DATE)].copy()
    test_df  = labeled_df[labeled_df["Ngay"] >= SPLIT_DATE].copy()

    log.info(f"  Train : {len(train_df):,} rows, {train_df['Ngay'].nunique()} days (2015–2022)")
    log.info(f"  Val   : {len(val_df):,} rows, {val_df['Ngay'].nunique()} days (2023 — early stopping only)")
    log.info(f"  Test  : {len(test_df):,} rows, {test_df['Ngay'].nunique()} days (2024+ — holdout)")

    X_train = train_df[LTR_FEATURE_COLS].astype("float32")
    y_train = train_df["ltr_label"].values
    X_val   = val_df[LTR_FEATURE_COLS].astype("float32")
    y_val   = val_df["ltr_label"].values
    X_test  = test_df[LTR_FEATURE_COLS].astype("float32")
    y_test  = test_df["ltr_label"].values

    return X_train, y_train, X_val, y_val, X_test, y_test, test_df


def train(X_train, y_train, X_val, y_val, base_rate: float):
    log.info("Training LGBMClassifier …")

    # Compensate for class imbalance so the model attends to the rare positive class
    scale_pos_weight = (1 - base_rate) / (base_rate + 1e-9)
    log.info(f"  scale_pos_weight: {scale_pos_weight:.1f}  (base_rate={base_rate:.4f})")

    clf = LGBMClassifier(
        objective         = "binary",
        metric            = "auc",

        n_estimators      = 1500,
        learning_rate     = 0.03,
        num_leaves        = 31,
        min_child_samples = 20,

        scale_pos_weight  = scale_pos_weight,

        subsample         = 0.8,
        subsample_freq    = 1,
        colsample_bytree  = 0.8,

        reg_alpha         = 0.1,
        reg_lambda        = 1.0,

        random_state      = 42,
        n_jobs            = -1,
        verbose           = -1,
    )

    callbacks = [
        lgb.early_stopping(stopping_rounds=100, verbose=True),
        lgb.log_evaluation(period=100),
    ]

    clf.fit(
        X_train, y_train,
        eval_set  = [(X_val, y_val)],   # 2023 val only — test holdout never touched
        callbacks = callbacks,
    )

    log.info(f"Best iteration: {clf.best_iteration_}")
    return clf


def save_model(clf):
    MODEL_SAVE_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, MODEL_SAVE_PATH, compress=3)
    size_mb = MODEL_SAVE_PATH.stat().st_size / 1e6
    log.info(f"Model saved → {MODEL_SAVE_PATH}  ({size_mb:.1f} MB)")
    if size_mb > 50:
        log.warning("Model is > 50 MB — consider reducing n_estimators")


def print_feature_importance(clf):
    importance = pd.Series(
        clf.feature_importances_,
        index=LTR_FEATURE_COLS
    ).sort_values(ascending=False)
    log.info("Top-15 feature importances (gain):\n" + importance.head(15).to_string())


def main():
    stock_df, market_df = load_data()

    good_tickers = check_history_depth(stock_df, min_days=300)
    stock_df = stock_df[stock_df["stock_id"].isin(good_tickers)].reset_index(drop=True)

    labeled_df, base_rate = build_dataset(stock_df, market_df)
    del stock_df, market_df
    gc.collect()

    log.info("Splitting train/val/test …")
    X_train, y_train, X_val, y_val, X_test, y_test, test_df = prepare_split(labeled_df)
    del labeled_df
    gc.collect()

    clf = train(X_train, y_train, X_val, y_val, base_rate)

    print_feature_importance(clf)
    save_model(clf)

    log.info("Training complete. Run ltr_eval.py to see go/no-go metrics.")


if __name__ == "__main__":
    main()
