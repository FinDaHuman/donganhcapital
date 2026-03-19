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
        exit_code = 1

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
