# 📘 DongAnh Capital Operations Guide

This guide provides technical instructions for configuring, running, and deploying the DongAnh Capital platform.

---

## 🛠️ 1. Local Configuration

### NeonDB Connection
The platform uses **NeonDB (PostgreSQL)** for all persistent storage. To connect your local backend:
1.  Obtain your connection string from the Neon Console.
2.  Set the `DATABASE_URL` environment variable:
    ```bash
    # Example format
    export DATABASE_URL="postgresql://user:pass@ep-hostname.region.aws.neon.tech/neondb?sslmode=require"
    ```
3.  The backend uses SQLAlchemy with `psycopg2-binary` to interact with the database.

### Environment Variables
- **Backend (`backend/.env`)**:
  - `DATABASE_URL`: Connection string for NeonDB.
  - `USE_XGB`: Set to `true` (default) for XGBoost, `false` for LSTM.
  - `PORT`: API port (default: 8000).
- **Frontend (`frontend/.env`)**:
  - `VITE_API_URL`: Backend API URL (local: `http://localhost:8000`).

---

## 🚀 2. AI Signal Pipeline

The **Daily Suggestion System** generates AI-driven buy/sell signals.

### Running the Pipeline
To manually trigger a signal update:
1.  Navigate to `daily_suggestion_system/`.
2.  Install requirements: `pip install -r requirements.txt`.
3.  Run the main pipeline: `python -m daily_pipeline.run` (or similar entry point).
4.  This script will:
    -   Fetch latest OHLC from NeonDB.
    -   Run signals logic.
    -   Write results back to `ai_signals` and `daily_signal_summary` tables.

---

## ☁️ 3. Deployment

### A. Backend (Render.com)
- **Root Directory**: `backend`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Model Files**: Ensure `backend/models/xgb_model` or `vn_stock_predictor` is committed. If using Git LFS, ensure Render supports it or train as part of the build step.

### B. Frontend (Vercel)
- **Framework Preset**: Vite
- **Root Directory**: `frontend`
- **Output Directory**: `dist`
- **Environment Variable**: Set `VITE_API_URL` to your Render backend URL.

---

## 📊 4. Database Schema Reference

The platform relies on the following key tables in NeonDB:
- **`stocks`**: List of all available tickers.
- **`stock_ohlc`**: Historical price data (Open, High, Low, Close, Volume).
- **`vnindex_ohlc`**: Historical data for the VNINDEX.
- **`ai_signals`**: Generated AI Buy/Sell recommendations.
- **`daily_signal_summary`**: Aggregate counts of signals per day.

---

## 🧪 5. Troubleshooting
- **Missing Predicton**: If the API returns a 503 error, the model files are likely missing from `backend/models/`. Run `python backend/train_and_save.py` locally first.
- **Connection Refused**: Ensure the backend is running and `VITE_API_URL` in the frontend exactly matches the backend host (including port).
- **Data Gaps**: The background poller requires a stable internet connection to reach Vnstock APIs. Check backend logs for rate-limiting errors.
