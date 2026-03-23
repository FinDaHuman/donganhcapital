import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import pandas as pd
import joblib
import logging


from datetime import datetime, timedelta
from sqlalchemy import text

from data_access.db_connection import get_engine
from data_access.market_data_loader import load_market_data
from data_access.stock_data_loader import load_stock_data

from features.market_features import MarketRegimeFeatureBuilder
from events.breakout import BreakoutEventEngine
from features.breakout_features import build_features_sepa
from filters.sepa_hard_filter import apply_sepa_hard_filter


# ===============================
# PANDAS DISPLAY CONFIG
# ===============================

pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 50)


# ===============================
# LOGGING
# ===============================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

logger = logging.getLogger(__name__)


# ===============================
# CONFIG
# ===============================

TRADE_END = datetime.today()
TRADE_START = "2010-01-01"
TRADE_END = TRADE_END.strftime("%Y-%m-%d")

# Resolve model path relative to this file (works in both local and CI)
MODEL_PATH = str(Path(__file__).resolve().parents[2] / "model" / "breakout_model.pkl")




# ===============================
# MARKET FEATURES
# ===============================

def build_market_features():

    engine = get_engine()

    market_df = load_market_data(
        engine,
        start_date=TRADE_START,
        end_date=TRADE_END
    )

    market_features = MarketRegimeFeatureBuilder.build(market_df)

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


# ===============================
# LOAD STOCK DATA
# ===============================

def load_stock_df():

    engine = get_engine()

    df = load_stock_data(
        engine,
        start_date=TRADE_START,
        end_date=TRADE_END
    )

    df = (
        df
        .dropna(subset=["Ngay"])
        .sort_values(["stock_id", "Ngay"])
        .reset_index(drop=True)
    )

    return df


# ===============================
# BUILD DATASET
# ===============================

def build_dataset():

    logger.info("Building dataset")

    stock_df = load_stock_df()

    market_features, regime_cols = build_market_features()

    full_df = (
        stock_df
        .merge(
            market_features[["Ngay"] + regime_cols],
            on="Ngay",
            how="left"
        )
        .sort_values(["stock_id", "Ngay"])
        .reset_index(drop=True)
    )

    logger.info("Detect breakout")

    event_df = BreakoutEventEngine.build(
        df=full_df,
        breakout_lookback=100,
        min_base_length=12,
        max_base_length=120,
        cooldown_days=12
    )

    feature_df = build_features_sepa(event_df)

    return feature_df



# ===============================
# SAVE DB SIGNAL
# ===============================

def save_db_signal(df):
    if df is None or len(df) == 0:
        return

    try:
        engine = get_engine()
        if not engine:
            logger.warning("No DB engine available for saving signals.")
            return

        date_str = datetime.today().strftime("%Y-%m-%d")
        
        signals = df[
            ["stock_id", "entry_price", "tp_price", "sl_price", "prob"]
        ].copy()
        signals["date"] = date_str
        
        with engine.begin() as conn:
            for _, row in signals.iterrows():
                query = text("""
                INSERT INTO ai_signals (date, stock_id, entry_price, tp_price, sl_price, prob)
                VALUES (:date, :stock_id, :entry_price, :tp_price, :sl_price, :prob)
                ON CONFLICT (date, stock_id) 
                DO UPDATE SET 
                    entry_price = EXCLUDED.entry_price,
                    tp_price = EXCLUDED.tp_price,
                    sl_price = EXCLUDED.sl_price,
                    prob = EXCLUDED.prob;
                """)
                conn.execute(query, {
                    "date": row["date"],
                    "stock_id": row["stock_id"],
                    "entry_price": row["entry_price"],
                    "tp_price": row["tp_price"],
                    "sl_price": row["sl_price"],
                    "prob": row["prob"]
                })
        logger.info(f"{len(signals)} signals saved to NeonDB")
    except Exception as e:
        logger.error(f"Error saving signals to DB: {e}")


# ===============================
# SAVE DB SUMMARY
# ===============================

def save_db_summary(signal_count):
    """Save daily signal count to daily_signal_summary table."""
    try:
        engine = get_engine()
        if not engine:
            logger.warning("No DB engine available for saving summary.")
            return

        date_str = datetime.today().strftime("%Y-%m-%d")

        with engine.begin() as conn:
            query = text("""
            INSERT INTO daily_signal_summary (date, signal_count, updated_at)
            VALUES (:date, :signal_count, NOW())
            ON CONFLICT (date)
            DO UPDATE SET
                signal_count = EXCLUDED.signal_count,
                updated_at = NOW();
            """)
            conn.execute(query, {
                "date": date_str,
                "signal_count": signal_count
            })
        logger.info(f"Summary saved: {date_str} → {signal_count} signals")
    except Exception as e:
        logger.error(f"Error saving summary to DB: {e}")

# ===============================
# PREDICT
# ===============================

def predict_today():

    df = build_dataset()

    today = df["Ngay"].max()

    today_df = df[
        (df["Ngay"] == today) &
        (df["is_breakout"] == 1)
    ].reset_index(drop=True)

    logger.info(f"Breakout detected today: {len(today_df)}")

    if len(today_df) == 0:
        logger.info("No breakout today")
        save_db_summary(0)
        return


    # ===============================
    # DISPLAY BREAKOUT
    # ===============================

    table = today_df[["Ngay", "stock_id", "close", "volume"]].copy()

    table["Ngay"] = table["Ngay"].astype(str)
    table["close"] = table["close"].map("{:.2f}".format)
    table["volume"] = table["volume"].map("{:,}".format)

    logger.info("\n===== BREAKOUT STOCKS =====")

    logger.info(
        "\n" +
        table.to_string(
            index=False,
            col_space=12,
            justify="left"
        )
    )


    # ===============================
    # SEPA FILTER
    # ===============================

    today_df = apply_sepa_hard_filter(today_df, debug=True)

    logger.info(f"After SEPA filter: {len(today_df)}")

    if len(today_df) == 0:
        logger.info("No stock today (filtered)")
        save_db_summary(0)
        return


    logger.info(
        "Stocks after SEPA: " +
        ", ".join(today_df["stock_id"].tolist())
    )


    # ===============================
    # FEATURES
    # ===============================

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


    today_df = today_df.dropna(subset=feature_cols)

    if len(today_df) == 0:
        logger.info("No stock today (missing features)")
        save_db_summary(0)
        return


    logger.info("Loading model")

    model = joblib.load(MODEL_PATH)

    X = today_df[feature_cols]

    probs = model.predict_proba(X)[:, 1]

    today_df["prob"] = probs


    # ===============================
    # ENTRY / TP / SL
    # ===============================

    tp_atr = 10
    sl_atr = 6

    today_df["entry_price"] = today_df["close"]

    today_df["tp_price"] = (
        today_df["entry_price"]
        + tp_atr * today_df["ATR_20"]
    )

    today_df["sl_price"] = (
        today_df["entry_price"]
        - sl_atr * today_df["ATR_20"]
    )


    # ===============================
    # SORT
    # ===============================

    today_df = today_df.sort_values("prob", ascending=False)


    # ===============================
    # DISPLAY SIGNAL
    # ===============================

    logger.info("\n===== TODAY SIGNAL =====")

    logger.info(
        today_df[
            [
                "Ngay",
                "stock_id",
                "entry_price",
                "tp_price",
                "sl_price",
                "prob"
            ]
        ]
    )


    # ===============================
    # TRADE MANAGER
    # ===============================

    try:
        from manager.trade_manager import TradeManager

        engine = get_engine()

        tm = TradeManager(engine=engine)

        # load market data to check TP/SL
        market_df = load_stock_df()

        tm.update_positions(market_df)

        # add new signals
        tm.add_new_signals(today_df)

        tm.finalize()

        # Sync to NeonDB
        if engine:
            tm.save_to_db()

    except Exception as e:
        logger.warning(f"TradeManager error: {e}")

    # ===============================
    # SAVE SIGNAL TO DB
    # ===============================

    save_db_signal(today_df)
    save_db_summary(len(today_df))

    return today_df


# ===============================
# MAIN
# ===============================

def main():

    logger.info("START PREDICTION PIPELINE")

    predict_today()

    logger.info("PIPELINE FINISHED")


if __name__ == "__main__":
    main()
