
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
import numpy as np
import pandas as pd
import joblib
import os
import tensorflow as tf
from models.quantile_lstm import QuantileLSTM

# Disable GPU for lighter inference if needed
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

# --- Globals ---
predictor = None
stock_data_store = {} # {stock_id: DataFrame}
MODEL_PATH = "models/vn_stock_predictor"
DATA_DIR = "data"

# --- Helper: Load Data ---
def load_all_data():
    global stock_data_store
    import glob
    print("Loading Stock Data from Excel...")
    all_files = glob.glob(os.path.join(DATA_DIR, "*.xlsx"))
    rename_map = {
        '<Ticker>': 'Ticker', '<DTYYYYMMDD>': 'Date', '<Open>': 'Open', '<High>': 'High', '<Low>': 'Low', '<Close>': 'Close', '<Volume>': 'Volume',
        'Mã CP': 'Ticker', 'Ngày': 'Date', 'Đóng cửa': 'Close', 'Mở cửa': 'Open', 'Cao nhất': 'High', 'Thấp nhất': 'Low', 'KL': 'Volume',
        'stock_id': 'Ticker', 'Ngay': 'Date', 'adj_close': 'Close', 'adj_open': 'Open', 'adj_high': 'High', 'adj_low': 'Low', 'volume': 'Volume'
    }
    
    combined = pd.DataFrame()
    for f in all_files:
        try:
            df = pd.read_excel(f)
            df = df.rename(columns=rename_map)
            # Ensure required columns
            if 'Ticker' in df.columns and 'Date' in df.columns:
                # Convert Date
                df['Date'] = pd.to_datetime(df['Date'])
                combined = pd.concat([combined, df], ignore_index=True)
        except Exception as e:
            print(f"Error loading {f}: {e}")
            
    # Index by Ticker for fast retrieval
    if not combined.empty:
        # Sort
        combined = combined.sort_values(['Ticker', 'Date'])
        # Group
        grouped = combined.groupby('Ticker')
        stock_data_store = {k: v for k, v in grouped}
        print(f"✅ Loaded data for {len(stock_data_store)} stocks.")
        print(f"Sample Tickers: {list(stock_data_store.keys())[:20]}")
    else:
        print("⚠️ No stock data loaded!")

# --- Lifespan for Model Loading ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor
    try:
        # Load Data
        load_all_data()
        
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Endpoints ---
@app.get("/api")
def home():
    return {
        "status": "active", 
        "model_loaded": predictor is not None,
        "stocks_available": len(stock_data_store)
    }

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
        if len(df) < predictor.sequence_length:
             raise HTTPException(status_code=400, detail="Not enough history for this stock.")
             
        # Take last N entries for context
        # We also want to return this "history" to the frontend for charting
        # typically return last 100 or so for context
        history_window = 100
        history_df = df.tail(max(predictor.sequence_length, history_window)).copy()
        
        # 3. Preprocess for Prediction (Last 60 only)
        input_window = history_df.tail(predictor.sequence_length)
        required_cols = predictor.feature_columns
        
        # Ensure cols exist
        missing = [c for c in required_cols if c not in input_window.columns]
        if missing:
             raise HTTPException(status_code=500, detail=f"Data missing columns: {missing}")

        X_scaled = predictor.scaler.transform(input_window[required_cols])
        X_input = np.expand_dims(X_scaled, axis=0)
        
        # 4. Predict
        # Shape: (1, n_steps, 3) -> [lower, median, upper]
        preds = predictor.predict(X_input)[0] 
        
        # 5. Inverse Transform
        target_idx = required_cols.index('Close')
        
        def inverse(val):
            return (val - predictor.scaler.min_[target_idx]) / predictor.scaler.scale_[target_idx]

        forecast_results = []
        last_date = history_df['Date'].iloc[-1]
        
        for i in range(len(preds)):
            pred_med = inverse(preds[i, 1])
            pred_low = inverse(preds[i, 0])
            pred_high = inverse(preds[i, 2])
            
            # Future Date logic (skipping weekends roughly or just add days)
            # Simple day add for now
            next_date = last_date + pd.Timedelta(days=i+1)
            
            forecast_results.append({
                "Date": next_date.isoformat(),
                "Close": round(pred_med, 2),
                "Open": round(pred_med, 2), # Placeholder
                "High": round(pred_high, 2), # Use bounds as proxy
                "Low": round(pred_low, 2),
                "lower_bound": round(pred_low, 2),
                "upper_bound": round(pred_high, 2)
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
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
