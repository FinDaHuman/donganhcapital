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
from fastapi import Depends
from typing import Any, Optional
import time

from db.queries import (
    get_stocks_from_db, get_stock_ohlc, 
    get_market_status_from_db, get_vnindex_from_db,
    get_ai_signals_dates, get_ai_signals
)

# Disable GPU for lighter inference if needed
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

# --- Globals ---
USE_XGB = os.getenv("USE_XGB", "true").lower() == "true"
predictor = None
DATA_DIR = "data"
MAX_ROWS_PER_TICKER = 60  # Keep only ~60 trading days to save memory

# Concurrency limiter for incoming requests (max 5 simultaneous users)
concurrency_limiter = asyncio.Semaphore(5)
# Simple in‑memory cache with TTL
_cache: dict[str, tuple[Any, float]] = {}

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

# --- Lifespan for Model Loading ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor
    
    try:
        if USE_XGB:
            from models.xgb_predictor import XGBPredictor
            model_path = os.path.join(os.path.dirname(__file__), "models", "xgb_model")
            predictor = XGBPredictor.load(model_path)
        else:
            from models.quantile_lstm import QuantileLSTM
            model_path = os.path.join(os.path.dirname(__file__), "models", "vn_stock_predictor")
            predictor = QuantileLSTM.load(model_path)
        print(f"Prediction Model loaded successfully (XGB: {USE_XGB}).")
    except Exception as e:
        print(f"Prediction model load error: {e}")
    
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
    stocks = get_stocks_from_db()
    return {
        "status": "active", 
        "model_loaded": predictor is not None,
        "stocks_available": len(stocks)
    }

@app.get("/api/health")
def health():
    """Simple health check endpoint"""
    return {"status": "ok", "model_loaded": predictor is not None}

@app.get("/api/loading-progress")
def loading_progress():
    """Return how many stocks have been loaded. For NeonDB we assume all are instantly loaded."""
    stocks = get_stocks_from_db()
    return {"loaded": len(stocks), "total": len(stocks)}

@app.get("/api/stocks")
async def get_stocks(concurrency: Any = Depends(limit_concurrency)):
    """Return list of all available stock IDs (cached 120s)"""
    def compute():
        stocks = get_stocks_from_db()
        return {"count": len(stocks), "stocks": stocks}
    return get_cached("stocks", 120, compute)

@app.get("/api/market-status")
async def get_market_status(concurrency: Any = Depends(limit_concurrency)):
    """Return latest snapshot for heatmap (cached 120s)"""
    def compute():
        return get_market_status_from_db()
    return get_cached("market_status", 120, compute)

@app.get("/api/vnindex")
async def get_vnindex_endpoint(limit: Optional[int] = None, concurrency: Any = Depends(limit_concurrency)):
    """Return VNINDEX data"""
    def compute():
        df = get_vnindex_from_db(limit)
        if df.empty:
            return []
        
        # Convert Timestamp to ISO format string
        df['Date'] = df['Date'].apply(lambda x: x.isoformat() if pd.notnull(x) else None)
        return df.to_dict(orient="records")
    return get_cached(f"vnindex_{limit}", 120, compute)

@app.get("/api/ai-signals")
async def get_ai_signals_endpoint(date: Optional[str] = None, latest: bool = False, concurrency: Any = Depends(limit_concurrency)):
    """Return AI signals for a specific date or latest"""
    def compute():
        return get_ai_signals(date, latest)
    # cache for 2 mins
    cache_key = f"ai_signals_{date}_{latest}"
    return get_cached(cache_key, 120, compute)

@app.get("/api/ai-signals/dates")
async def get_ai_signals_dates_endpoint(concurrency: Any = Depends(limit_concurrency)):
    """Return list of dates that have AI signals"""
    def compute():
        return get_ai_signals_dates()
    return get_cached("ai_signals_dates", 120, compute)

@app.get("/api/sectors")
async def get_sectors_endpoint(concurrency: Any = Depends(limit_concurrency)):
    """Read categories.txt and return Sector -> [tickers] mapping"""
    def compute():
        try:
            import os
            path1 = "config/categories.txt"
            path2 = "../daily_suggestion_system/categories.txt"
            target_path = path1 if os.path.exists(path1) else path2
            
            with open(target_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                
            sectors = {}
            for line in lines[2:]:
                line = line.strip()
                if not line or ':' not in line:
                    continue
                sector, tickers_str = line.split(':', 1)
                tickers = [t.strip() for t in tickers_str.split(',') if t.strip()]
                sectors[sector.strip()] = tickers
            return sectors
        except Exception as e:
            print(f"Error loading sectors: {e}")
            return {}
            
    return get_cached("sectors", 3600, compute)

@app.get("/api/ohlc/{stock_id}")
async def get_ohlc(stock_id: str, limit: Optional[int] = None, concurrency: Any = Depends(limit_concurrency)):
    """Return stock OHLC data"""
    def compute():
        df = get_stock_ohlc(stock_id, limit)
        if df.empty:
            return []
        
        # formatted data
        formatted = df.apply(lambda row: {
            "Date": row['Date'].isoformat() if pd.notnull(row['Date']) else None,
            "Close": row['Close'],
            "Open": row['Open'],
            "High": row['High'],
            "Low": row['Low'],
            "Volume": row['Volume']
        }, axis=1).tolist()
        return formatted
    return get_cached(f"ohlc_{stock_id}_{limit}", 120, compute)

@app.get("/api/predict/{stock_id}")
async def predict_stock(stock_id: str, concurrency: Any = Depends(limit_concurrency)):
    global predictor
    
    # 1. Check Model & Data
    if predictor is None:
        raise HTTPException(status_code=503, detail="Prediction model is not loaded.")
    
    stock_id = stock_id.upper()
        
    try:
        cache_key = f"predict_{stock_id}"
        cached = _cache.get(cache_key)
        if cached and time.time() < cached[1]:
            return cached[0]
        
        # Fetch enough data for the model (sequence_length + buffer)
        needed_days = max(int(predictor.sequence_length) * 3, 120)  # ~120 trading days
        df = get_stock_ohlc(stock_id, limit=needed_days)
        
        if df is None or df.empty:
            raise HTTPException(status_code=400, detail="Could not fetch data for prediction.")
        
        if len(df) < predictor.sequence_length + 1:
             raise HTTPException(status_code=400, detail="Not enough history for this stock.")
             
        # Take last N entries for context visualization
        history_window = min(len(df), 250)
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
        last_price = float(input_prices['Close'].iloc[-1])
        forecast_results = []
        last_date = history_df['Date'].iloc[-1]
        
        def inverse_transform(val):
            return float(predictor.scaler.inverse_transform([[val]])[0][0])
        
        current_med_price = last_price
        prices_low = []
        prices_high = []
        
        for i in range(len(preds)):
            ret_low = inverse_transform(preds[i, 0])
            ret_med = inverse_transform(preds[i, 1])
            ret_high = inverse_transform(preds[i, 2])
            
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
                "Close": round(float(candle_close), 2),
                "Open": round(float(candle_open), 2),
                "High": round(float(candle_high), 2),
                "Low": round(float(candle_low), 2),
                "lower_bound": round(float(price_path_low), 2),
                "upper_bound": round(float(price_path_high), 2)
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
