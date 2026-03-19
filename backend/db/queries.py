import pandas as pd
from sqlalchemy import text
from .connection import get_engine

def get_stocks_from_db():
    engine = get_engine()
    if not engine:
        return []
    query = "SELECT DISTINCT stock_id FROM stocks"
    try:
        df = pd.read_sql(query, engine)
        return df['stock_id'].tolist()
    except Exception as e:
        print(f"Error fetching stocks from DB: {e}")
        return []

def get_stock_ohlc(stock_id: str, limit: int = None):
    engine = get_engine()
    if not engine:
        return pd.DataFrame()
    
    if limit:
        query = text("""
        SELECT * FROM (
            SELECT "Ngay" as "Date", open as "Open", high as "High", low as "Low", close as "Close", volume as "Volume", stock_id as "Ticker" 
            FROM stock_ohlc 
            WHERE stock_id = :stock_id 
            ORDER BY "Ngay" DESC 
            LIMIT :limit
        ) sub ORDER BY "Date" ASC
        """)
        params = {"stock_id": stock_id, "limit": limit}
    else:
        query = text("""
        SELECT "Ngay" as "Date", open as "Open", high as "High", low as "Low", close as "Close", volume as "Volume", stock_id as "Ticker" 
        FROM stock_ohlc 
        WHERE stock_id = :stock_id 
        ORDER BY "Ngay" ASC
        """)
        params = {"stock_id": stock_id}
        
    try:
        df = pd.read_sql(query, engine, params=params)
        df['Date'] = pd.to_datetime(df['Date'])
        return df
    except Exception as e:
        print(f"Error fetching OHLC: {e}")
        return pd.DataFrame()

def get_all_stock_ohlc(limit_per_stock: int = None):
    """Fetch all history for all stocks at once to avoid connection limits in training"""
    engine = get_engine()
    if not engine:
        return pd.DataFrame()
    
    if limit_per_stock:
        query = text("""
        WITH RankedRows AS (
            SELECT "Ngay" as "Date", open as "Open", high as "High", low as "Low", close as "Close", volume as "Volume", stock_id as "Ticker",
                   ROW_NUMBER() OVER(PARTITION BY stock_id ORDER BY "Ngay" DESC) as rn
            FROM stock_ohlc
        )
        SELECT * FROM RankedRows WHERE rn <= :limit ORDER BY "Ticker", "Date" ASC
        """)
        params = {"limit": limit_per_stock}
    else:
        query = "SELECT \"Ngay\" as \"Date\", open as \"Open\", high as \"High\", low as \"Low\", close as \"Close\", volume as \"Volume\", stock_id as \"Ticker\" FROM stock_ohlc ORDER BY \"Ticker\", \"Date\" ASC"
        params = None
        
    try:
        if params:
            df = pd.read_sql(query, engine, params=params)
            df = df.drop(columns=['rn'])
        else:
            df = pd.read_sql(query, engine)
        df['Date'] = pd.to_datetime(df['Date'])
        return df
    except Exception as e:
        print(f"Error fetching all OHLC: {e}")
        return pd.DataFrame()

def get_market_status_from_db():
    engine = get_engine()
    if not engine:
        return []
    
    query = """
    WITH RankedRows AS (
        SELECT stock_id, close, volume, "Ngay",
               ROW_NUMBER() OVER (PARTITION BY stock_id ORDER BY "Ngay" DESC) as rn
        FROM stock_ohlc
    )
    SELECT stock_id, close, volume, rn
    FROM RankedRows
    WHERE rn <= 2
    """
    try:
        df = pd.read_sql(query, engine)
        
        results = []
        stocks = df['stock_id'].unique()
        for stock in stocks:
            stock_data = df[df['stock_id'] == stock].sort_values('rn')
            # rn=1 is the last day, rn=2 is the previous day
            if len(stock_data) == 2:
                last_row = stock_data[stock_data['rn'] == 1].iloc[0]
                prev_row = stock_data[stock_data['rn'] == 2].iloc[0]
                
                change = (last_row['close'] - prev_row['close']) / prev_row['close'] * 100
                results.append({
                    "ticker": stock,
                    "value": float(change),
                    "size": int(last_row['volume'])
                })
        return results
    except Exception as e:
        print(f"Error fetching market status from DB: {e}")
        return []

def get_vnindex_from_db(limit: int = None):
    engine = get_engine()
    if not engine:
        return pd.DataFrame()
    
    if limit:
        query = text("""
        SELECT * FROM (
            SELECT "Ngay" as "Date", index_open as "Open", index_high as "High", index_low as "Low", index_close as "Close", index_volume as "Volume"
            FROM vnindex_ohlc
            ORDER BY "Ngay" DESC
            LIMIT :limit
        ) sub ORDER BY "Date" ASC
        """)
        params = {"limit": limit}
    else:
        query = text("""
        SELECT "Ngay" as "Date", index_open as "Open", index_high as "High", index_low as "Low", index_close as "Close", index_volume as "Volume"
        FROM vnindex_ohlc
        ORDER BY "Ngay" ASC
        """)
        params = None
        
    try:
        df = pd.read_sql(query, engine, params=params)
        if not df.empty:
            df['Date'] = pd.to_datetime(df['Date'])
        return df
    except Exception as e:
        print(f"Error fetching VNINDEX: {e}")
        return pd.DataFrame()

def get_ai_signals_dates():
    engine = get_engine()
    if not engine:
        return []
    query = 'SELECT DISTINCT "date" FROM ai_signals ORDER BY "date" DESC'
    try:
        df = pd.read_sql(query, engine)
        if df.empty:
            return []
        
        # format date to string YYYY-MM-DD
        dates = df['date'].apply(lambda x: x.isoformat() if pd.notnull(x) else None).tolist()
        return dates
    except Exception as e:
        print(f"Error fetching ai_signals dates: {e}")
        return []

def get_ai_signals(date_str: str = None, latest: bool = False):
    engine = get_engine()
    if not engine:
        return {"date": None, "signal_count": 0, "signals": []}
    
    if latest:
        dates = get_ai_signals_dates()
        if not dates:
            return {"date": None, "signal_count": 0, "signals": []}
        date_str = dates[0]
        
    if not date_str:
        return {"date": None, "signal_count": 0, "signals": []}
        
    query = text("""
    SELECT date as "Ngay", stock_id, entry_price, tp_price, sl_price, prob
    FROM ai_signals
    WHERE date = :date_str
    ORDER BY prob DESC
    """)
    try:
        df = pd.read_sql(query, engine, params={"date_str": date_str})
        if df.empty:
            return {"date": date_str, "signal_count": 0, "signals": []}
            
        df['Ngay'] = df['Ngay'].apply(lambda x: x.isoformat() if pd.notnull(x) else None)
        # convert numeric types to float
        if 'entry_price' in df.columns:
            df['entry_price'] = df['entry_price'].astype(float)
        if 'tp_price' in df.columns:
            df['tp_price'] = df['tp_price'].astype(float)
        if 'sl_price' in df.columns:
            df['sl_price'] = df['sl_price'].astype(float)
        if 'prob' in df.columns:
            df['prob'] = df['prob'].astype(float)
            
        signals = df.to_dict(orient="records")
        return {"date": date_str, "signal_count": len(signals), "signals": signals}
    except Exception as e:
        print(f"Error fetching ai_signals: {e}")
        return {"date": date_str, "signal_count": 0, "signals": []}


def get_daily_signal_summary():
    """Return list of {date, signal_count} from daily_signal_summary."""
    engine = get_engine()
    if not engine:
        return []
    query = 'SELECT date, signal_count FROM daily_signal_summary ORDER BY date DESC'
    try:
        df = pd.read_sql(query, engine)
        if df.empty:
            return []
        df['date'] = df['date'].apply(lambda x: x.isoformat() if pd.notnull(x) else None)
        return df.to_dict(orient="records")
    except Exception as e:
        print(f"Error fetching daily_signal_summary: {e}")
        return []


def get_trade_history(status_filter: str = None):
    """Return trade history records, optionally filtered by status."""
    engine = get_engine()
    if not engine:
        return []

    if status_filter:
        query = text("""
        SELECT stock_id, entry_date, entry_price, tp_price, sl_price,
               exit_date, exit_price, status, return_pct, holding_days
        FROM trade_history
        WHERE status = :status
        ORDER BY entry_date DESC
        """)
        params = {"status": status_filter.upper()}
    else:
        query = text("""
        SELECT stock_id, entry_date, entry_price, tp_price, sl_price,
               exit_date, exit_price, status, return_pct, holding_days
        FROM trade_history
        ORDER BY entry_date DESC
        """)
        params = None

    try:
        df = pd.read_sql(query, engine, params=params)
        if df.empty:
            return []

        # Format dates
        for col in ['entry_date', 'exit_date']:
            if col in df.columns:
                df[col] = df[col].apply(lambda x: x.isoformat() if pd.notnull(x) else None)
        # Convert numerics to float
        for col in ['entry_price', 'tp_price', 'sl_price', 'exit_price', 'return_pct']:
            if col in df.columns:
                df[col] = df[col].apply(lambda x: float(x) if pd.notnull(x) else None)
        if 'holding_days' in df.columns:
            df['holding_days'] = df['holding_days'].apply(lambda x: int(x) if pd.notnull(x) else None)

        return df.to_dict(orient="records")
    except Exception as e:
        print(f"Error fetching trade_history: {e}")
        return []


def get_trade_history_stats():
    """Return portfolio stats computed from trade_history."""
    engine = get_engine()
    if not engine:
        return {}

    query = """
    SELECT stock_id, status, return_pct, holding_days
    FROM trade_history
    """
    try:
        df = pd.read_sql(query, engine)
        if df.empty:
            return {"total_trades": 0}

        total = len(df)
        closed = df[df['status'].isin(['TP', 'SL', 'TIMEOUT'])]
        tp_count = len(df[df['status'] == 'TP'])
        sl_count = len(df[df['status'] == 'SL'])
        timeout_count = len(df[df['status'] == 'TIMEOUT'])
        hold_count = len(df[df['status'] == 'HOLD'])

        # Win rate (TP / closed trades)
        win_rate = (tp_count / len(closed) * 100) if len(closed) > 0 else 0

        # Avg return on closed trades
        closed_returns = closed['return_pct'].dropna()
        avg_return = float(closed_returns.mean() * 100) if len(closed_returns) > 0 else 0

        # Best and worst trade
        best_return = float(closed_returns.max() * 100) if len(closed_returns) > 0 else 0
        worst_return = float(closed_returns.min() * 100) if len(closed_returns) > 0 else 0

        # Avg holding days for closed trades
        closed_days = closed['holding_days'].dropna()
        avg_holding = float(closed_days.mean()) if len(closed_days) > 0 else 0

        return {
            "total_trades": total,
            "tp_count": tp_count,
            "sl_count": sl_count,
            "timeout_count": timeout_count,
            "hold_count": hold_count,
            "win_rate": round(win_rate, 1),
            "avg_return": round(avg_return, 2),
            "best_return": round(best_return, 2),
            "worst_return": round(worst_return, 2),
            "avg_holding_days": round(avg_holding, 1),
        }
    except Exception as e:
        print(f"Error fetching trade_history stats: {e}")
        return {"total_trades": 0}
