import pandas as pd
import numpy as np
import xgboost as xgb
from pandas.tseries.offsets import BusinessDay
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)

# Caching logic: 
# We can't cache a large dataframe as a key. 
# We'll cache based on ticker and the latest date in the dataset (to invalidate if data updates).

@lru_cache(maxsize=128)
def _predict_cached(ticker: str, last_date_str: str, latest_price: float):
    """
    Internal cached function. 
    Arguments are primitives to allow lru_cache to work efficiently.
    Note: We pass latest_price just to have some data context in key if needed, 
    but strictly ticker + last_date_str is usually enough versioning.
    However, since we can't pass the DF, we need to re-fetch the DF inside here?
    No, that would be slow to filter every time.
    
    OPTIMIZATION: 
    Actually, to make this TRULY fast for 50 users, we should pre-filter or accept the DF.
    But passing DF to lru_cache is bad (not hashable).
    
    Hybrid Approach:
    We trust that 'load_data_cached' is fast.
    We filter inside here.
    """
    from app.services.data_service import get_ticker_data
    
    df = get_ticker_data(ticker)
    if df.empty:
        return None
    
    df = df.sort_values('Date')
    
    # --- TRAINING LOGIC (XGBoost) ---
    # Use last 60 days
    train_df = df.iloc[-60:].copy()
    
    if len(train_df) < 5:
        return None

    train_df['OrdinalDate'] = train_df['Date'].apply(lambda d: d.toordinal())
    
    X = train_df[['OrdinalDate']].values
    y = train_df['Close'].values

    # Optimized Hyperparams for Speed/Concurrency
    model = xgb.XGBRegressor(
        n_estimators=50, 
        max_depth=3, 
        learning_rate=0.1, 
        n_jobs=1,  # Single thread per request to allow higher server concurrency
        objective='reg:squarederror'
    )
    
    model.fit(X, y)

    # --- FORECAST ---
    last_date = train_df['Date'].max()
    future_dates = []
    
    current_date = last_date
    for _ in range(10):
        current_date = current_date + BusinessDay()
        future_dates.append(current_date)
        
    future_dates_ordinal = np.array([d.toordinal() for d in future_dates]).reshape(-1, 1)
    predicted_close = model.predict(future_dates_ordinal)

    # --- CONFIDENCE INTERVAL (Residual Based) ---
    # Predict on training set to find residuals
    y_pred_train = model.predict(X)
    residuals = y - y_pred_train
    std_dev = np.std(residuals)
    
    # 95% Confidence Interval (approx 1.96 std dev)
    margin_error = 1.96 * std_dev

    forecast = []
    
    # OHLC Heuristics
    avg_volatility = (train_df['High'] - train_df['Low']).mean()
    if pd.isna(avg_volatility) or avg_volatility == 0:
        avg_volatility = train_df['Close'].mean() * 0.02

    lower_bounds = []
    upper_bounds = []

    for date, close_price in zip(future_dates, predicted_close):
        # Confidence Bounds
        lb = close_price - margin_error
        ub = close_price + margin_error
        lower_bounds.append(lb)
        upper_bounds.append(ub)

        # Candle Construction
        noise = np.random.uniform(-0.1, 0.1) * avg_volatility
        sim_open = close_price + noise
        high = max(sim_open, close_price) + (avg_volatility * 0.2)
        low = min(sim_open, close_price) - (avg_volatility * 0.2)
        
        forecast.append({
            'Date': date.strftime('%Y-%m-%d'),
            'Open': round(sim_open, 2),
            'High': round(high, 2),
            'Low': round(low, 2),
            'Close': round(close_price, 2),
            'Volume': 0, 
            'Type': 'Forecast'
        })

    history = []
    for _, row in train_df.iterrows():
        history.append({
            'Date': row['Date'].strftime('%Y-%m-%d'),
            'Open': row['Open'],
            'High': row['High'],
            'Low': row['Low'],
            'Close': row['Close'],
            'Volume': row['Volume'],
            'Type': 'History'
        })
        
    return history, forecast, [round(x, 2) for x in lower_bounds], [round(x, 2) for x in upper_bounds]

def predict_stock(ticker: str):
    """
    Public interface that handles key generation for cache.
    """
    from app.services.data_service import get_ticker_data
    
    # Get lightweight metadata for cache key
    # We need to access data to know the latest date. 
    # Since data_service is cached, this is fast.
    df = get_ticker_data(ticker)
    if df.empty:
        return None
        
    last_date = df['Date'].max()
    last_date_str = str(last_date)
    last_close = float(df.iloc[-1]['Close'])
    
    return _predict_cached(ticker, last_date_str, last_close)
