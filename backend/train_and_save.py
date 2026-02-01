
import pandas as pd
import numpy as np
import os
import glob
from sklearn.preprocessing import MinMaxScaler
from models.quantile_lstm import QuantileLSTM

# Configuration
DATA_DIR = "data"
MODEL_DIR = "models"
MODEL_NAME = "vn_stock_predictor"
SEQUENCE_LENGTH = 60
PREDICTION_STEPS = 10
# We train on Log Returns of Close Price
# Features: Log Return, Volume Change (optional, let's stick to Univariate Log Return for robustness first or minimal features)
# Let's use: [Log_Return_Close, Log_Return_Volume]
FEATURES = ['log_ret', 'log_vol']

def load_and_process_data():
    all_files = glob.glob(os.path.join(DATA_DIR, "*.xlsx"))
    rename_map = {
        '<Ticker>': 'Ticker', '<DTYYYYMMDD>': 'Date', '<Open>': 'Open', '<High>': 'High', '<Low>': 'Low', '<Close>': 'Close', '<Volume>': 'Volume',
        'Mã CP': 'Ticker', 'Ngày': 'Date', 'Đóng cửa': 'Close', 'Mở cửa': 'Open', 'Cao nhất': 'High', 'Thấp nhất': 'Low', 'KL': 'Volume',
        'stock_id': 'Ticker', 'Ngay': 'Date', 'adj_close': 'Close', 'adj_open': 'Open', 'adj_high': 'High', 'adj_low': 'Low', 'volume': 'Volume'
    }
    
    combined_df = pd.DataFrame()
    for f in all_files:
        try:
            df = pd.read_excel(f)
            df = df.rename(columns=rename_map)
            if 'Ticker' in df.columns and 'Date' in df.columns and 'Close' in df.columns:
                df['Date'] = pd.to_datetime(df['Date'])
                # Cleaning
                df['Close'] = pd.to_numeric(df['Close'], errors='coerce')
                df['Volume'] = pd.to_numeric(df['Volume'], errors='coerce')
                df = df.dropna(subset=['Close', 'Ticker'])
                combined_df = pd.concat([combined_df, df], ignore_index=True)
        except Exception as e:
            print(f"Error loading {f}: {e}")

    print(f"Total Rows: {len(combined_df)}")
    return combined_df

def prepare_sequences(df):
    # Calculate Log Returns per Ticker
    df = df.sort_values(['Ticker', 'Date'])
    
    # helper for log ret
    def calc_log_ret(group):
        group['log_ret'] = np.log(group['Close'] / group['Close'].shift(1))
        # Add volume change too?
        # group['log_vol'] = np.log(group['Volume'].replace(0, 1) / group['Volume'].shift(1).replace(0, 1))
        # Let's stick to just Price momentum for the MVP stability
        return group.dropna()

    print("Computing Log Returns...")
    df_processed = df.groupby('Ticker', group_keys=False).apply(calc_log_ret)
    
    # Clip extreme outliers (e.g. data errors or massive splits not adjusted)
    # VN market ceiling is 7% (approx 0.07). Let's clip at +/- 0.15 to be safe
    df_processed['log_ret'] = df_processed['log_ret'].clip(-0.15, 0.15)
    
    # Global Scaler for Log Returns (they are already somewhat normalized, but MinMax helps LSTM)
    scaler = MinMaxScaler(feature_range=(0, 1))
    
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
            
        # Optimization: stride?
        for i in range(0, len(vals) - SEQUENCE_LENGTH - PREDICTION_STEPS):
            X.append(vals[i : i + SEQUENCE_LENGTH])
            y.append(vals[i + SEQUENCE_LENGTH : i + SEQUENCE_LENGTH + PREDICTION_STEPS])
            
    X = np.array(X)
    y = np.array(y)
    
    # X shape: (samples, seq_len) -> need (samples, seq_len, 1)
    X = np.expand_dims(X, axis=-1)
    y = np.expand_dims(y, axis=-1) # (samples, pred_steps, 1)
    
    return X, y, scaler

def main():
    if not os.path.exists(MODEL_DIR):
        os.makedirs(MODEL_DIR)
        
    df = load_and_process_data()
    
    # Filter only tickers with enough data to speed up train?
    # For now use all.
    
    X, y, scaler = prepare_sequences(df)
    
    print(f"Training Data: X={X.shape}, y={y.shape}")
    
    # Model
    model = QuantileLSTM(
        sequence_length=SEQUENCE_LENGTH,
        n_steps=PREDICTION_STEPS,
        quantiles=[0.05, 0.5, 0.95]
    )
    
    # We save the features list just to know what input expected (1 dim)
    model.scaler = scaler
    model.feature_columns = ['log_ret'] 
    
    model.train(X, y, epochs=5, batch_size=128) # 5 epochs enough for log ret usually
    
    save_path = os.path.join(MODEL_DIR, MODEL_NAME)
    model.save(save_path)
    print("Done!")

if __name__ == "__main__":
    main()
