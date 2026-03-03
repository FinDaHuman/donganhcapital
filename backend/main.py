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
import tensorflow as tf
from models.quantile_lstm import QuantileLSTM
from vnstock import Vnstock
from rate_limiter import RateLimiter, retry_async

# Disable GPU for lighter inference if needed
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

# --- Globals ---
predictor = None
stock_data_store = {} # {stock_id: DataFrame}
MODEL_PATH = "models/vn_stock_predictor"
DATA_DIR = "data"

# Global rate limiter: max 20 calls per minute
rate_limiter = RateLimiter(max_calls=20, period_seconds=60)

async def call_sync_with_retry(sync_func, *args, **kwargs):
    """Execute a synchronous function in a thread with retry and rate limiting."""
    async def wrapper():
        return await asyncio.to_thread(sync_func, *args, **kwargs)
    await rate_limiter.acquire()
    return await retry_async(wrapper)

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
    # Wait a bit on startup before hitting APIs
    await asyncio.sleep(10)
    
    while True:
        try:
            print(f"[{datetime.now().isoformat()}] Polling hourly stock data...")
            tickers = list(stock_data_store.keys())
            # Don't poll VN30F1M here if it gets added to store
            tickers = [t for t in tickers if t != "VN30F1M"]
            
            for index, ticker in enumerate(tickers):
                try:
                    # Fetch data: 5 years for cold start, 30 days for updates
                    df_existing = stock_data_store.get(ticker, pd.DataFrame())
                    if len(df_existing) < 100:
                        start_date = '2019-01-01'
                    else:
                        start_date = (datetime.now() - pd.Timedelta(days=30)).strftime('%Y-%m-%d')
                    
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
                        
                        stock_data_store[ticker] = df_combined
                        print(f"Updated {ticker} hourly. Total rows: {len(df_combined)}")
                except Exception as e:
                    print(f"Error polling {ticker}: {e}")
                
                # Rate limiting: wait 2 seconds between tickers
                await asyncio.sleep(2)
            
            print(f"[{datetime.now().isoformat()}] Completed hourly poll cycle.")
            # Sleep for 1 hour (minus the time taken)
            await asyncio.sleep(3600)
            
        except Exception as e:
            print(f"Error in poll_hourly_stocks loop: {e}")
            await asyncio.sleep(60)

async def poll_vn30f1m():
    global stock_data_store
    print("background task: poll_vn30f1m started")
    # Wait a bit on startup
    await asyncio.sleep(5)
    
    ticker = "VN30F1M"
    while True:
        try:
            end_date = datetime.now().strftime('%Y-%m-%d')
            start_date = (datetime.now() - pd.Timedelta(days=5)).strftime('%Y-%m-%d')
            
            # Note: For VCI, maybe interval='15s' is supported. Let's try it.
            # If not, vnstock might fallback to something else.
            # actually vnstock v3 derivative might not work for 15s. We'll use quote.history and hope for the best...
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
                    stock_data_store[ticker] = df_combined
                else:
                    stock_data_store[ticker] = df_new
                    print(f"Initialized VN30F1M in stock_data_store.")
                
        except Exception as e:
            # print(f"Error polling VN30F1M: {e}") # keep quiet for 15s polling to not flood logs
            pass
            
        await asyncio.sleep(15)

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

@app.get("/api/stocks")
def get_stocks():
    """Return list of all available stock IDs"""
    return {"count": len(stock_data_store), "stocks": list(stock_data_store.keys())}

@app.get("/api/market-status")
def get_market_status():
    """Return latest snapshot for heatmap"""
    results = []
    for ticker, df in stock_data_store.items():
        if len(df) < 2: continue
        last_row = df.iloc[-1]
        prev_row = df.iloc[-2]
        
        # Calculate % change
        # If 'Close' exists
        change = (last_row['Close'] - prev_row['Close']) / prev_row['Close'] * 100
        
        results.append({
            "ticker": ticker,
            "value": float(change), # explicit float conversion
            "size": int(last_row.get('Volume', 1000)) # explicit int conversion
        })
    return results

@app.get("/api/predict/{stock_id}")
async def predict_stock(stock_id: str):
    global predictor, stock_data_store
    
    # 1. Check Model & Data
    if predictor is None:
        raise HTTPException(status_code=503, detail="Prediction model is not loaded.")
    
    stock_id = stock_id.upper()
    if stock_id not in stock_data_store:
        raise HTTPException(status_code=404, detail=f"Stock '{stock_id}' not found in database.")
        
    try:
        # 2. Get History
        df = stock_data_store[stock_id]
        if len(df) < predictor.sequence_length + 1:
             raise HTTPException(status_code=400, detail="Not enough history for this stock.")
             
        # Take last N entries for context visualization
        history_window = 1250 # Approx 5 years of trading days
        history_df = df.tail(history_window).copy()
        
        # 3. Preprocess for Prediction (Compute Log Returns)
        # We need the last SEQUENCE_LENGTH returns. 
        # Note: Return[t] needs Price[t] and Price[t-1].
        # So we need SEQUENCE_LENGTH + 1 prices to get SEQUENCE_LENGTH returns.
        
        input_prices = df.iloc[-(predictor.sequence_length + 1):].copy()
        input_prices['log_ret'] = np.log(input_prices['Close'] / input_prices['Close'].shift(1))
        # Drop the first NaN created by shift
        input_ret = input_prices.dropna().tail(predictor.sequence_length)
        
        if len(input_ret) < predictor.sequence_length:
             raise HTTPException(status_code=400, detail="Not enough data for returns calculation.")

        # Clip (same as training)
        input_ret['log_ret'] = input_ret['log_ret'].clip(-0.15, 0.15)
        
        # Scale
        # Reshape to (seq_len, 1)
        raw_vals = input_ret['log_ret'].values.reshape(-1, 1)
        X_scaled = predictor.scaler.transform(raw_vals)
        X_input = np.expand_dims(X_scaled, axis=0) # (1, seq_len, 1)
        
        # 4. Predict (Output is Scaled Log Returns)
        # Shape: (1, n_steps, 3) -> [lower, median, upper]
        preds = predictor.predict(X_input)[0] 
        
        # 5. Inverse Transform & Reconstruct Price
        # We need to unscale the returns, then apply them to the last known price.
        
        last_price = input_prices['Close'].iloc[-1]
        forecast_results = []
        last_date = history_df['Date'].iloc[-1]
        
        # Scaler is inverse for the RETURNS
        unscaled_preds = predictor.scaler.inverse_transform(preds.reshape(-1, 1)).reshape(preds.shape) # Wait, shape mismatch logic
        # inverse_transform expects 2D (samples, features). 
        # preds is (10, 3). We have 1 feature basically. 
        # Hack: flatten, inverse, reshape.
        
        # Manually inverse for clarity
        min_val = predictor.scaler.data_min_[0]
        max_val = predictor.scaler.data_max_[0]
        scale_ = predictor.scaler.scale_[0]
        
        def inverse(val):
            return (val - predictor.scaler.min_[0]) / predictor.scaler.scale_[0]

        # Simulation:
        # We predict path of Median.
        # Can we predict path of Lower/Upper? 
        # Yes, standard approach: Lower Path = LastPrice * exp(cum_sum(lower_returns))?
        # That assumes worst case every day.
        # Probabilistic cone approach: P(Price_t) = P(Price_t-1) * exp(Ret_t)
        
        current_med_price = last_price
        # For simplicity and robust display:
        # We accumulate the log returns
        
        # Actually, LSTM quantile predicts the quantile of the return distribution at that step.
        # So Median Price[t] = Median Price[t-1] * exp(Median Ret[t])
        
        for i in range(len(preds)):
            ret_low = inverse(preds[i, 0])
            ret_med = inverse(preds[i, 1])
            ret_high = inverse(preds[i, 2])
            
            # Update Prices
            # Simple geometric brownian motion-ish update
            # Ideally we should simulate, but iterative update is fine for forecast
            
            next_price = current_med_price * np.exp(ret_med)
            
            # Bounds: we can apply the predicted return bounds to the *median* price path
            # Or should we maintain separate low/high paths?
            # Separate paths is safer for visual "cone".
            if i == 0:
                price_path_low = last_price * np.exp(ret_low)
                price_path_high = last_price * np.exp(ret_high)
            else:
                 # This expands the cone correctly
                 # Actually, usually we anchor to the median path for the bounds 
                 # to avoid "worst case compounding" which looks unrealistic?
                 # Let's try separate paths for now.
                 price_path_low = prices_low[-1] * np.exp(ret_low)
                 price_path_high = prices_high[-1] * np.exp(ret_high)

            # Pseudo-OHLC for Visualization
            # Open = Previous Close
            # Close = Predicted Median
            # High = Predicted Upper (Risk High)
            # Low = Predicted Lower (Risk Low)
            
            # Ensure High/Low encapsulate the body
            candle_open = current_med_price
            candle_close = next_price
            candle_high = max(price_path_high, candle_open, candle_close)
            candle_low = min(price_path_low, candle_open, candle_close)
            
            # Store for next iteration
            current_med_price = next_price
            
            # Update bounds lists properly for the NEXT step using the CURRENT volatility
            # Note: We calculated ret_low/high for THIS step
            if i == 0:
                 prices_low = [price_path_low]
                 prices_high = [price_path_high]
            else:
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
        
        return {
            "stock_id": stock_id,
            "history": formatted_history,
            "forecast": forecast_results
        }
            
    except HTTPException:
        # Re-raise HTTP exceptions to preserve their status code
        raise
    except Exception as e:
        # import traceback
        # traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
