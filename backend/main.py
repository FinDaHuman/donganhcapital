from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
import asyncio
from datetime import datetime
import numpy as np
import pandas as pd
import joblib
import os
import json
import gc
import tensorflow as tf
from models.quantile_lstm import QuantileLSTM
from vnstock import Vnstock
from rate_limiter import RateLimiter, retry_async
from fastapi import Depends
from typing import Any
import time

# Disable GPU for lighter inference if needed
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

# --- Globals ---
predictor = None
stock_data_store = {} # {stock_id: DataFrame}
MODEL_PATH = "models/vn_stock_predictor"
DATA_DIR = "data"
MAX_ROWS_PER_TICKER = 60  # Keep only ~60 trading days to save memory

# Global rate limiter: max 10 calls per minute (reduced for free tier)
rate_limiter = RateLimiter(max_calls=10, period_seconds=60)
# Concurrency limiter for incoming requests (max 5 simultaneous users)
concurrency_limiter = asyncio.Semaphore(5)
# Simple in‑memory cache with TTL
_cache: dict[str, tuple[Any, float]] = {}

async def call_sync_with_retry(sync_func, *args, **kwargs):
    """Execute a synchronous function in a thread with retry and rate limiting."""
    async def wrapper():
        return await asyncio.to_thread(sync_func, *args, **kwargs)
    await rate_limiter.acquire()
    return await retry_async(wrapper)

async def limit_concurrency():
    """FastAPI dependency to limit concurrent requests."""
    await concurrency_limiter.acquire()
    try:
        yield
    finally:
        concurrency_limiter.release()

def get_cached(key: str, ttl: int, compute):
    """Return cached value if fresh, otherwise compute and store it."""
    now = time.time()
    entry = _cache.get(key)
    if entry and now < entry[1]:
        return entry[0]
    value = compute()
    _cache[key] = (value, now + ttl)
    return value

# --- Helper: Initialize Trackers ---
def initialize_trackers():
    global stock_data_store
    print("Loading Tickers from tickers.json...")
    try:
        with open("tickers.json", "r") as f:
            tickers = json.load(f)
        for t in tickers:
            stock_data_store[t] = pd.DataFrame()
        
        # Ensure VN30F1M is also initialized
        stock_data_store["VN30F1M"] = pd.DataFrame()
        
        print(f"✅ Initialized storage for {len(tickers)} stocks + VN30F1M.")
    except Exception as e:
        print(f"⚠️ Error loading tickers.json: {e}")

# --- Background Tasks ---
async def poll_hourly_stocks():
    global stock_data_store
    print("background task: poll_hourly_stocks started")
    # Wait 30s on startup to let the server fully stabilize
    await asyncio.sleep(30)
    
    while True:
        try:
            print(f"[{datetime.now().isoformat()}] Polling stock data...")
            tickers = list(stock_data_store.keys())
            # Don't poll VN30F1M here if it gets added to store
            tickers = [t for t in tickers if t != "VN30F1M"]
            
            for index, ticker in enumerate(tickers):
                try:
                    # Always fetch only 60 days to stay within memory limits
                    start_date = (datetime.now() - pd.Timedelta(days=60)).strftime('%Y-%m-%d')
                    end_date = datetime.now().strftime('%Y-%m-%d')
                    
                    def fetch_hourly_data():
                        return Vnstock().stock(symbol=ticker, source='VCI').quote.history(start=start_date, end=end_date)

                    df_new = await call_sync_with_retry(fetch_hourly_data)
                    
                    if df_new is not None and not df_new.empty:
                        # Convert Date column to datetime
                        # Data returned might have different col names
                        if 'time' in df_new.columns:
                            df_new = df_new.rename(columns={'time': 'Date', 'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume', 'ticker': 'Ticker'})
                        
                        df_new['Date'] = pd.to_datetime(df_new['Date'])
                        df_new['Ticker'] = ticker
                        
                        # Merge with existing
                        df_existing = stock_data_store[ticker]
                        
                        # Combine and drop duplicates based on Date
                        df_combined = pd.concat([df_existing, df_new], ignore_index=True)
                        df_combined = df_combined.drop_duplicates(subset=['Date'], keep='last')
                        df_combined = df_combined.sort_values('Date')
                        
                        # Trim to MAX_ROWS_PER_TICKER to save memory
                        df_combined = df_combined.tail(MAX_ROWS_PER_TICKER)
                        
                        stock_data_store[ticker] = df_combined
                        print(f"Updated {ticker}. Rows: {len(df_combined)}")
                except Exception as e:
                    print(f"Error polling {ticker}: {e}")
                
                # Rate limiting: wait 3 seconds between tickers
                await asyncio.sleep(3)
            
            # Force garbage collection after full poll cycle
            gc.collect()
            print(f"[{datetime.now().isoformat()}] Completed poll cycle. GC done.")
            # Sleep for 4 hours between poll cycles
            await asyncio.sleep(14400)
            
        except Exception as e:
            print(f"Error in poll_hourly_stocks loop: {e}")
            await asyncio.sleep(120)

async def poll_vn30f1m():
    global stock_data_store
    print("background task: poll_vn30f1m started")
    # Wait for main poll to get a head start
    await asyncio.sleep(60)
    
    ticker = "VN30F1M"
    while True:
        try:
            end_date = datetime.now().strftime('%Y-%m-%d')
            # Only fetch 60 days instead of 5 years
            start_date = (datetime.now() - pd.Timedelta(days=60)).strftime('%Y-%m-%d')
            
            def fetch_f1m_data():
                return Vnstock().stock(symbol=ticker, source='VCI').quote.history(start=start_date, end=end_date)

            df_new = await call_sync_with_retry(fetch_f1m_data)
            
            if df_new is not None and not df_new.empty:
                if 'time' in df_new.columns:
                    df_new = df_new.rename(columns={'time': 'Date', 'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'})
                
                df_new['Date'] = pd.to_datetime(df_new['Date'])
                df_new['Ticker'] = ticker
                
                if ticker in stock_data_store and not stock_data_store[ticker].empty:
                    df_existing = stock_data_store[ticker]
                    df_combined = pd.concat([df_existing, df_new], ignore_index=True)
                    df_combined = df_combined.drop_duplicates(subset=['Date'], keep='last')
                    df_combined = df_combined.sort_values('Date')
                    # Trim to save memory
                    df_combined = df_combined.tail(MAX_ROWS_PER_TICKER)
                    stock_data_store[ticker] = df_combined
                else:
                    stock_data_store[ticker] = df_new.tail(MAX_ROWS_PER_TICKER)
                    print(f"Initialized VN30F1M in stock_data_store.")
                
        except Exception as e:
            print(f"Error polling VN30F1M: {e}")
            
        # Poll every 5 minutes instead of 15 seconds
        await asyncio.sleep(300)

# --- Lifespan for Model Loading ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor
    
    # Store background tasks so they don't get garbage collected
    app.state.bg_tasks = []
    
    try:
        # Initialize trackers from configuration
        initialize_trackers()
        
        # Start background tasks
        app.state.bg_tasks.append(asyncio.create_task(poll_hourly_stocks()))
        app.state.bg_tasks.append(asyncio.create_task(poll_vn30f1m()))
        
        print("Loading Quantile LSTM Model...")
        # Check if model exists
        if os.path.exists(f"{MODEL_PATH}_meta.pkl"):
            predictor = QuantileLSTM.load(MODEL_PATH)
            print("✅ Model loaded successfully!")
        else:
            print("⚠️ Model file not found. Ensure 'train_and_save.py' has been run.")
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
    
    yield
    print("Shutting down...")

app = FastAPI(title="DongAnh Capital AI API", lifespan=lifespan)

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False, # Must be False for wildcard *
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Endpoints ---
@app.get("/")
def root():
    return {"message": "DongAnh Capital API is running", "docs": "/docs"}

@app.get("/api")
def home():
    return {
        "status": "active", 
        "model_loaded": predictor is not None,
        "stocks_available": len(stock_data_store)
    }

@app.get("/api/health")
def health():
    """Simple health check endpoint"""
    return {"status": "ok", "model_loaded": predictor is not None}

@app.get("/api/loading-progress")
def loading_progress():
    """Return how many stocks have been loaded with data (≥2 rows)."""
    loaded = sum(1 for df in stock_data_store.values() if len(df) >= 2)
    total = len(stock_data_store)
    return {"loaded": loaded, "total": total}

@app.get("/api/stocks")
async def get_stocks(concurrency: Any = Depends(limit_concurrency)):
    """Return list of all available stock IDs (cached 30 s)"""
    def compute():
        return {"count": len(stock_data_store), "stocks": list(stock_data_store.keys())}
    return get_cached("stocks", 120, compute)

@app.get("/api/market-status")
async def get_market_status(concurrency: Any = Depends(limit_concurrency)):
    """Return latest snapshot for heatmap (cached 120s)"""
    def compute():
        results = []
        for ticker, df in stock_data_store.items():
            if len(df) < 2:
                continue
            last_row = df.iloc[-1]
            prev_row = df.iloc[-2]
            change = (last_row['Close'] - prev_row['Close']) / prev_row['Close'] * 100
            results.append({
                "ticker": ticker,
                "value": float(change),
                "size": int(last_row.get('Volume', 1000))
            })
        return results
    return get_cached("market_status", 120, compute)

@app.get("/api/predict/{stock_id}")
async def predict_stock(stock_id: str, concurrency: Any = Depends(limit_concurrency)):
    global predictor, stock_data_store
    
    # 1. Check Model & Data
    if predictor is None:
        raise HTTPException(status_code=503, detail="Prediction model is not loaded.")
    
    stock_id = stock_id.upper()
    if stock_id not in stock_data_store:
        raise HTTPException(status_code=404, detail=f"Stock '{stock_id}' not found in database.")
        
    try:
        # 2. Fetch fresh data on-demand for prediction (store only has ~60 rows)
        #    We need more history for the prediction model, so fetch it live.
        cache_key = f"predict_{stock_id}"
        cached = _cache.get(cache_key)
        if cached and time.time() < cached[1]:
            return cached[0]
        
        # Fetch enough data for the model (sequence_length + buffer)
        needed_days = max(predictor.sequence_length * 3, 120)  # ~120 trading days
        start_date = (datetime.now() - pd.Timedelta(days=needed_days)).strftime('%Y-%m-%d')
        end_date = datetime.now().strftime('%Y-%m-%d')
        
        def fetch_predict_data():
            return Vnstock().stock(symbol=stock_id, source='VCI').quote.history(start=start_date, end=end_date)
        
        df = await call_sync_with_retry(fetch_predict_data)
        
        if df is None or df.empty:
            raise HTTPException(status_code=400, detail="Could not fetch data for prediction.")
        
        # Normalize column names
        if 'time' in df.columns:
            df = df.rename(columns={'time': 'Date', 'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume', 'ticker': 'Ticker'})
        df['Date'] = pd.to_datetime(df['Date'])
        df['Ticker'] = stock_id
        
        if len(df) < predictor.sequence_length + 1:
             raise HTTPException(status_code=400, detail="Not enough history for this stock.")
             
        # Take last N entries for context visualization
        history_window = min(len(df), 250)  # Reduced from 1250 to save bandwidth
        history_df = df.tail(history_window).copy()
        
        # 3. Preprocess for Prediction (Compute Log Returns)
        input_prices = df.iloc[-(predictor.sequence_length + 1):].copy()
        input_prices['log_ret'] = np.log(input_prices['Close'] / input_prices['Close'].shift(1))
        input_ret = input_prices.dropna().tail(predictor.sequence_length)
        
        if len(input_ret) < predictor.sequence_length:
             raise HTTPException(status_code=400, detail="Not enough data for returns calculation.")

        # Clip (same as training)
        input_ret['log_ret'] = input_ret['log_ret'].clip(-0.15, 0.15)
        
        # Scale
        raw_vals = input_ret['log_ret'].values.reshape(-1, 1)
        X_scaled = predictor.scaler.transform(raw_vals)
        X_input = np.expand_dims(X_scaled, axis=0) # (1, seq_len, 1)
        
        # 4. Predict (Output is Scaled Log Returns)
        preds = predictor.predict(X_input)[0] 
        
        # 5. Inverse Transform & Reconstruct Price
        last_price = input_prices['Close'].iloc[-1]
        forecast_results = []
        last_date = history_df['Date'].iloc[-1]
        
        def inverse(val):
            return (val - predictor.scaler.min_[0]) / predictor.scaler.scale_[0]
        
        current_med_price = last_price
        prices_low = []
        prices_high = []
        
        for i in range(len(preds)):
            ret_low = inverse(preds[i, 0])
            ret_med = inverse(preds[i, 1])
            ret_high = inverse(preds[i, 2])
            
            next_price = current_med_price * np.exp(ret_med)
            
            if i == 0:
                price_path_low = last_price * np.exp(ret_low)
                price_path_high = last_price * np.exp(ret_high)
            else:
                 price_path_low = prices_low[-1] * np.exp(ret_low)
                 price_path_high = prices_high[-1] * np.exp(ret_high)
            
            candle_open = current_med_price
            candle_close = next_price
            candle_high = max(price_path_high, candle_open, candle_close)
            candle_low = min(price_path_low, candle_open, candle_close)
            
            current_med_price = next_price
            prices_low.append(price_path_low)
            prices_high.append(price_path_high)

            next_date = last_date + pd.Timedelta(days=i+1)
            
            forecast_results.append({
                "Date": next_date.isoformat(),
                "Close": round(candle_close, 2),
                "Open": round(candle_open, 2),
                "High": round(candle_high, 2),
                "Low": round(candle_low, 2),
                "lower_bound": round(price_path_low, 2),
                "upper_bound": round(price_path_high, 2)
            })
        
        # Format History for Frontend
        formatted_history = history_df.apply(lambda row: {
            "Date": row['Date'].isoformat(),
            "Close": row['Close'],
            "Open": row['Open'],
            "High": row['High'],
            "Low": row['Low'],
            "Volume": row['Volume']
        }, axis=1).tolist()
        
        result = {
            "stock_id": stock_id,
            "history": formatted_history,
            "forecast": forecast_results
        }
        
        # Cache for 10 minutes
        _cache[cache_key] = (result, time.time() + 600)
        
        # Free the fetched DataFrame immediately
        del df, history_df, input_prices, input_ret
        gc.collect()
        
        return result
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
