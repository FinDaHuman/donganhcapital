import logging
import pandas as pd
from datetime import datetime
from sqlalchemy import text


logger = logging.getLogger(__name__)


class TradeManager:

    def __init__(self, engine=None):
        """
        Args:
            engine: SQLAlchemy engine for DB operations.
        """
        self.engine = engine

        if engine:
            self._load_from_db()
        else:
            logger.warning("No DB engine provided — starting with empty state")
            self.data = {"last_update": None, "trades": []}


    def _load_from_db(self):
        """Load trade history from NeonDB trade_history table."""
        try:
            query = """
            SELECT stock_id, entry_date, entry_price, tp_price, sl_price,
                   exit_date, exit_price, status, return_pct, holding_days
            FROM trade_history
            ORDER BY entry_date ASC
            """
            df = pd.read_sql(query, self.engine)

            trades = []
            for _, row in df.iterrows():
                trade = {
                    "stock_id": row["stock_id"],
                    "entry_date": str(row["entry_date"]),
                    "entry_price": float(row["entry_price"]) if pd.notnull(row["entry_price"]) else None,
                    "tp_price": float(row["tp_price"]) if pd.notnull(row["tp_price"]) else None,
                    "sl_price": float(row["sl_price"]) if pd.notnull(row["sl_price"]) else None,
                    "exit_date": str(row["exit_date"]) if pd.notnull(row["exit_date"]) else None,
                    "exit_price": float(row["exit_price"]) if pd.notnull(row["exit_price"]) else None,
                    "status": row["status"],
                    "return_pct": float(row["return_pct"]) if pd.notnull(row["return_pct"]) else None,
                    "holding_days": int(row["holding_days"]) if pd.notnull(row["holding_days"]) else None,
                }
                trades.append(trade)

            self.data = {
                "last_update": datetime.today().strftime("%Y-%m-%d"),
                "trades": trades
            }
            logger.info(f"Loaded {len(trades)} trades from DB")
        except Exception as e:
            logger.error(f"Error loading trades from DB: {e}")
            self.data = {"last_update": None, "trades": []}


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

                if holding >= 30:

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
    # SAVE TO NEONDB
    # ==================================

    def save_to_db(self):
        """Upsert all trades into NeonDB trade_history table."""
        if not self.engine:
            logger.warning("No DB engine available for saving trade history.")
            return

        try:
            with self.engine.begin() as conn:
                for trade in self.data["trades"]:
                    entry_date = trade["entry_date"].split(" ")[0] if trade.get("entry_date") else None
                    exit_date = trade["exit_date"].split(" ")[0] if trade.get("exit_date") else None

                    query = text("""
                    INSERT INTO trade_history 
                        (stock_id, entry_date, entry_price, tp_price, sl_price,
                         exit_date, exit_price, status, return_pct, holding_days)
                    VALUES 
                        (:stock_id, :entry_date, :entry_price, :tp_price, :sl_price,
                         :exit_date, :exit_price, :status, :return_pct, :holding_days)
                    ON CONFLICT (stock_id, entry_date) 
                    DO UPDATE SET
                        exit_date = EXCLUDED.exit_date,
                        exit_price = EXCLUDED.exit_price,
                        status = EXCLUDED.status,
                        return_pct = EXCLUDED.return_pct,
                        holding_days = EXCLUDED.holding_days;
                    """)

                    conn.execute(query, {
                        "stock_id": trade["stock_id"],
                        "entry_date": entry_date,
                        "entry_price": trade.get("entry_price"),
                        "tp_price": trade.get("tp_price"),
                        "sl_price": trade.get("sl_price"),
                        "exit_date": exit_date,
                        "exit_price": trade.get("exit_price"),
                        "status": trade["status"],
                        "return_pct": trade.get("return_pct"),
                        "holding_days": trade.get("holding_days"),
                    })

            logger.info(f"{len(self.data['trades'])} trades synced to NeonDB")
        except Exception as e:
            logger.error(f"Error saving trades to DB: {e}")