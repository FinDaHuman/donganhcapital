import json
import os
import pandas as pd
from datetime import datetime


class TradeManager:

    def __init__(self):

        self.path = "signals/history/trade_history.json"

        os.makedirs("data", exist_ok=True)

        if os.path.exists(self.path):

            with open(self.path, "r") as f:
                self.data = json.load(f)

        else:

            self.data = {
                "last_update": None,
                "trades": []
            }


    # ==================================
    # UPDATE EXISTING TRADES
    # ==================================

    def update_positions(self, market_df):

        today = market_df["Ngay"].max()

        for trade in self.data["trades"]:

            if trade["status"] != "HOLD":
                continue

            stock = trade["stock_id"]

            df = market_df[market_df["stock_id"] == stock]

            df = df[df["Ngay"] >= trade["entry_date"]]

            for _, row in df.iterrows():

                high = row["high"]
                low = row["low"]
                date = str(row["Ngay"])

                if high >= trade["tp_price"]:

                    trade["status"] = "TP"
                    trade["exit_price"] = trade["tp_price"]
                    trade["exit_date"] = date
                    break

                if low <= trade["sl_price"]:

                    trade["status"] = "SL"
                    trade["exit_price"] = trade["sl_price"]
                    trade["exit_date"] = date
                    break

            if trade["status"] == "HOLD":

                entry_date = datetime.strptime(trade["entry_date"], "%Y-%m-%d")
                today_dt = datetime.strptime(str(today), "%Y-%m-%d")

                holding = (today_dt - entry_date).days

                if holding >= 20:

                    trade["status"] = "TIMEOUT"
                    trade["exit_price"] = df.iloc[-1]["close"]
                    trade["exit_date"] = str(today)

        return


    # ==================================
    # ADD NEW SIGNALS
    # ==================================

    def add_new_signals(self, signals_df):

        if signals_df is None or len(signals_df) == 0:
            return

        holding = {
            t["stock_id"]
            for t in self.data["trades"]
            if t["status"] == "HOLD"
        }

        for _, row in signals_df.iterrows():

            stock = row["stock_id"]

            if stock in holding:
                continue

            trade = {

                "stock_id": stock,
                "entry_date": str(row["Ngay"]),
                "entry_price": float(row["entry_price"]),
                "tp_price": float(row["tp_price"]),
                "sl_price": float(row["sl_price"]),

                "exit_date": None,
                "exit_price": None,

                "status": "HOLD",

                "return_pct": None,
                "holding_days": None
            }

            self.data["trades"].append(trade)


    # ==================================
    # FINALIZE TRADES
    # ==================================

    def finalize(self):

        for trade in self.data["trades"]:

            if trade["status"] == "HOLD":
                continue

            if trade["return_pct"] is not None:
                continue

            entry = trade["entry_price"]
            exit_p = trade["exit_price"]

            trade["return_pct"] = (exit_p - entry) / entry

            entry_date = datetime.strptime(trade["entry_date"], "%Y-%m-%d")
            exit_date = datetime.strptime(trade["exit_date"], "%Y-%m-%d")

            trade["holding_days"] = (exit_date - entry_date).days


    # ==================================
    # SAVE JSON
    # ==================================

    def save(self):

        self.data["last_update"] = datetime.today().strftime("%Y-%m-%d")

        with open(self.path, "w") as f:

            json.dump(self.data, f, indent=4)