"""
Unified daily pipeline entry point.
Runs both database update and prediction pipeline in sequence.
Designed for CI (GitHub Actions) execution.

Usage:
    python run_daily_pipeline.py
"""

import sys
import logging
from pathlib import Path

# Add src/ to path so all internal imports work
sys.path.append(str(Path(__file__).resolve().parents[1]))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

logger = logging.getLogger(__name__)


def run():
    exit_code = 0

    # ==============================
    # STEP 0: Verify Environment & DB
    # ==============================

    logger.info("=" * 50)
    logger.info("STEP 0: ENVIRONMENT CHECK")
    logger.info("=" * 50)

    try:
        from data_access.db_connection import get_engine
        get_engine()  # Fails fast if DATABASE_URL is missing or DB is unreachable
        logger.info("Database connection verified.")
    except Exception as e:
        logger.error(f"Pre-flight check failed: {e}")
        logger.error("Stopping pipeline: Database is not configured or unreachable.")
        sys.exit(1)

    # ==============================
    # STEP 1: Update market data
    # ==============================

    logger.info("=" * 50)
    logger.info("STEP 1: DATABASE UPDATE")
    logger.info("=" * 50)

    try:
        from database_update import update_database_today
        update_database_today()
    except Exception as e:
        logger.error(f"Database update failed: {e}")
        logger.error("Stopping pipeline before prediction to avoid using stale market data")
        sys.exit(1)

    # ==============================
    # STEP 2: Run prediction
    # ==============================

    logger.info("=" * 50)
    logger.info("STEP 2: PREDICTION PIPELINE")
    logger.info("=" * 50)

    try:
        from daily_predict import predict_today
        result = predict_today()
        if result is not None:
            logger.info(f"Pipeline finished: {len(result)} signals generated")
        else:
            logger.info("Pipeline finished: no signals today")
    except Exception as e:
        logger.error(f"Prediction pipeline failed: {e}")
        exit_code = 1

    # ==============================
    # STEP 3: VN30F1M INTRADAY UPDATE
    # ==============================

    logger.info("=" * 50)
    logger.info("STEP 3: VN30F1M INTRADAY UPDATE")
    logger.info("=" * 50)

    try:
        from vn30f1m_update import update_vn30f1m_intraday
        rows = update_vn30f1m_intraday()
        if rows:
            logger.info(f"VN30F1M: {rows} candles")
        else:
            # Deliberately does NOT set exit_code, the same way step 5 treats
            # zero BCD events as normal. But the fetch covers a multi-day window,
            # so zero rows is not an ordinary quiet day — it means an extended
            # holiday or a source that has stopped returning data. WARNING keeps
            # it visible without training people to ignore a red run.
            logger.warning(
                "VN30F1M: no intraday rows in the whole window - "
                "extended holiday, or the source needs checking"
            )
    except Exception as e:
        logger.error(f"VN30F1M update failed: {e}")
        exit_code = 1

    # ==============================
    # STEP 4: LTR RANKING SIGNALS
    # ==============================

    logger.info("=" * 50)
    logger.info("STEP 4: LTR RANKING SIGNALS")
    logger.info("=" * 50)

    try:
        from ltr_daily_predict import score_all_stocks
        result = score_all_stocks()
        logger.info(f"LTR: {len(result) if result is not None else 0} stocks ranked")
    except Exception as e:
        logger.error(f"LTR step failed (non-fatal): {e}")
        exit_code = 1

    # ==============================
    # STEP 5: BCD BREAKDOWN SIGNALS
    # ==============================

    logger.info("=" * 50)
    logger.info("STEP 5: BCD BREAKDOWN SIGNALS")
    logger.info("=" * 50)

    try:
        from bcd_daily_predict import detect_and_score
        result = detect_and_score()
        if result is None:
            raise RuntimeError("BCD inference could not run (missing model or data)")
        logger.info(f"BCD: {len(result)} breakdown signals")
    except Exception as e:
        logger.error(f"BCD step failed (non-fatal): {e}")
        exit_code = 1

    # ==============================
    # STEP 6: BCD SIGNAL TRIGGERS
    # ==============================

    logger.info("=" * 50)
    logger.info("STEP 6: BCD SIGNAL TRIGGERS")
    logger.info("=" * 50)

    # A BCD signal is a resting limit order on the B->C line, so it becomes a
    # trade only once the market trades down to that line. Runs unconditionally:
    # signals from earlier days are still waiting even when Step 5 found none.
    try:
        from bcd_signal_trigger import evaluate_bcd_triggers
        result = evaluate_bcd_triggers()
        if result is None:
            raise RuntimeError("BCD trigger evaluation could not run (no DB or market data)")
        logger.info(
            f"BCD triggers: {result['triggered']} filled, "
            f"{result['expired']} expired, {result['waiting']} waiting"
        )
    except Exception as e:
        logger.error(f"BCD trigger step failed (non-fatal): {e}")
        exit_code = 1

    # ==============================
    # STEP 7: BCD TRADE TRACKER
    # ==============================

    logger.info("=" * 50)
    logger.info("STEP 7: BCD TRADE TRACKER")
    logger.info("=" * 50)

    # Runs unconditionally so open BCD positions resolve TP/SL/TIMEOUT even on
    # zero-event days (Step 5 producing no signals is the normal case).
    try:
        from bcd_trade_tracker import update_bcd_trades
        result = update_bcd_trades()
        if result is None:
            raise RuntimeError("BCD trade tracker could not run (no DB or market data)")
    except Exception as e:
        logger.error(f"BCD trade tracker failed (non-fatal): {e}")
        exit_code = 1

    # ==============================
    # DONE
    # ==============================

    logger.info("=" * 50)
    if exit_code == 0:
        logger.info("DAILY PIPELINE COMPLETED SUCCESSFULLY")
    else:
        logger.error("DAILY PIPELINE COMPLETED WITH ERRORS")
    logger.info("=" * 50)

    sys.exit(exit_code)


if __name__ == "__main__":
    run()
