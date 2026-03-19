import pandas as pd
import numpy as np
import os
from sklearn.preprocessing import StandardScaler
from models.xgb_predictor import XGBPredictor
from db.queries import get_all_stock_ohlc

# Configuration
DATA_DIR = "data"
MODEL_DIR = "models"
MODEL_NAME = "xgb_model"
SEQUENCE_LENGTH = 10
PREDICTION_STEPS = 10

def load_and_process_data():
    print("Fetching all stocks history from NeonDB...")
    df = get_all_stock_ohlc()
    
    if not df.empty and 'Close' in df.columns:
        df['Ticker'] = df['Ticker'].astype(str)
        df['Close'] = pd.to_numeric(df['Close'], errors='coerce')
        df = df.dropna(subset=['Close', 'Ticker'])
            
    print(f"Total Rows fetched from DB: {len(df)}")
    return df

def prepare_sequences(df):
    df = df.sort_values(['Ticker', 'Date'])
    
    def calc_log_ret(group):
        group['log_ret'] = np.log(group['Close'] / group['Close'].shift(1))
        return group.dropna()

    print("Computing Log Returns...")
    df_processed = df.groupby('Ticker', group_keys=False).apply(calc_log_ret)
    df_processed['log_ret'] = df_processed['log_ret'].clip(-0.15, 0.15)
    
    # Use StandardScaler to map mean to 0 and variance to 1. Yields better non-flat outputs for tree models
    scaler = StandardScaler()
    data_vals = df_processed['log_ret'].values.reshape(-1, 1)
    scaler.fit(data_vals)
    df_processed['scaled_ret'] = scaler.transform(data_vals)
    
    X, y = [], []
    grouped = df_processed.groupby('Ticker')
    
    print("Generating Sequences...")
    for ticker, group in grouped:
        vals = group['scaled_ret'].values
        if len(vals) < SEQUENCE_LENGTH + PREDICTION_STEPS:
            continue
            
        for i in range(0, len(vals) - SEQUENCE_LENGTH - PREDICTION_STEPS):
            X.append(vals[i : i + SEQUENCE_LENGTH])
            y.append(vals[i + SEQUENCE_LENGTH : i + SEQUENCE_LENGTH + PREDICTION_STEPS])
            
    X = np.array(X)
    y = np.array(y)
    
    X = np.expand_dims(X, axis=-1)
    y = np.expand_dims(y, axis=-1)
    
    return X, y, scaler

def main():
    os.makedirs(MODEL_DIR, exist_ok=True)
        
    df = load_and_process_data()
    X, y, scaler = prepare_sequences(df)
    
    print(f"Training XGB Data: X={X.shape}, y={y.shape}")
    
    model = XGBPredictor(n_steps=PREDICTION_STEPS)
    model.sequence_length = SEQUENCE_LENGTH
    model.scaler = scaler
    
    print("Starting XGB training...")
    model.train(X, y)
    
    save_path = os.path.join(MODEL_DIR, MODEL_NAME)
    model.save(save_path)
    print("XGB Training Done!")

if __name__ == "__main__":
    main()
