import pandas as pd
import os

# Define relative path to data
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, '..', 'data', 'all_stocks.xlsx')

_cached_df = None

def load_data():
    global _cached_df
    if _cached_df is not None:
        return _cached_df
    
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Data file not found at {DATA_PATH}")

    print(f"Loading data from {DATA_PATH}...")
    df = pd.read_excel(DATA_PATH)
    
    # Standardize columns
    df.rename(columns={
        'Ngay': 'Date',
        'stock_id': 'Ticker',
        'adj_open': 'Open',
        'adj_high': 'High',
        'adj_low': 'Low',
        'adj_close': 'Close',
        'volume': 'Volume'
    }, inplace=True)
    
    # Ensure Date is datetime
    df['Date'] = pd.to_datetime(df['Date'])
    
    # Sort by Ticker and Date
    df.sort_values(by=['Ticker', 'Date'], inplace=True)
    df.fillna(method='ffill', inplace=True) # Simple fill forward
    
    _cached_df = df
    print("Data loaded successfully.")
    return _cached_df

def get_tickers():
    df = load_data()
    return df['Ticker'].unique().tolist()

def get_ticker_data(ticker):
    df = load_data()
    ticker_df = df[df['Ticker'] == ticker].copy()
    return ticker_df
