from __future__ import annotations

import math
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy import text

from .connection import get_engine


def _safe_float(value):
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _safe_round(value, decimals=2):
    num = _safe_float(value)
    return round(num, decimals) if num is not None else None


def _to_native(value):
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return float(value) if math.isfinite(float(value)) else None
    if isinstance(value, (np.bool_,)):
        return bool(value)
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def _json_safe(value):
    if isinstance(value, dict):
        return {key: _json_safe(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        as_float = float(value)
        return as_float if math.isfinite(as_float) else None
    if isinstance(value, (np.bool_,)):
        return bool(value)
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def _records(df: pd.DataFrame, round_map: Optional[dict[str, int]] = None):
    if df is None or df.empty:
        return []
    clean = df.copy()
    for column, decimals in (round_map or {}).items():
        if column in clean.columns:
            clean[column] = clean[column].apply(lambda x: _safe_round(x, decimals))
    for column in clean.columns:
        if pd.api.types.is_datetime64_any_dtype(clean[column]):
            clean[column] = clean[column].apply(lambda x: x.isoformat() if pd.notnull(x) else None)
        else:
            clean[column] = clean[column].apply(_to_native)
    return clean.to_dict(orient="records")


def _normalize_status(value: Optional[str]):
    if not value or value == "ALL":
        return None
    return value.upper()


def _load_sector_lookup():
    root = Path(__file__).resolve().parents[2]
    lookup = {}
    for path in [root / "config" / "categories.txt", root / "daily_suggestion_system" / "categories.txt"]:
        if not path.exists():
            continue
        with open(path, "r", encoding="utf-8") as handle:
            for line in handle.readlines()[2:]:
                raw = line.strip()
                if not raw or ":" not in raw:
                    continue
                sector, tickers_raw = raw.split(":", 1)
                for ticker in [item.strip() for item in tickers_raw.split(",") if item.strip()]:
                    lookup[ticker] = sector.strip()
        if lookup:
            break
    return lookup


SECTOR_LOOKUP = _load_sector_lookup()


def _apply_sector(df: pd.DataFrame, ticker_col: str = "stock_id"):
    if df is None or df.empty or ticker_col not in df.columns:
        return df
    enriched = df.copy()
    enriched["sector"] = enriched[ticker_col].map(SECTOR_LOOKUP).fillna("Unmapped")
    return enriched


def _apply_common_filters(df: pd.DataFrame, date_col: str, start_date=None, end_date=None, sector=None, ticker=None):
    if df is None or df.empty:
        return df
    filtered = df.copy()
    if start_date:
        filtered = filtered[filtered[date_col] >= pd.to_datetime(start_date)]
    if end_date:
        filtered = filtered[filtered[date_col] <= pd.to_datetime(end_date)]
    if ticker and ticker != "ALL":
        filtered = filtered[filtered["stock_id"] == ticker.upper()]
    if sector and sector != "ALL":
        filtered = filtered[filtered["sector"] == sector]
    return filtered


def _read_sql(query: str, params: Optional[dict] = None):
    engine = get_engine()
    if not engine:
        return pd.DataFrame()
    try:
        return pd.read_sql(text(query), engine, params=params or {})
    except Exception as exc:
        print(f"Analytics query failed: {exc}")
        return pd.DataFrame()


def _load_stock_frame(start_date: Optional[str] = None, end_date: Optional[str] = None):
    params = {}
    clauses = []
    if start_date:
        clauses.append('"Ngay" >= :start_date')
        params["start_date"] = start_date
    if end_date:
        clauses.append('"Ngay" <= :end_date')
        params["end_date"] = end_date
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    df = _read_sql(
        f"""
        SELECT stock_id, "Ngay" as trade_date, open, high, low, close, volume
        FROM stock_ohlc
        {where_sql}
        ORDER BY "Ngay" ASC, stock_id ASC
        """,
        params,
    )
    if df.empty:
        return df
    df["trade_date"] = pd.to_datetime(df["trade_date"])
    return _apply_sector(df)


def _load_vnindex_frame(start_date: Optional[str] = None, end_date: Optional[str] = None):
    params = {}
    clauses = []
    if start_date:
        clauses.append('"Ngay" >= :start_date')
        params["start_date"] = start_date
    if end_date:
        clauses.append('"Ngay" <= :end_date')
        params["end_date"] = end_date
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    df = _read_sql(
        f"""
        SELECT "Ngay" as trade_date, index_open as open, index_high as high,
               index_low as low, index_close as close, index_volume as volume
        FROM vnindex_ohlc
        {where_sql}
        ORDER BY "Ngay" ASC
        """,
        params,
    )
    if df.empty:
        return df
    df["trade_date"] = pd.to_datetime(df["trade_date"])
    return df


def _load_signal_frame(start_date: Optional[str] = None, end_date: Optional[str] = None):
    params = {}
    clauses = []
    if start_date:
        clauses.append("date >= :start_date")
        params["start_date"] = start_date
    if end_date:
        clauses.append("date <= :end_date")
        params["end_date"] = end_date
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    df = _read_sql(
        f"""
        SELECT date as signal_date, stock_id, entry_price, tp_price, sl_price, prob
        FROM ai_signals
        {where_sql}
        ORDER BY date ASC, prob DESC
        """,
        params,
    )
    if df.empty:
        return df
    df["signal_date"] = pd.to_datetime(df["signal_date"])
    return _apply_sector(df)


def _load_signal_summary_frame(start_date: Optional[str] = None, end_date: Optional[str] = None):
    params = {}
    clauses = []
    if start_date:
        clauses.append("date >= :start_date")
        params["start_date"] = start_date
    if end_date:
        clauses.append("date <= :end_date")
        params["end_date"] = end_date
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    df = _read_sql(
        f"""
        SELECT date as signal_date, signal_count
        FROM daily_signal_summary
        {where_sql}
        ORDER BY date ASC
        """,
        params,
    )
    if df.empty:
        return df
    df["signal_date"] = pd.to_datetime(df["signal_date"])
    return df


def _load_trade_frame(start_date: Optional[str] = None, end_date: Optional[str] = None, status: Optional[str] = None):
    params = {}
    clauses = []
    if start_date:
        clauses.append("entry_date >= :start_date")
        params["start_date"] = start_date
    if end_date:
        clauses.append("entry_date <= :end_date")
        params["end_date"] = end_date
    normalized_status = _normalize_status(status)
    if normalized_status:
        clauses.append("t.status = :status")
        params["status"] = normalized_status
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    df = _read_sql(
        f"""
        SELECT t.stock_id, t.entry_date, t.entry_price, t.tp_price, t.sl_price,
               t.exit_date, t.exit_price, t.status, t.return_pct, t.holding_days,
               a.prob
        FROM trade_history t
        LEFT JOIN ai_signals a ON t.stock_id = a.stock_id AND t.entry_date = a.date
        {where_sql}
        ORDER BY t.entry_date ASC
        """,
        params,
    )
    if df.empty:
        return df
    df["entry_date"] = pd.to_datetime(df["entry_date"])
    if "exit_date" in df.columns:
        df["exit_date"] = pd.to_datetime(df["exit_date"])
    return _apply_sector(df)


def _prob_bucket(prob):
    val = _safe_float(prob)
    if val is None:
        return "Unknown"
    if val < 0.6:
        return "<60%"
    if val < 0.7:
        return "60-70%"
    if val < 0.8:
        return "70-80%"
    if val < 0.9:
        return "80-90%"
    return "90%+"


def _trade_kpis(trades_df: pd.DataFrame):
    if trades_df.empty:
        return {
            "total_trades": 0,
            "open_trades": 0,
            "closed_trades": 0,
            "win_rate": 0,
            "avg_return": 0,
            "median_return": 0,
            "best_trade": 0,
            "worst_trade": 0,
            "avg_holding_days": 0,
            "profit_factor": 0,
        }
    closed = trades_df[trades_df["status"].isin(["TP", "SL", "TIMEOUT"])].copy()
    returns = closed["return_pct"].dropna()
    wins = closed[closed["status"] == "TP"]
    losses = closed[closed["status"].isin(["SL", "TIMEOUT"])]
    gross_profit = wins["return_pct"].dropna().sum()
    gross_loss = abs(losses["return_pct"].dropna().sum())
    return {
        "total_trades": int(len(trades_df)),
        "open_trades": int((trades_df["status"] == "HOLD").sum()),
        "closed_trades": int(len(closed)),
        "win_rate": round((len(wins) / len(closed) * 100) if len(closed) else 0, 1),
        "avg_return": round((returns.mean() * 100) if not returns.empty else 0, 2),
        "median_return": round((returns.median() * 100) if not returns.empty else 0, 2),
        "best_trade": round((returns.max() * 100) if not returns.empty else 0, 2),
        "worst_trade": round((returns.min() * 100) if not returns.empty else 0, 2),
        "avg_holding_days": round(closed["holding_days"].dropna().mean() if not closed.empty else 0, 1),
        "profit_factor": round((gross_profit / gross_loss) if gross_loss else float(gross_profit > 0), 2),
    }


def _equity_curve(trades_df: pd.DataFrame):
    if trades_df.empty:
        return []
    closed = trades_df[trades_df["status"].isin(["TP", "SL", "TIMEOUT"])].copy()
    closed = closed.dropna(subset=["exit_date"]).sort_values(["exit_date", "entry_date"])
    if closed.empty:
        return []
    equity = 1.0
    peak = 1.0
    curve = []
    for row in closed.itertuples():
        ret = _safe_float(row.return_pct) or 0.0
        equity *= (1 + ret)
        peak = max(peak, equity)
        drawdown = (equity - peak) / peak if peak else 0
        curve.append(
            {
                "date": row.exit_date.isoformat(),
                "equity": round(equity, 4),
                "cumulative_return_pct": round((equity - 1) * 100, 2),
                "drawdown_pct": round(drawdown * 100, 2),
            }
        )
    return curve


def _freshness_payload():
    checks = [
        ("stock_ohlc", 'SELECT MAX("Ngay") as latest_value, COUNT(*) as row_count FROM stock_ohlc', "daily"),
        ("vnindex_ohlc", 'SELECT MAX("Ngay") as latest_value, COUNT(*) as row_count FROM vnindex_ohlc', "daily"),
        ("ai_signals", 'SELECT MAX(date) as latest_value, COUNT(*) as row_count FROM ai_signals', "daily"),
        ("daily_signal_summary", 'SELECT MAX(date) as latest_value, COUNT(*) as row_count FROM daily_signal_summary', "daily"),
        ("trade_history", 'SELECT MAX(entry_date) as latest_value, COUNT(*) as row_count FROM trade_history', "daily"),
        ("vn30f1m_intraday", 'SELECT MAX(time) as latest_value, COUNT(*) as row_count FROM vn30f1m_intraday', "intraday"),
    ]
    freshness = []
    today = pd.Timestamp.today().normalize()
    for table_name, sql, cadence in checks:
        frame = _read_sql(sql)
        latest = pd.to_datetime(frame.iloc[0]["latest_value"]) if not frame.empty and pd.notnull(frame.iloc[0]["latest_value"]) else None
        lag_days = int((today - latest.normalize()).days) if latest is not None else None
        if latest is None:
            status = "stale"
        elif cadence == "intraday":
            status = "healthy" if lag_days == 0 else "warning"
        else:
            status = "healthy" if lag_days is not None and lag_days <= 1 else "warning" if lag_days is not None and lag_days <= 3 else "stale"
        freshness.append(
            {
                "table": table_name,
                "latest_value": latest.isoformat() if latest is not None else None,
                "row_count": int(frame.iloc[0]["row_count"]) if not frame.empty else 0,
                "lag_days": lag_days,
                "status": status,
            }
        )
    return freshness


def get_market_intelligence_overview(start_date=None, end_date=None, sector=None, ticker=None, status=None):
    stocks_df = _apply_common_filters(_load_stock_frame(start_date, end_date), "trade_date", start_date, end_date, sector, ticker)
    signals_df = _apply_common_filters(_load_signal_frame(start_date, end_date), "signal_date", start_date, end_date, sector, ticker)
    trades_df = _apply_common_filters(_load_trade_frame(start_date, end_date, status), "entry_date", start_date, end_date, sector, ticker)
    summary_df = _load_signal_summary_frame(start_date, end_date)
    vnindex_df = _load_vnindex_frame(start_date, end_date)

    latest_market_date = stocks_df["trade_date"].max() if not stocks_df.empty else None
    latest_signal_date = signals_df["signal_date"].max() if not signals_df.empty else None
    latest_trade_exit = trades_df["exit_date"].dropna().max() if not trades_df.empty else None
    trade_kpis = _trade_kpis(trades_df)
    equity_curve = _equity_curve(trades_df)
    max_drawdown = min([point["drawdown_pct"] for point in equity_curve], default=0)

    breadth = {"advancers": 0, "decliners": 0, "unchanged": 0, "breadth_ratio": 0}
    if not stocks_df.empty:
        market_calc = stocks_df.sort_values(["stock_id", "trade_date"]).copy()
        market_calc["daily_return"] = market_calc.groupby("stock_id")["close"].pct_change()
        latest_market = market_calc[market_calc["trade_date"] == latest_market_date]
        advancers = int((latest_market["daily_return"] > 0).sum())
        decliners = int((latest_market["daily_return"] < 0).sum())
        breadth = {
            "advancers": advancers,
            "decliners": decliners,
            "unchanged": int((latest_market["daily_return"] == 0).sum()),
            "breadth_ratio": round(advancers / max(decliners, 1), 2),
        }

    latest_vnindex_move = 0
    if len(vnindex_df) >= 2:
        latest_vnindex_move = round((vnindex_df["close"].iloc[-1] / vnindex_df["close"].iloc[-2] - 1) * 100, 2)

    signal_trend = []
    if not summary_df.empty:
        trend_df = summary_df.sort_values("signal_date").copy()
        trend_df["signal_count_7d_ma"] = trend_df["signal_count"].rolling(7, min_periods=1).mean()
        signal_trend = _records(trend_df.tail(30), {"signal_count_7d_ma": 2})

    close_trend = []
    closed = trades_df[trades_df["status"].isin(["TP", "SL", "TIMEOUT"])].copy() if not trades_df.empty else pd.DataFrame()
    if not closed.empty:
        close_daily = (
            closed.dropna(subset=["exit_date"])
            .groupby("exit_date")
            .agg(closed_trade_count=("stock_id", "count"), avg_return=("return_pct", "mean"))
            .reset_index()
            .sort_values("exit_date")
        )
        close_daily["avg_return"] = close_daily["avg_return"] * 100
        close_trend = _records(close_daily.tail(30), {"avg_return": 2})

    alerts = []
    freshness = _freshness_payload()
    stale_tables = [item["table"] for item in freshness if item["status"] == "stale"]
    if stale_tables:
        alerts.append({"level": "warning", "message": f"Stale datasets detected: {', '.join(stale_tables)}"})
    if not summary_df.empty and summary_df["signal_count"].tail(5).mean() > 0:
        latest_signal_count = int(summary_df["signal_count"].iloc[-1])
        recent_avg = float(summary_df["signal_count"].tail(5).mean())
        if latest_signal_count < recent_avg * 0.4:
            alerts.append({"level": "warning", "message": "Latest signal count is materially below the recent 5-day average."})
    unmapped_tickers = [item for item in stocks_df["stock_id"].unique().tolist() if item not in SECTOR_LOOKUP] if not stocks_df.empty else []
    if unmapped_tickers:
        alerts.append({"level": "info", "message": f"{len(unmapped_tickers)} tickers have no sector mapping."})

    latest_signals = signals_df[signals_df["signal_date"] == latest_signal_date] if latest_signal_date is not None else pd.DataFrame()
    latest_entries = trades_df[trades_df["entry_date"] == trades_df["entry_date"].max()] if not trades_df.empty else pd.DataFrame()
    latest_closures = closed[closed["exit_date"] == latest_trade_exit] if latest_trade_exit is not None and not closed.empty else pd.DataFrame()

    return _json_safe({
        "filters_applied": {"start_date": start_date, "end_date": end_date, "sector": sector or "ALL", "ticker": ticker or "ALL", "status": status or "ALL"},
        "summary": {
            "total_tickers": int(stocks_df["stock_id"].nunique()) if not stocks_df.empty else 0,
            "latest_trading_date": latest_market_date.isoformat() if latest_market_date is not None else None,
            "total_signals": int(len(signals_df)),
            "open_trades": trade_kpis["open_trades"],
            "closed_trades": trade_kpis["closed_trades"],
            "win_rate": trade_kpis["win_rate"],
            "avg_return": trade_kpis["avg_return"],
            "median_return": trade_kpis["median_return"],
            "max_drawdown": round(max_drawdown, 2),
            "avg_holding_days": trade_kpis["avg_holding_days"],
        },
        "daily_activity": {
            "signals_generated_latest_day": int(len(latest_signals)),
            "trades_closed_latest_day": int(len(latest_closures)),
            "new_open_positions_latest_day": int(len(latest_entries[latest_entries["status"] == "HOLD"])) if not latest_entries.empty else 0,
            "latest_vnindex_move_pct": latest_vnindex_move,
            "latest_market_breadth": breadth,
        },
        "series": {"signal_trend_30d": signal_trend, "trade_close_trend_30d": close_trend, "equity_curve": equity_curve[-30:]},
        "freshness": freshness,
        "alerts": alerts,
        "metadata": {"unmapped_tickers": unmapped_tickers[:25]},
    })


def get_market_intelligence_signals(start_date=None, end_date=None, sector=None, ticker=None, probability_bucket=None):
    signals_df = _apply_common_filters(_load_signal_frame(start_date, end_date), "signal_date", start_date, end_date, sector, ticker)
    trades_df = _apply_common_filters(_load_trade_frame(start_date, end_date), "entry_date", start_date, end_date, sector, ticker)
    summary_df = _load_signal_summary_frame(start_date, end_date)
    if signals_df.empty:
        return _json_safe({
            "filters_applied": {"start_date": start_date, "end_date": end_date, "sector": sector or "ALL", "ticker": ticker or "ALL", "probability_bucket": probability_bucket or "ALL"},
            "summary": {"total_signals": 0, "avg_probability": 0, "avg_reward_risk": 0},
            "series": {"signal_trend": [], "probability_buckets": [], "sector_distribution": [], "top_tickers": []},
            "tables": {"recent_signals": []},
        })
    signals_df = signals_df.copy()
    signals_df["probability_bucket"] = signals_df["prob"].apply(_prob_bucket)
    signals_df["reward_risk"] = (signals_df["tp_price"] - signals_df["entry_price"]) / (signals_df["entry_price"] - signals_df["sl_price"])
    signals_df.loc[~np.isfinite(signals_df["reward_risk"]), "reward_risk"] = np.nan
    if probability_bucket and probability_bucket != "ALL":
        signals_df = signals_df[signals_df["probability_bucket"] == probability_bucket]

    joined = signals_df.merge(
        trades_df[["stock_id", "entry_date", "status", "return_pct", "holding_days"]].rename(columns={"entry_date": "signal_date", "status": "trade_status"}),
        on=["stock_id", "signal_date"],
        how="left",
    )
    bucket_perf = (
        joined.groupby("probability_bucket")
        .agg(
            signal_count=("stock_id", "count"),
            win_rate=("trade_status", lambda s: round(((s == "TP").sum() / max((s.isin(["TP", "SL", "TIMEOUT"])).sum(), 1)) * 100, 1)),
            avg_return=("return_pct", lambda s: round(s.dropna().mean() * 100, 2) if len(s.dropna()) else 0),
            avg_holding_days=("holding_days", lambda s: round(s.dropna().mean(), 1) if len(s.dropna()) else 0),
        )
        .reset_index()
    )
    trend = []
    if not summary_df.empty:
        trend_df = summary_df.sort_values("signal_date").copy()
        trend_df["signal_count_7d_ma"] = trend_df["signal_count"].rolling(7, min_periods=1).mean()
        trend = _records(trend_df, {"signal_count_7d_ma": 2})
    sector_distribution = (
        signals_df.groupby("sector")
        .agg(signal_count=("stock_id", "count"), avg_prob=("prob", "mean"))
        .reset_index()
        .sort_values(["signal_count", "avg_prob"], ascending=[False, False])
    )
    top_tickers = (
        signals_df.groupby("stock_id")
        .agg(signal_count=("stock_id", "count"), avg_prob=("prob", "mean"), sector=("sector", "first"))
        .reset_index()
        .sort_values(["signal_count", "avg_prob"], ascending=[False, False])
        .head(15)
    )
    recent_signals = signals_df.sort_values(["signal_date", "prob"], ascending=[False, False]).head(30).copy()
    recent_signals["date"] = recent_signals["signal_date"]
    return _json_safe({
        "filters_applied": {"start_date": start_date, "end_date": end_date, "sector": sector or "ALL", "ticker": ticker or "ALL", "probability_bucket": probability_bucket or "ALL"},
        "summary": {
            "total_signals": int(len(signals_df)),
            "avg_probability": round(signals_df["prob"].dropna().mean() * 100 if len(signals_df["prob"].dropna()) else 0, 2),
            "avg_reward_risk": round(signals_df["reward_risk"].dropna().mean() if len(signals_df["reward_risk"].dropna()) else 0, 2),
        },
        "series": {
            "signal_trend": trend,
            "probability_buckets": _records(bucket_perf),
            "sector_distribution": _records(sector_distribution, {"avg_prob": 4}),
            "top_tickers": _records(top_tickers, {"avg_prob": 4}),
        },
        "tables": {
            "recent_signals": _records(
                recent_signals[["date", "stock_id", "sector", "entry_price", "tp_price", "sl_price", "prob", "probability_bucket", "reward_risk"]],
                {"entry_price": 2, "tp_price": 2, "sl_price": 2, "prob": 4, "reward_risk": 2},
            )
        },
    })


def get_market_intelligence_trades(start_date=None, end_date=None, sector=None, ticker=None, status=None):
    trades_df = _apply_common_filters(_load_trade_frame(start_date, end_date, status), "entry_date", start_date, end_date, sector, ticker)
    if trades_df.empty:
        return _json_safe({
            "filters_applied": {"start_date": start_date, "end_date": end_date, "sector": sector or "ALL", "ticker": ticker or "ALL", "status": status or "ALL"},
            "summary": _trade_kpis(pd.DataFrame()),
            "series": {"outcome_breakdown": [], "return_distribution": [], "equity_curve": []},
            "tables": {"ticker_leaderboard": [], "sector_leaderboard": [], "open_trades": [], "recent_trades": []},
        })
    kpis = _trade_kpis(trades_df)
    outcome_breakdown = (
        trades_df.groupby("status").agg(trade_count=("stock_id", "count")).reset_index().sort_values("trade_count", ascending=False)
    )
    closed = trades_df[trades_df["status"].isin(["TP", "SL", "TIMEOUT"])].copy()
    return_distribution = [{"return_pct": round(value * 100, 2)} for value in closed["return_pct"].dropna().tolist()]
    ticker_board = (
        closed.groupby("stock_id")
        .agg(
            sector=("sector", "first"),
            trades=("stock_id", "count"),
            win_rate=("status", lambda s: round(((s == "TP").sum() / len(s)) * 100, 1) if len(s) else 0),
            avg_return=("return_pct", lambda s: round(s.mean() * 100, 2) if len(s.dropna()) else 0),
        )
        .reset_index()
        .sort_values(["avg_return", "trades"], ascending=[False, False])
        .head(15)
    )
    sector_board = (
        closed.groupby("sector")
        .agg(
            trades=("stock_id", "count"),
            win_rate=("status", lambda s: round(((s == "TP").sum() / len(s)) * 100, 1) if len(s) else 0),
            avg_return=("return_pct", lambda s: round(s.mean() * 100, 2) if len(s.dropna()) else 0),
            avg_holding_days=("holding_days", lambda s: round(s.dropna().mean(), 1) if len(s.dropna()) else 0),
        )
        .reset_index()
        .sort_values(["avg_return", "trades"], ascending=[False, False])
    )
    open_trades = trades_df[trades_df["status"] == "HOLD"].copy()
    if not open_trades.empty:
        today = pd.Timestamp.today().normalize()
        open_trades["age_days"] = (today - open_trades["entry_date"].dt.normalize()).dt.days
    recent_trades = trades_df.sort_values("entry_date", ascending=False).head(25)
    return _json_safe({
        "filters_applied": {"start_date": start_date, "end_date": end_date, "sector": sector or "ALL", "ticker": ticker or "ALL", "status": status or "ALL"},
        "summary": kpis,
        "series": {
            "outcome_breakdown": _records(outcome_breakdown),
            "return_distribution": return_distribution,
            "equity_curve": _equity_curve(trades_df),
        },
        "tables": {
            "ticker_leaderboard": _records(ticker_board),
            "sector_leaderboard": _records(sector_board),
            "open_trades": _records(open_trades[["stock_id", "sector", "entry_date", "entry_price", "tp_price", "sl_price", "prob", "age_days"]], {"entry_price": 2, "tp_price": 2, "sl_price": 2, "prob": 4}),
            "recent_trades": _records(recent_trades[["stock_id", "sector", "entry_date", "exit_date", "status", "return_pct", "holding_days", "prob"]], {"return_pct": 4, "prob": 4}),
        },
    })


def get_market_intelligence_market(start_date=None, end_date=None, sector=None, ticker=None):
    stocks_df = _apply_common_filters(_load_stock_frame(start_date, end_date), "trade_date", start_date, end_date, sector, ticker)
    vnindex_df = _load_vnindex_frame(start_date, end_date)
    if stocks_df.empty:
        return _json_safe({
            "filters_applied": {"start_date": start_date, "end_date": end_date, "sector": sector or "ALL", "ticker": ticker or "ALL"},
            "summary": {"latest_trading_date": None, "breadth": {}},
            "series": {"sector_performance": [], "liquidity_leaders": [], "return_distribution": [], "vnindex": []},
        })
    market = stocks_df.sort_values(["stock_id", "trade_date"]).copy()
    market["daily_return"] = market.groupby("stock_id")["close"].pct_change()
    market["traded_value"] = market["close"] * market["volume"]
    market["ma5"] = market.groupby("stock_id")["close"].transform(lambda s: s.rolling(5, min_periods=1).mean())
    market["ma20"] = market.groupby("stock_id")["close"].transform(lambda s: s.rolling(20, min_periods=1).mean())
    market["volatility_20d"] = market.groupby("stock_id")["daily_return"].transform(lambda s: s.rolling(20, min_periods=5).std() * np.sqrt(252) * 100)
    market["high_20d"] = market.groupby("stock_id")["high"].transform(lambda s: s.rolling(20, min_periods=1).max())
    market["low_20d"] = market.groupby("stock_id")["low"].transform(lambda s: s.rolling(20, min_periods=1).min())
    latest_date = market["trade_date"].max()
    latest = market[market["trade_date"] == latest_date].copy()
    breadth = {
        "advancers": int((latest["daily_return"] > 0).sum()),
        "decliners": int((latest["daily_return"] < 0).sum()),
        "unchanged": int((latest["daily_return"] == 0).sum()),
        "above_ma5_pct": round((latest["close"] > latest["ma5"]).mean() * 100 if len(latest) else 0, 1),
        "above_ma20_pct": round((latest["close"] > latest["ma20"]).mean() * 100 if len(latest) else 0, 1),
        "new_20d_highs": int((latest["high"] >= latest["high_20d"]).sum()),
        "new_20d_lows": int((latest["low"] <= latest["low_20d"]).sum()),
    }
    sector_performance = (
        latest.groupby("sector")
        .agg(
            avg_return=("daily_return", lambda s: round(s.mean() * 100, 2) if len(s.dropna()) else 0),
            median_return=("daily_return", lambda s: round(s.median() * 100, 2) if len(s.dropna()) else 0),
            breadth_pct=("daily_return", lambda s: round(s.gt(0).mean() * 100, 1) if len(s) else 0),
            total_traded_value=("traded_value", "sum"),
            avg_volatility_20d=("volatility_20d", "mean"),
        )
        .reset_index()
        .sort_values("avg_return", ascending=False)
    )
    liquidity = latest[["stock_id", "sector", "close", "volume", "traded_value", "daily_return"]].sort_values("traded_value", ascending=False).head(15)
    return_distribution = [{"daily_return_pct": round(value * 100, 2)} for value in latest["daily_return"].dropna().tolist()]
    vn_series = []
    if not vnindex_df.empty:
        vn = vnindex_df.sort_values("trade_date").copy()
        vn["daily_return"] = vn["close"].pct_change()
        vn["rolling_volatility_20d"] = vn["daily_return"].rolling(20, min_periods=5).std() * np.sqrt(252) * 100
        vn["running_peak"] = vn["close"].cummax()
        vn["drawdown_pct"] = (vn["close"] - vn["running_peak"]) / vn["running_peak"] * 100
        vn_series = _records(vn.tail(90), {"rolling_volatility_20d": 2, "drawdown_pct": 2})
    return _json_safe({
        "filters_applied": {"start_date": start_date, "end_date": end_date, "sector": sector or "ALL", "ticker": ticker or "ALL"},
        "summary": {"latest_trading_date": latest_date.isoformat() if latest_date is not None else None, "breadth": breadth},
        "series": {
            "sector_performance": _records(sector_performance, {"avg_volatility_20d": 2}),
            "liquidity_leaders": _records(liquidity, {"close": 2, "traded_value": 2, "daily_return": 4}),
            "return_distribution": return_distribution,
            "vnindex": vn_series,
        },
    })


def get_market_intelligence_pipeline_health():
    stocks_df = _load_stock_frame()
    freshness = _freshness_payload()
    total_tickers = int(stocks_df["stock_id"].nunique()) if not stocks_df.empty else 0
    latest_date = stocks_df["trade_date"].max() if not stocks_df.empty else None
    latest_slice = stocks_df[stocks_df["trade_date"] == latest_date] if latest_date is not None else pd.DataFrame()
    latest_tickers = int(latest_slice["stock_id"].nunique()) if not latest_slice.empty else 0
    unmapped = sorted([item for item in stocks_df["stock_id"].unique().tolist() if item not in SECTOR_LOOKUP]) if not stocks_df.empty else []
    signal_summary = _load_signal_summary_frame()
    anomalies = []
    stale_tables = [entry["table"] for entry in freshness if entry["status"] == "stale"]
    if stale_tables:
        anomalies.append({"level": "warning", "message": f"Stale tables detected: {', '.join(stale_tables)}"})
    if unmapped:
        anomalies.append({"level": "info", "message": f"{len(unmapped)} tickers are missing sector mapping."})
    if not signal_summary.empty:
        zero_days = signal_summary[signal_summary["signal_count"] == 0].tail(10)
        if not zero_days.empty:
            anomalies.append({"level": "info", "message": f"{len(zero_days)} recent signal-summary rows show zero signals."})
    return _json_safe({
        "summary": {
            "total_tickers": total_tickers,
            "latest_trading_date": latest_date.isoformat() if latest_date is not None else None,
            "tickers_present_latest_day": latest_tickers,
            "coverage_pct": round((latest_tickers / total_tickers) * 100, 1) if total_tickers else 0,
            "unmapped_ticker_count": len(unmapped),
        },
        "freshness": freshness,
        "coverage": {"mapped_tickers": total_tickers - len(unmapped), "unmapped_tickers": unmapped[:50]},
        "anomalies": anomalies,
    })
