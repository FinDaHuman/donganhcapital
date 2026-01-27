# Stock Price Prediction App (End-to-End)

An advanced stock prediction application using **FastAPI**, **XGBoost** (Global Model), and **React** (Vite + Plotly).

## Features
- **Global XGBoost Model**: Trained on 70,000+ rows of historical data. Recursively predicts 10 days ahead.
- **Interactive Charts**: Candlestick charts with SMA (5/20), RSI (14), and Confidence Intervals.
- **FastAPI Backend**: Efficient, cached data serving.

## Project Structure
```
/backend
    /app            # API Logic
    /data           # Excel Data source
    /models         # Pre-trained XGBoost model
    Dockerfile      # For container deployment
    Procfile        # For Render/Heroku
    main.py         # Entry point
/frontend
    /src            # React Source
    Dockerfile      # (Optional) For frontend container
```

## How to Run Locally
1. **Windows**: Double-click `run_app.bat`.
2. **Manual**:
   - Backend: `cd backend && python main.py`
   - Frontend: `cd frontend && npm run dev`

## Deployment (Auto-Deploy)

### 1. Backend (Render / Railway / Fly.io)
This repo is configured for auto-deployment.
- **Build Context**: `backend/`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Environment Variables**:
    - `DATA_PATH`: `data/all_stocks.xlsx` (Ensure Dockerfile copies this).

### 2. Frontend (Vercel / Netlify / GitHub Pages)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
    - `VITE_API_URL`: Your deployed backend URL (e.g., `https://my-api.onrender.com/api`)

## Data
The app uses `backend/data/all_stocks.xlsx`. To update data, simple replace this file and restart the backend.
