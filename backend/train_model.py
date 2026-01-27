import pandas as pd
import numpy as np
import xgboost as xgb
import joblib
import os
import argparse

# Add parent directory to path to see 'app'
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.data_service import load_data_cached

def create_features(df):
    """
    Generate Technical Indicators and Lags for the entire dataframe.
    """
    df = df.copy()
    df = df.sort_values(by=['Ticker', 'Date'])
    
    # Simple Moving Averages
    df['SMA_5'] = df.groupby('Ticker')['Close'].transform(lambda x: x.rolling(window=5).mean())
    df['SMA_20'] = df.groupby('Ticker')['Close'].transform(lambda x: x.rolling(window=20).mean())
    
    # Relative Strength Index (RSI - 14)
    def calculate_rsi(series, period=14):
        delta = series.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        return 100 - (100 / (1 + rs))
    
    df['RSI'] = df.groupby('Ticker')['Close'].transform(lambda x: calculate_rsi(x))
    
    # Lags (Autoconrelation features)
    for lag in [1, 2, 3, 5]:
        df[f'Lag_{lag}'] = df.groupby('Ticker')['Close'].shift(lag)
        
    # Return (Target is usually return, but for simplicity of prediction we predict Next Close)
    # We will predict next day's close based on features.
    # To predict 10 days, we feed the prediction back in.
    
    # Target: Next Day Close
    df['Target'] = df.groupby('Ticker')['Close'].shift(-1)
    
    return df.dropna()

def train_global_model():
    print("Loading Data...")
    from app.core.config import settings
    # Override settings path to be correct relative to THIS file - data is in 'data' subfolder
    data_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'all_stocks.xlsx')
    if os.path.exists(data_path):
        settings.DATA_PATH = data_path
    else:
        print(f"Warning: Could not find data at {data_path}")
    
    df = load_data_cached()
    
    print("Feature Engineering...")
    df_features = create_features(df)
    
    features = ['Open', 'High', 'Low', 'Close', 'Volume', 'SMA_5', 'SMA_20', 'RSI', 'Lag_1', 'Lag_2', 'Lag_3', 'Lag_5']
    target = 'Target'
    
    X = df_features[features]
    y = df_features[target]
    
    print(f"Training XGBoost on {len(X)} rows...")
    model = xgb.XGBRegressor(
        n_estimators=100,
        learning_rate=0.05,
        max_depth=5,
        objective='reg:squarederror',
        n_jobs=-1 
    )
    
    model.fit(X, y)
    
    save_path = os.path.join(os.getcwd(), 'backend', 'app', 'models')
    os.makedirs(save_path, exist_ok=True)
    model_file = os.path.join(save_path, 'global_xgb_model.json')
    
    model.save_model(model_file)
    print(f"Model saved to {model_file}")
    
    # Verify
    score = model.score(X, y)
    print(f"R^2 Score on Training Data: {score:.4f}")

if __name__ == "__main__":
    train_global_model()
