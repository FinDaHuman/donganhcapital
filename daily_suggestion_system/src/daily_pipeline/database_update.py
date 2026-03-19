import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import logging
from datetime import datetime, timedelta

from data_update.stock_ohlc_update import StockDataUpdater
from data_update.vnindex_ohlc_update import update_vnindex_ohlc


# ===============================
# LOGGING
# ===============================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

logger = logging.getLogger(__name__)


# ===============================
# RESOLVE STOCK LIST PATH
# ===============================

# stock_list.txt is in daily_suggestion_system/src/
STOCK_LIST_PATH = str(Path(__file__).resolve().parents[1] / "stock_list.txt")


def update_database_today():

    today = datetime.today()
    start = today - timedelta(days=3)

    today_str = today.strftime("%Y-%m-%d")
    start_str = start.strftime("%Y-%m-%d")

    logger.info("=================================")
    logger.info("DATABASE DAILY UPDATE")
    logger.info(f"Date: {today_str}")
    logger.info("=================================")

    # ---------------------------------
    # UPDATE STOCK OHLC
    # ---------------------------------

    try:

        updater = StockDataUpdater(
            stock_list_path=STOCK_LIST_PATH,
            from_date=start_str,
            to_date=today_str
        )

        updater.run()

        logger.info("Stock OHLC updated")

    except Exception as e:

        logger.error(f"Stock update failed: {e}")

    # ---------------------------------
    # UPDATE VNINDEX
    # ---------------------------------

    try:

        update_vnindex_ohlc(
            start=start_str,
            end=today_str
        )

        logger.info("VNINDEX updated")

    except Exception as e:

        logger.error(f"VNINDEX update failed: {e}")

    logger.info("=================================")
    logger.info("DATABASE UPDATE FINISHED")
    logger.info("=================================")


if __name__ == "__main__":
    update_database_today()