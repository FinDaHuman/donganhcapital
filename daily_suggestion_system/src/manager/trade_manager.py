import logging
import numpy as np
import pandas as pd
from datetime import datetime
from sqlalchemy import text


logger = logging.getLogger(__name__)


def _to_native(val):
    """Convert numpy/pandas scalars to native Python types for DB safety."""
    if val is None:
        return None
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, np.bool_):
        return bool(val)
    if isinstance(val, (np.str_,)):
        return str(val)
    return val


MIN_HOLD_DAYS = 2


class TradeManager:

    def __init__(self, engine=None, table="trade_history", timeout_days=30):
        """
        Args:
            engine: SQLAlchemy engine for DB operations.
            table: trade-history table to read/write (per-model tables,
                   e.g. "bcd_trade_history"). Defaults preserve AI behavior.
            timeout_days: calendar days before an open HOLD becomes TIMEOUT.
        """
        self.engine = engine
        self.table = table
        self.timeout_days = timeout_days

        if engine:
            self._load_from_db()
        else:
            logger.warning("No DB engine provided — starting with empty state")
            self.data = {"last_update": None, "trades": []}


    def _load_from_db(self):
        """Load trade history from the configured NeonDB table."""
        try:
            query = f"""
            SELECT stock_id, entry_date, entry_price, tp_price, sl_price,
                   exit_date, exit_price, status, return_pct, holding_days
            FROM {self.table}
            ORDER BY entry_date ASC
            """
            df = pd.read_sql(query, self.engine)

            trades = []
            for _, row in df.iterrows():
                trade = {
                    "stock_id": row["stock_id"],
                    "entry_date": str(row["entry_date"]).split(" ")[0],
                    "entry_price": float(row["entry_price"]) if pd.notnull(row["entry_price"]) else None,
                    "tp_price": float(row["tp_price"]) if pd.notnull(row["tp_price"]) else None,
                    "sl_price": float(row["sl_price"]) if pd.notnull(row["sl_price"]) else None,
                    "exit_date": str(row["exit_date"]).split(" ")[0] if pd.notnull(row["exit_date"]) else None,
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

            entry_dt = datetime.strptime(trade["entry_date"], "%Y-%m-%d")

            for _, row in df.iterrows():

                high = row["high"]
                low = row["low"]
                date = str(row["Ngay"]).split(" ")[0]
                date_dt = datetime.strptime(date, "%Y-%m-%d")
                days_held = (date_dt - entry_dt).days

                if high >= trade["tp_price"]:

                    trade["status"] = "TP"
                    trade["exit_price"] = trade["tp_price"]
                    trade["exit_date"] = date
                    break

                if low <= trade["sl_price"] and days_held >= MIN_HOLD_DAYS:

                    trade["status"] = "SL"
                    trade["exit_price"] = trade["sl_price"]
                    trade["exit_date"] = date
                    break

            if trade["status"] == "HOLD":

                today_dt = datetime.strptime(str(today).split(" ")[0], "%Y-%m-%d")

                holding = (today_dt - entry_dt).days

                if holding >= self.timeout_days:

                    trade["status"] = "TIMEOUT"
                    trade["exit_date"] = str(today).split(" ")[0]
                    if not df.empty and len(df) > 0:
                        trade["exit_price"] = _to_native(df.iloc[-1]["close"])
                    else:
                        trade["exit_price"] = _to_native(trade.get("entry_price"))

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
                "entry_date": str(row["Ngay"]).split(" ")[0],
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

            trade["return_pct"] = _to_native((exit_p - entry) / entry)

            entry_date = datetime.strptime(trade["entry_date"], "%Y-%m-%d")
            exit_date = datetime.strptime(trade["exit_date"], "%Y-%m-%d")

            trade["holding_days"] = int((exit_date - entry_date).days)


    # ==================================
    # SAVE TO NEONDB
    # ==================================

    def save_to_db(self):
        """Upsert all trades into the configured NeonDB table using batch INSERT."""
        if not self.engine:
            logger.warning("No DB engine available for saving trade history.")
            return

        if not self.data.get("trades"):
            logger.info("No trades to sync.")
            return

        # Build batch parameter list (avoids N+1 individual queries)
        params_list = []
        for trade in self.data["trades"]:
            entry_date = trade["entry_date"].split(" ")[0] if trade.get("entry_date") else None
            exit_date = trade["exit_date"].split(" ")[0] if trade.get("exit_date") else None
            params_list.append({
                "stock_id": str(trade["stock_id"]),
                "entry_date": entry_date,
                "entry_price": _to_native(trade.get("entry_price")),
                "tp_price": _to_native(trade.get("tp_price")),
                "sl_price": _to_native(trade.get("sl_price")),
                "exit_date": exit_date,
                "exit_price": _to_native(trade.get("exit_price")),
                "status": str(trade["status"]),
                "return_pct": _to_native(trade.get("return_pct")),
                "holding_days": _to_native(trade.get("holding_days")),
            })

        query = text(f"""
        INSERT INTO {self.table}
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

        try:
            with self.engine.begin() as conn:
                conn.execute(query, params_list)
            logger.info(f"{len(params_list)} trades synced to NeonDB (batch upsert)")
        except Exception as e:
            logger.error(f"Error saving trades to DB: {e}")