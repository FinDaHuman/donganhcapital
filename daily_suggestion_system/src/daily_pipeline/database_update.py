import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from datetime import datetime, timedelta

from data_update.stock_ohlc_update import StockDataUpdater
from data_update.vnindex_ohlc_update import update_vnindex_ohlc

def update_database_today():

    today = datetime.today()
    start = today - timedelta(days=3)

    today_str = today.strftime("%Y-%m-%d")
    start_str = start.strftime("%Y-%m-%d")

    print("=================================")
    print("DATABASE DAILY UPDATE")
    print("Date:", today_str)
    print("=================================")

    # ---------------------------------
    # UPDATE STOCK OHLC
    # ---------------------------------

    try:

        updater = StockDataUpdater(
            stock_list_path="stock_list.txt",
            from_date=start_str,
            to_date=today_str
        )

        updater.run()

        print("Stock OHLC updated")

    except Exception as e:

        print("Stock update failed")
        print(e)

    # ---------------------------------
    # UPDATE VNINDEX
    # ---------------------------------

    try:

        update_vnindex_ohlc(
            start=start_str,
            end=today_str
        )

        print("VNINDEX updated")

    except Exception as e:

        print("VNINDEX update failed")
        print(e)

    print("=================================")
    print("DATABASE UPDATE FINISHED")
    print("=================================")


if __name__ == "__main__":
    update_database_today()