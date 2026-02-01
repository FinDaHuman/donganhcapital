
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
SEQUENCE_LENGTH = 60  # 60 days history
PREDICTION_STEPS = 10 # 10 days forecast
FEATURES = ['Close', 'High', 'Low', 'Open', 'Volume']

def load_and_process_data():
    all_files = glob.glob(os.path.join(DATA_DIR, "*.xlsx"))
    print(f"Found data files: {all_files}")
    
    combined_df = pd.DataFrame()
    
    for f in all_files:
        try:
            print(f"Loading {f}...")
            # Assuming standard OHLCV columns exist or need mapping
            # Adjust column names based on actual file structure if needed
            df = pd.read_excel(f)
            
            # Basic cleanup - ensure we have the right columns
            # Using common ticker/date columns. 
            # If files have Vietnamese headers, we might need a mapping.
            # For now assuming standard clean data or specific format.
            # Let's check columns in a real run, but here we assume standard:
            # Ticker, Date/Time, Open, High, Low, Close, Volume
            
            # Normalize column names if needed (e.g. to lowercase)
            df.columns = [c.strip() for c in df.columns]
            
            # Simple check for required columns
            required = ['Ticker', 'Date', 'Close', 'One'] # 'One' ?? maybe just Close/Open/High/Low
            # If columns are disparate, we might default to just closing price prediction 
            # but LSTM needs robust features.
            
            # Let's assume the user files are clean enough or standard.
            combined_df = pd.concat([combined_df, df], ignore_index=True)
            
        except Exception as e:
            print(f"Error loading {f}: {e}")

    print(f"Total Combined Rows: {len(combined_df)}")
    return combined_df

def prepare_sequences(df):
    # We need to scale data per stock or globally?
    # Globally is risky due to different price ranges (e.g. VNM 60k vs ROS 2k).
    # Better: Use "Returns" or Log Returns. 
    # OR: MinMax scale PER WINDOW (dynamically).
    # OR: MinMax scale globally if we normalize everything to percentage change?
    
    # FOR SIMPLICITY/ROBUSTNESS in this MVP:
    # We will use Log Returns for prices, or simple MinMax on the specific FEATURES.
    # Note: Global MinMax on 'Close' is bad for multi-stock. 
    # **Better Approach for General Model**: Train on Percentage Changes!
    # But User wanted price levels.
    # "Production Ready" usually means training on returns, then reconstructing price.
    
    # However, to simulate the user's snippet logic usually implies MinMax.
    # We will create sequences STOCK BY STOCK.
    
    scaler = MinMaxScaler(feature_range=(0, 1))
    
    # Sort by Ticker, Date
    # Ensure Date is datetime
    if 'Date' in df.columns:
        df['Date'] = pd.to_datetime(df['Date'])
        df = df.sort_values(['Ticker', 'Date'])
    
    # We'll use a Global Scaler for simplicity in this version, 
    # BUT beware: Stock A (100k) and Stock B (10k) will be squashed.
    # Ideally should be trained on Returns. 
    # Let's use Log Normalized values if possible, or just raw MinMax over the whole dataset 
    # (acceptable if stocks are roughly same class, e.g. Bluechips).
    
    # Filter features
    # Check if we have standard English headers, if not map them
    # Map Vietnamese to English if detected?
    # 'Mã CP' -> Ticker, 'Ngày' -> Date, 'Đóng cửa' -> Close...
    # Let's accept standard English for now or rename if needed.
    
    # For now, let's assume we proceed with whatever columns we found matching inputs.
    # We'll just try to fit 'Close' if others missing.
    
    target_col = 'Close'
    feature_cols = [c for c in FEATURES if c in df.columns]
    
    print(f"Training on Feature Columns: {feature_cols}")
    
    # Global Scaling
    valid_data = df[feature_cols].copy()
    valid_data = valid_data.fillna(method='ffill').fillna(method='bfill') # Handle missing
    
    scaled_data = scaler.fit_transform(valid_data)
    df_scaled = pd.DataFrame(scaled_data, columns=feature_cols, index=df.index)
    df_scaled['Ticker'] = df['Ticker']
    
    X, y = [], []
    
    # Group by Ticker to avoid mixing sequences across stocks
    grouped = df_scaled.groupby('Ticker')
    
    for ticker, group in grouped:
        # Need at least seq_len + prediction_steps
        data_val = group[feature_cols].values
        if len(data_val) < SEQUENCE_LENGTH + PREDICTION_STEPS:
            continue
            
        for i in range(len(data_val) - SEQUENCE_LENGTH - PREDICTION_STEPS):
            X.append(data_val[i : i + SEQUENCE_LENGTH])
            # Target: Close price for next N steps
            # Target shape: (N_STEPS,)
            # We predict FUTURE Close vs CURRENT Close? 
            # Or just raw Scaled Future Close.
            # Let's predict Raw Scaled Future Close.
            target_idx = feature_cols.index(target_col)
            y.append(data_val[i + SEQUENCE_LENGTH : i + SEQUENCE_LENGTH + PREDICTION_STEPS, target_idx])
            
    return np.array(X), np.array(y), scaler, feature_cols

def main():
    if not os.path.exists(MODEL_DIR):
        os.makedirs(MODEL_DIR)
        
    print("Loading Data...")
    df = load_and_process_data()
    
    # Basic Column Mapping if Vietnamese
    # Try to standardize
    rename_map = {
        '<Ticker>': 'Ticker', '<DTYYYYMMDD>': 'Date', '<Open>': 'Open', '<High>': 'High', '<Low>': 'Low', '<Close>': 'Close', '<Volume>': 'Volume',
        'Mã CP': 'Ticker', 'Ngày': 'Date', 'Đóng cửa': 'Close', 'Mở cửa': 'Open', 'Cao nhất': 'High', 'Thấp nhất': 'Low', 'KL': 'Volume',
        # New data format mappings
        'stock_id': 'Ticker', 'Ngay': 'Date', 'adj_close': 'Close', 'adj_open': 'Open', 'adj_high': 'High', 'adj_low': 'Low', 'volume': 'Volume'
    }
    df = df.rename(columns=rename_map)
    
    # Check Required
    for c in ['Ticker', 'Close']:
        if c not in df.columns:
            print(f"Critical Error: Column '{c}' not found. Columns: {df.columns}")
            return

    print("Preprocessing & Creating Sequences...")
    X, y, scaler, feature_cols = prepare_sequences(df)
    
    # Reshape targets for Quantile Loss: (Batch, Steps, 1) to match (Batch, Steps, Quantiles)
    # The loss function expects y_true to have 1 channel, y_pred to have 3.
    y = np.expand_dims(y, axis=-1)
    
    print(f"X shape: {X.shape}, y shape: {y.shape}")
    
    print("Initializing Model...")
    model = QuantileLSTM(
        sequence_length=SEQUENCE_LENGTH,
        n_steps=PREDICTION_STEPS,
        quantiles=[0.05, 0.5, 0.95]
    )
    model.scaler = scaler
    model.feature_columns = feature_cols
    
    model.train(X, y, epochs=10) # 10 epochs for demo/speed, increase for prod
    
    save_path = os.path.join(MODEL_DIR, MODEL_NAME)
    model.save(save_path)
    print("Done!")

if __name__ == "__main__":
    main()
