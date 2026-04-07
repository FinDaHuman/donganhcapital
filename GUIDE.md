# 📘 DongAnh Capital Operations Guide

This guide provides technical instructions for configuring, running, and deploying the DongAnh Capital platform.

---

## 🛠️ 1. Local Configuration

### NeonDB Connection
The platform uses **NeonDB (PostgreSQL)** for all persistent storage.
1.  Obtain your connection string from the Neon Console.
2.  Set the `DATABASE_URL` environment variable in `backend/.env` and `daily_suggestion_system/.env` (if applicable).
    ```bash
    DATABASE_URL="postgresql://user:pass@ep-hostname.region.aws.neon.tech/neondb?sslmode=require"
    ```

### Environment Variables
- **Backend (`backend/.env`)**:
  - `DATABASE_URL`: Connection string for NeonDB.
  - `USE_XGB`: Set to `true` (default) for XGBoost, `false` for LSTM.
  - `PORT`: API port (default: 8000).
- **Frontend (`frontend/.env`)**:
  - `VITE_API_URL`: Backend API URL (local: `http://localhost:8000/api`).

---

## 🚀 2. AI Signal & Trade Pipeline

The **Daily Suggestion System** handles data ingestion, signal generation, and portfolio tracking.

### Running the Unified Pipeline
To trigger a full update (Data -> Signals -> Positions):
1.  Navigate to `daily_suggestion_system/src/daily_pipeline/`.
2.  Run the orchestrator: 
    ```bash
    python run_daily_pipeline.py
    ```
3.  This script executes:
    -   `database_update.py`: Fetches latest OHLC from Vnstock.
    -   `daily_predict.py`: Runs ML models, generates new signals, and updates `TradeManager`.
    -   `vn30f1m_update.py`: Performs a one-time intraday sync for the VN30 derivative.

### Portfolio Management
The `TradeManager` (inside `daily_predict.py`) automatically:
-   Checks if existing "HOLD" positions hit **TP** (Target Price) or **SL** (Stop Loss).
-   Moves completed trades to the `trade_history` table.
-   Calculates realized returns and holding periods.

---

## ☁️ 3. Deployment

### A. Backend (FastAPI)
- **Root Directory**: `backend`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Real-time Polling**: The backend includes an `asyncio` task that polls VN30F1M every 60s when the market is open.

### B. Frontend (Vite)
- **Framework Preset**: Vite
- **Root Directory**: `frontend`
- **Environment Variable**: `VITE_API_URL` should point to your backend (e.g., `https://api.donganhcapital.com/api`).

---

## 📊 4. Database Schema Reference

Key tables in NeonDB:
- **`stocks`**: Registry of tickers.
- **`stock_ohlc`**: Daily historical data (columns: `Ngay`, `open`, `high`, `low`, `close`, `volume`, `stock_id`).
- **`vnindex_ohlc`**: VNINDEX historical data.
- **`vn30f1m_intraday`**: 1-minute interval data for the derivative.
- **`ai_signals`**: Daily recommendations (`date`, `stock_id`, `entry_price`, `tp_price`, `sl_price`, `prob`).
- **`daily_signal_summary`**: History of signal counts per day.
- **`trade_history`**: Record of all simulated trades and their outcomes.

---

## 🧪 5. Troubleshooting
- **Model Loading**: If `predictor is None`, ensure the `backend/models/xgb_model` folder (or LSTM `.h5` file) exists.
- **VN30F1M Missing**: If the chart is empty, check `vn30f1m_intraday` table. The background poller requires the market to be open (GMT+7).
- **CORS Issues**: The backend allows all origins by default, but ensure `VITE_API_URL` in the frontend ends with `/api` or matches the backend's expected path.
- **NeonDB Limits**: If you hit connection limits, ensure `NullPool` is used in `backend/db/connection.py` to avoid persistent idle connections.
