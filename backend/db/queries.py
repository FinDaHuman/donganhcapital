import math
import re
import numpy as np
import pandas as pd
from sqlalchemy import text
from .connection import get_engine

VALID_STOCK_ID_PATTERN = re.compile(r'^[A-Z0-9]{1,10}$')
VALID_STATUS_VALUES = {'TP', 'SL', 'TIMEOUT', 'HOLD'}


def _live_quotes() -> dict:
    """Latest shared live-quote map (normalized to stock_ohlc scale), or {}.

    Lazily read from main so consumers stay decoupled and any import/absence
    fails soft — callers then transparently use daily-close values.
    """
    import sys
    mod = sys.modules.get("main")
    if mod is None:
        return {}
    try:
        return mod.get_live_quote_map()
    except Exception:
        return {}


def validate_stock_id(stock_id: str) -> str:
    if not stock_id:
        raise ValueError("stock_id is required")
    normalized = stock_id.upper().strip()
    if len(normalized) > 10:
        raise ValueError(f"stock_id too long: {len(normalized)} characters (max 10)")
    if not VALID_STOCK_ID_PATTERN.match(normalized):
        raise ValueError(f"Invalid stock_id format: {stock_id}")
    return normalized


def validate_status(status: str) -> str:
    if not status:
        return None
    normalized = status.upper().strip()
    if normalized not in VALID_STATUS_VALUES:
        raise ValueError(f"Invalid status value: {status}. Must be one of {VALID_STATUS_VALUES}")
    return normalized


def validate_limit(limit: int, max_limit: int = 2000) -> int:
    if limit is None:
        return max_limit
    if limit < 1:
        raise ValueError("limit must be positive")
    if limit > max_limit:
        raise ValueError(f"limit exceeds maximum of {max_limit}")
    return limit


def _safe_float(x):
    """Convert to float, returning None for NaN/inf/-inf/NaT/None."""
    if x is None or (isinstance(x, float) and not math.isfinite(x)):
        return None
    try:
        if pd.isna(x):
            return None
    except (ValueError, TypeError):
        pass
    try:
        val = float(x)
        return val if math.isfinite(val) else None
    except (ValueError, TypeError):
        return None


def _safe_round(x, decimals=2):
    """Round a value safely, returning None for NaN/inf/-inf."""
    val = _safe_float(x)
    return round(val, decimals) if val is not None else None


def _sanitize_records(records):
    """Convert all non-JSON-serializable values (numpy types, NaN, NaT, inf) to None or native Python types."""
    clean = []
    for row in records:
        clean_row = {}
        for key, val in row.items():
            # Handle None
            if val is None:
                clean_row[key] = None
            # Handle pandas NaT and numpy NaN
            elif pd.isna(val):
                clean_row[key] = None
            # Handle numpy integer types
            elif isinstance(val, (np.integer,)):
                clean_row[key] = int(val)
            # Handle numpy float types and Python floats
            elif isinstance(val, (np.floating, float)):
                clean_row[key] = float(val) if math.isfinite(float(val)) else None
            # Handle numpy bool
            elif isinstance(val, (np.bool_,)):
                clean_row[key] = bool(val)
            else:
                clean_row[key] = val
        clean.append(clean_row)
    return clean


def get_stocks_from_db():
    engine = get_engine()
    if not engine:
        return []
    query = "SELECT DISTINCT stock_id FROM stocks"
    try:
        df = pd.read_sql(query, engine)
        stocks_list = df['stock_id'].tolist()
        if "VN30F1M" not in stocks_list:
            stocks_list.append("VN30F1M")
        return stocks_list
    except Exception as e:
        print(f"Error fetching stocks from DB: {e}")
        return []

def get_stock_ohlc(stock_id: str, limit: int = None):
    try:
        stock_id = validate_stock_id(stock_id)
    except ValueError as e:
        print(f"Invalid stock_id: {e}")
        return pd.DataFrame()
    
    limit = validate_limit(limit, max_limit=2000)
    
    engine = get_engine()
    if not engine:
        return pd.DataFrame()
    
    if stock_id == "VN30F1M":
        query = text("""
        SELECT * FROM (
            SELECT time as "Date", open as "Open", high as "High", low as "Low", close as "Close", volume as "Volume", 'VN30F1M' as "Ticker" 
            FROM vn30f1m_intraday
            ORDER BY time DESC 
            LIMIT :limit
        ) sub ORDER BY "Date" ASC
        """)
        params = {"limit": limit}
    else:
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
        WHERE "Ngay" >= CURRENT_DATE - INTERVAL '15 days'
    )
    SELECT stock_id, close, volume, rn
    FROM RankedRows
    WHERE rn <= 2
    """
    try:
        df = pd.read_sql(query, engine)

        # Fresh intraday quotes override the day-over-day close/change when
        # available; empty map (off-hours / provider down) → daily-close values.
        quotes = _live_quotes()

        results = []
        stocks = df['stock_id'].unique()
        for stock in stocks:
            stock_data = df[df['stock_id'] == stock].sort_values('rn')
            # rn=1 is the last day, rn=2 is the previous day
            if len(stock_data) == 2:
                last_row = stock_data[stock_data['rn'] == 1].iloc[0]
                prev_row = stock_data[stock_data['rn'] == 2].iloc[0]

                change = (last_row['close'] - prev_row['close']) / prev_row['close'] * 100
                price = float(last_row['close'])
                volume = int(last_row['volume'])

                q = quotes.get(str(stock).upper()) if quotes else None
                if q and q.get('price'):
                    price = float(q['price'])
                    if q.get('change_pct') is not None:
                        change = float(q['change_pct'])
                    if q.get('volume'):
                        volume = int(q['volume'])

                results.append({
                    "ticker": stock,
                    "value": float(change),
                    "size": volume,
                    "price": price,
                    "trading_value": float(price * volume)
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
        # convert numeric types to float and round prices
        for col in ['entry_price', 'tp_price', 'sl_price']:
            if col in df.columns:
                df[col] = df[col].apply(lambda x: _safe_round(x, 2))
        if 'prob' in df.columns:
            df['prob'] = df['prob'].apply(lambda x: _safe_round(x, 4))
            
        signals = df.to_dict(orient="records")

        # Additive live overlay: current price vs signal levels. All fields are
        # optional — absent when no fresh quote (off-hours / provider down), so
        # existing clients that ignore them are unaffected.
        quotes = _live_quotes()
        if quotes:
            for s in signals:
                q = quotes.get(str(s.get('stock_id', '')).upper())
                if not (q and q.get('price')):
                    continue
                lp = q['price']
                s['live_price'] = lp
                s['live_change_pct'] = q.get('change_pct')
                ep = _safe_float(s.get('entry_price'))
                tp = _safe_float(s.get('tp_price'))
                sl = _safe_float(s.get('sl_price'))
                # + means price is above entry / TP still ahead / cushion above SL
                s['distance_to_entry_pct'] = _safe_round((lp - ep) / ep * 100, 2) if ep else None
                s['distance_to_tp_pct'] = _safe_round((tp - lp) / lp * 100, 2) if tp else None
                s['distance_to_sl_pct'] = _safe_round((lp - sl) / lp * 100, 2) if sl else None

        return {"date": date_str, "signal_count": len(signals), "signals": _sanitize_records(signals)}
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
    status_filter = validate_status(status_filter)
    engine = get_engine()
    if not engine:
        return []

    live_price_subquery = """
        CASE WHEN t.status = 'HOLD' THEN (
            SELECT s.close FROM stock_ohlc s
            WHERE s.stock_id = t.stock_id
            ORDER BY s."Ngay" DESC LIMIT 1
        ) END
    """
    if status_filter:
        query = text(f"""
        SELECT t.stock_id, t.entry_date, t.entry_price, t.tp_price, t.sl_price,
               t.exit_date, t.exit_price, t.status, t.return_pct, t.holding_days,
               a.prob,
               {live_price_subquery} AS live_price
        FROM trade_history t
        LEFT JOIN ai_signals a ON t.stock_id = a.stock_id AND t.entry_date = a.date
        WHERE t.status = :status
        ORDER BY t.entry_date DESC
        """)
        params = {"status": status_filter}
    else:
        query = text(f"""
        SELECT t.stock_id, t.entry_date, t.entry_price, t.tp_price, t.sl_price,
               t.exit_date, t.exit_price, t.status, t.return_pct, t.holding_days,
               a.prob,
               {live_price_subquery} AS live_price
        FROM trade_history t
        LEFT JOIN ai_signals a ON t.stock_id = a.stock_id AND t.entry_date = a.date
        ORDER BY t.entry_date DESC
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
        # Convert numerics safely (handles NaN, inf, -inf)
        for col in ['entry_price', 'tp_price', 'sl_price', 'exit_price']:
            if col in df.columns:
                df[col] = df[col].apply(lambda x: _safe_round(x, 2))
        if 'return_pct' in df.columns:
            df['return_pct'] = df['return_pct'].apply(lambda x: _safe_round(x, 6))
        if 'prob' in df.columns:
            df['prob'] = df['prob'].apply(lambda x: _safe_round(x, 4))
        if 'holding_days' in df.columns:
            df['holding_days'] = df['holding_days'].apply(lambda x: int(x) if pd.notnull(x) and _safe_float(x) is not None else None)

        # Prefer a fresh intraday quote over the daily close (fallback) for open
        # positions. The map is normalized to the stock_ohlc scale; when empty
        # (off-hours / provider down) live_price stays the daily-close value.
        if 'live_price' in df.columns:
            quotes = _live_quotes()
            if quotes:
                for i in df.index[df['status'] == 'HOLD']:
                    q = quotes.get(str(df.at[i, 'stock_id']).upper())
                    if q and q.get('price'):
                        df.at[i, 'live_price'] = q['price']

        # Compute live_return_pct for HOLD trades from the fetched live_price
        df['live_return_pct'] = None
        if 'live_price' in df.columns:
            hold_mask = (df['status'] == 'HOLD') & df['live_price'].notna() & df['entry_price'].notna()
            if hold_mask.any():
                ep = df.loc[hold_mask, 'entry_price'].apply(_safe_float)
                lp = df.loc[hold_mask, 'live_price'].apply(_safe_float)
                df.loc[hold_mask, 'live_return_pct'] = ((lp - ep) / ep).apply(lambda x: _safe_round(x, 6))
            df = df.drop(columns=['live_price'])

        # Replace any remaining NaN/inf with None
        df = df.where(df.notnull(), None)

        records = df.to_dict(orient="records")
        return _sanitize_records(records)
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

        # Win rate: TP always wins; TIMEOUT wins if return_pct > 0
        win_count = len(df[
            (df['status'] == 'TP') |
            ((df['status'] == 'TIMEOUT') & (df['return_pct'] > 0))
        ])
        win_rate = (win_count / len(closed) * 100) if len(closed) > 0 else 0

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


def insert_subscriber(email: str) -> bool:
    """Insert a subscriber email using parameterized query.
    
    Uses ON CONFLICT DO NOTHING to silently handle duplicates.
    Returns True on success, False on failure. Never reveals
    whether the email already existed (security: anti-enumeration).
    """
    engine = get_engine()
    if not engine:
        return False

    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO subscribers (email, source) "
                    "VALUES (:email, 'website') "
                    "ON CONFLICT (email) DO NOTHING"
                ),
                {"email": email},
            )
        return True
    except Exception as e:
        print(f"Error inserting subscriber: {e}")
        return False


def get_subscriber_count() -> int:
    """Return total subscriber count (for internal admin use)."""
    engine = get_engine()
    if not engine:
        return 0

    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM subscribers"))
            return result.scalar() or 0
    except Exception as e:
        print(f"Error counting subscribers: {e}")
        return 0


# ── LTR signals ──────────────────────────────────────────────────────────────

def get_ltr_signals_dates() -> list:
    """Return distinct dates that have LTR signals, newest first."""
    engine = get_engine()
    if not engine:
        return []
    try:
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT DISTINCT date FROM ltr_signals ORDER BY date DESC")
            )
            return [row[0].isoformat() for row in result if row[0] is not None]
    except Exception as e:
        print(f"Error fetching ltr_signals dates: {e}")
        return []


def get_ltr_signals(date_str: str = None, latest: bool = False) -> dict:
    """Return LTR ranked signals for a given date."""
    engine = get_engine()
    if not engine:
        return {"date": None, "signal_count": 0, "signals": []}

    if latest:
        dates = get_ltr_signals_dates()
        if not dates:
            return {"date": None, "signal_count": 0, "signals": []}
        date_str = dates[0]

    if not date_str:
        return {"date": None, "signal_count": 0, "signals": []}

    query = text("""
        SELECT date, stock_id, rank, score
        FROM ltr_signals
        WHERE date = :date_str
        ORDER BY rank ASC
    """)
    try:
        df = pd.read_sql(query, engine, params={"date_str": date_str})
        if df.empty:
            return {"date": date_str, "signal_count": 0, "signals": []}
        df["date"] = df["date"].apply(lambda x: x.isoformat() if pd.notnull(x) else None)
        signals = df.to_dict(orient="records")
        return {"date": date_str, "signal_count": len(signals), "signals": _sanitize_records(signals)}
    except Exception as e:
        print(f"Error fetching ltr_signals: {e}")
        return {"date": date_str, "signal_count": 0, "signals": []}
