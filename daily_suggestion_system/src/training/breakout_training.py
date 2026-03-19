import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import pandas as pd
from sklearn.metrics import roc_auc_score

from data_access.market_data_loader import load_market_data
from data_access.stock_data_loader import load_stock_data

from features.market_features import MarketRegimeFeatureBuilder
from labels.market_label import add_market_label

from events.breakout import BreakoutEventEngine
from labels.breakout_label import BreakoutLabelEngine

from features.breakout_features import build_features_sepa
from filters.sepa_hard_filter import apply_sepa_hard_filter

from models.breakout_model import BreakoutModelTrainer

from data_access.db_connection import get_engine
import datetime


TRADE_START = "2010-01-01"
SPLIT_DATE = pd.Timestamp("2024-01-01")
# TRADE_END = datetime.today().strftime("%Y-%m-%d")
TRADE_END = "2026-12-31"


def build_market_features():
    engine = get_engine()
    market_df = load_market_data(engine, start_date=TRADE_START, end_date=TRADE_END)

    market_features = MarketRegimeFeatureBuilder.build(market_df)
    market_features = add_market_label(market_features)
    market_features["Ngay"] = pd.to_datetime(market_features["Ngay"])

    market_features = (
        market_features
        .dropna(subset=["Ngay"])
        .sort_values("Ngay")
        .reset_index(drop=True)
    )

    regime_cols = [c for c in market_features.columns if c != "Ngay"]

    market_features[regime_cols] = market_features[regime_cols].shift(1)

    return market_features, regime_cols


def load_stock_df():

    engine = get_engine()
    mid_df = load_stock_data(engine, start_date=TRADE_START, end_date=TRADE_END)

    mid_df = (
        mid_df
        .dropna(subset=["Ngay"])
        .sort_values(["stock_id", "Ngay"])
        .reset_index(drop=True)
    )

    return mid_df


def build_training_dataset():

    mid_df = load_stock_df()
    market_features, regime_cols = build_market_features()

    full_df = (
        mid_df
        .merge(
            market_features[["Ngay"] + regime_cols],
            on="Ngay",
            how="left"
        )
        .sort_values(["stock_id", "Ngay"])
        .reset_index(drop=True)
    )

    event_df = BreakoutEventEngine.build(
        df=full_df,
        breakout_lookback=100,
        min_base_length=12,
        max_base_length=120,
        cooldown_days=12
    )

    labeled_df = BreakoutLabelEngine.build(
        df=event_df,
        tp_atr=10.0,
        sl_atr=6.0,
        lookahead=120,
        stock_id_col="stock_id",
        entry_mode="next_open"
    )

    labeled_df = labeled_df[
        labeled_df["Ngay"] >= pd.Timestamp(TRADE_START)
    ].reset_index(drop=True)

    feature_df = build_features_sepa(labeled_df)

    breakout_df = feature_df[
        (feature_df["is_breakout"] == 1) &
        (feature_df["label"].notna())
    ].reset_index(drop=True)

    print("Breakout rows:", len(breakout_df))
    print("Winrate:", breakout_df["label"].mean())

    filtered_df = apply_sepa_hard_filter(breakout_df)

    print("After filter:", len(filtered_df))
    print("Retention:", len(filtered_df) / len(breakout_df))
    print("Winrate after:", filtered_df["label"].mean())

    return filtered_df


def prepare_features(train_df):

    feature_cols = [

        "base_depth",
        "base_length",
        "base_return",
        "tight_range_15",
        "contraction_ratio",
        "breakout_volume_ratio",
        "vol_dryup_ratio",
        "base_volatility",

        "ret_20d_pre",
        "ret_60d_pre",
        "close_strength",

        "ATR_pct",
        "vol_ma20",

        "index_dist_ma200",
        "index_vol_ratio",
        "index_momentum_accel",
        "market_label",

    ]

    train_df = train_df.dropna(subset=feature_cols + ["label"]).reset_index(drop=True)

    leak_cols = [
        "max_return_lookahead",
        "tp_hit",
        "sl_hit",
        "future_high",
        "future_low"
    ]

    train_df = train_df.drop(
        columns=[c for c in leak_cols if c in train_df.columns],
        errors="ignore"
    )

    train_mask = train_df["Ngay"] < SPLIT_DATE
    test_mask = train_df["Ngay"] >= SPLIT_DATE

    X_train = train_df.loc[train_mask, feature_cols]
    y_train = train_df.loc[train_mask, "label"].astype(int)

    X_test = train_df.loc[test_mask, feature_cols]
    y_test = train_df.loc[test_mask, "label"].astype(int)

    return X_train, y_train, X_test, y_test


def train_model(X_train, y_train, X_test, y_test):

    trainer = BreakoutModelTrainer()

    trainer.cross_validate(X_train, y_train)

    model = trainer.train(X_train, y_train)

    test_pred = model.predict_proba(X_test)[:, 1]
    test_auc = roc_auc_score(y_test, test_pred)

    print("OOS AUC:", round(test_auc, 4))

    trainer.save_model(model, "/home/doanlong/Do_an/Project/backend/model/breakout_model.pkl")


def main():

    train_df = build_training_dataset()

    X_train, y_train, X_test, y_test = prepare_features(train_df)

    train_model(X_train, y_train, X_test, y_test)


if __name__ == "__main__":
    main()