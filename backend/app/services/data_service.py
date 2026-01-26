import pandas as pd
import os
from functools import lru_cache
from app.core.config import settings

_cached_df = None

@lru_cache(maxsize=1)
def load_data_cached():
    """
    Loads data from excel once and caches it in memory.
    """
    if not os.path.exists(settings.DATA_PATH):
        raise FileNotFoundError(f"Data file not found at {settings.DATA_PATH}")

    print(f"Loading data from {settings.DATA_PATH}...")
    try:
        # Explicitly specify engine to avoid ambiguity on some platforms
        df = pd.read_excel(settings.DATA_PATH, engine='openpyxl')
    except Exception as e:
        print(f"CRITICAL ERROR LOADING EXCEL: {e}")
        import traceback
        traceback.print_exc()
        raise e
    
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
    df.fillna(method='ffill', inplace=True) 
    
    print("Data loaded successfully.")
    return df

def get_tickers():
    df = load_data_cached()
    return df['Ticker'].unique().tolist()

def get_ticker_data(ticker):
    df = load_data_cached()
    ticker_df = df[df['Ticker'] == ticker].copy()
    return ticker_df
