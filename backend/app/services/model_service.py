import pandas as pd
import numpy as np
import xgboost as xgb
from pandas.tseries.offsets import BusinessDay
from functools import lru_cache
import os
import joblib

# Load Model Once
MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models', 'global_xgb_model.json')
global_model = None

def load_global_model():
    global global_model
    if global_model is None:
        if os.path.exists(MODEL_PATH):
            print(f"Loading Global Model from {MODEL_PATH}...")
            global_model = xgb.XGBRegressor()
            global_model.load_model(MODEL_PATH)
        else:
            print("Global Model not found! Falling back to simple heuristic (or error).")
            return None
    return global_model

def calculate_features(df):
    """
    On-the-fly feature calculation for inference.
    Must match training features exactly.
    """
    df = df.copy()
    
    # SMA
    df['SMA_5'] = df['Close'].rolling(window=5).mean()
    df['SMA_20'] = df['Close'].rolling(window=20).mean()
    
    # RSI
    delta = df['Close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    df['RSI'] = 100 - (100 / (1 + rs))
    
    # Lags
    for lag in [1, 2, 3, 5]:
        df[f'Lag_{lag}'] = df['Close'].shift(lag)
        
    return df.iloc[-1:] # Return only the last row for prediction

@lru_cache(maxsize=128)
def predict_with_global_model(ticker: str, last_date_str: str):
    from app.services.data_service import get_ticker_data
    
    df = get_ticker_data(ticker)
    if df.empty or len(df) < 60:
        return None, None, None, None
    
    # Use global model if available
    model = load_global_model()
    
    forecast = []
    current_df = df.copy()
    
    # Recursive Prediction for 10 days
    last_date = df['Date'].max()
    current_date = last_date
    
    # Prepare initial features
    # We need to append the "Next Day" row iteratively
    # But calculate_features relies on rolling windows of history.
    # So we append prediction to history and re-calc features (inefficient but accurate for consistency)
    
    future_closes = []
    
    # Optimization: Predict returns? 
    # For now, simplistic recursion:
    # 1. Calc features on full history
    # 2. Predict next close
    # 3. Append to history
    # 4. Repeat
    
    temp_history = df.copy()
    
    if model:
        for i in range(10):
            # Recalc features on extended history
            feat_row = calculate_features(temp_history)
            
            # Predict
            features = ['Open', 'High', 'Low', 'Close', 'Volume', 'SMA_5', 'SMA_20', 'RSI', 'Lag_1', 'Lag_2', 'Lag_3', 'Lag_5']
            # Fill NaNs for safety? (XGB handles NaNs, but feature engineering might drop row)
            if feat_row.isna().any().any():
                 # Fallback if too few data for features
                 pred_close = temp_history.iloc[-1]['Close']
            else:
                 X = feat_row[features]
                 pred_close = float(model.predict(X)[0])
            
            future_closes.append(pred_close)
            
            # Create next row for recursion
            current_date = current_date + BusinessDay()
            
            # Synthetic OHLC for next step (we only predict Close)
            # Open = Prev Close
            # High/Low = Close +/- Volatility
            prev_close = temp_history.iloc[-1]['Close']
            volatility = temp_history['Close'].diff().std()
            if np.isnan(volatility): volatility = prev_close * 0.01
            
            noise = np.random.normal(0, volatility * 0.5)
            # Adjust predicted close with some noise? No, keep model prediction pure.
            
            new_row = {
                'Date': current_date,
                'Open': prev_close,
                'High': max(prev_close, pred_close) + volatility,
                'Low': min(prev_close, pred_close) - volatility,
                'Close': pred_close, 
                'Volume': temp_history.iloc[-1]['Volume'], # Repeating volume
                'Ticker': ticker
            }
            # Append using concat
            temp_history = pd.concat([temp_history, pd.DataFrame([new_row])], ignore_index=True)
            
            forecast.append({
                'Date': current_date.strftime('%Y-%m-%d'),
                'Open': round(new_row['Open'], 2),
                'High': round(new_row['High'], 2),
                'Low': round(new_row['Low'], 2),
                'Close': round(new_row['Close'], 2),
                'Volume': 0,
                'Type': 'Forecast'
            })
            
    else:
        # Fallback to old heuristic if model fails to load
        return None # Trigger error or handle gracefully
        
    # Standardize Output
    history = []
    # Calculate indicators for History too (for Frontend toggle)
    # We can perform the full feature calc on history once
    full_history_features = df.copy() # calculate_features(df) # Logic above only returns last row
    # Let's do a full calc for returning indicators
    
    # Re-using the logic inside calculate_features but returning full DF
    df_h = df.copy()
    df_h['SMA_5'] = df_h['Close'].rolling(window=5).mean()
    df_h['SMA_20'] = df_h['Close'].rolling(window=20).mean()
    # RSI calc...
    delta = df_h['Close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    df_h['RSI'] = 100 - (100 / (1 + rs))

    for _, row in df_h.iterrows():
        history.append({
            'Date': row['Date'].strftime('%Y-%m-%d'),
            'Open': row['Open'],
            'High': row['High'],
            'Low': row['Low'],
            'Close': row['Close'],
            'Volume': row['Volume'],
            'SMA_5': row['SMA_5'] if not pd.isna(row['SMA_5']) else None,
            'SMA_20': row['SMA_20'] if not pd.isna(row['SMA_20']) else None,
            'RSI': row['RSI'] if not pd.isna(row['RSI']) else None,
            'Type': 'History'
        })

    # Confidence Interval (mock based on volatility of history)
    # Since Global Model isn't returning quantiles, we estimate
    std_dev = df['Close'].diff().std() or (df['Close'].iloc[-1] * 0.02)
    lower = [f['Close'] - (1.96 * std_dev) for f in forecast]
    upper = [f['Close'] + (1.96 * std_dev) for f in forecast]
    
    return history, forecast, lower, upper
