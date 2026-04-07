# DongAnh Capital - AI Stock Prediction & Signal Platform

DongAnh Capital is a professional stock analysis and AI prediction platform tailored for the Vietnam market. It combines high-fidelity market visualization with advanced Machine Learning models to provide actionable insights for investors.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/react-18.2.0-blue.svg)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/fastapi-0.109.0-green.svg)](https://fastapi.tiangolo.com/)

---

## 🚀 Key Features

### 📊 Market Visualization

- **Interactive Dashboard**: Real-time market heatmap using Plotly treemap visualization by sector, with automatic small-cap grouping.
- **Pro Charting Workstation**: High-performance Canvas-based candlestick charts with real-time zoom/pan and 10-day AI forecasts.
- **VNINDEX Analytics**: Historical tracking and real-time visualization of the Vietnam index.
- **Market Statistics**: Volume, value, and breadth indicators with live updates.

### 🤖 AI Prediction & Signals

- **Hybrid AI Models**:
  - **Quantile LSTM**: Probabilistic forecasting with P5/P50/P95 confidence bands (TensorFlow).
  - **XGBoost**: Momentum-based predictions with quantile regression (Default).
- **10-Day Forecast Horizon**: Both models predict 10 trading days ahead using 60-day historical sequences.
- **Daily AI Signals**: Automated pipeline generating Buy/Sell suggestions with Entry, Target (TP), and Stop Loss (SL) levels.
- **Portfolio Tracking**: Automated trade execution simulation and history tracking (TP/SL/Timeout/Hold).

### 🏛️ Data & Architecture

- **Real-time Data**: Integrated with **Vnstock/VCI** for latest Vietnam market data and intraday VN30F1M updates.
- **NeonDB Scaling**: Cloud-native PostgreSQL (NeonDB) for reliable and scalable data storage.
- **FastAPI Backend**: Asynchronous, high-performance API with concurrency limiting and in-memory caching.
- **Daily Automation**: Scheduled pipeline for data updates, signal generation, and position management.

---

## 🛠 Tech Stack

### Frontend

- **Framework**: React 18.2.0 with Vite
- **Styling**: Tailwind CSS with custom dark theme (#111213, #1a1c1e)
- **Charts**: Plotly.js 2.27.0 (Heatmap) and Custom Canvas (Stock Charts)
- **Animations**: Framer Motion 12.35.1
- **HTTP Client**: Axios 1.6.0
- **Icons**: Lucide React 0.563.0

### Backend

- **Framework**: FastAPI 0.109.0 with Uvicorn 0.27.0
- **Data Processing**: Pandas, NumPy
- **Database**: SQLAlchemy with Psycopg2-binary for NeonDB PostgreSQL
- **AI/ML**:
  - TensorFlow 2.15 (Quantile LSTM)
  - XGBoost (Quantile regression)
  - Scikit-learn, Joblib
- **Environment**: Python 3.10+

### Data Pipeline

- **Source**: Vnstock library for Vietnam market data (VCI/TCBS sources)
- **Storage**: PostgreSQL with tables for stocks, OHLC data, AI signals, trade history, and daily summaries.
- **Automation**: Daily pipeline scripts for data updates, signal generation, and trade management.

---

## 📂 Project Structure

```
DongAnhCapital/
├── frontend/                          # React SPA Application
│   ├── src/
│   │   ├── components/                # UI Components (Dashboard, StockChart, AIAnalystTab)
│   │   ├── services/                  # API integration layer (stock_api.js)
│   │   └── App.jsx                    # Main SPA router
│   ├── package.json                   # Frontend dependencies
│   └── vite.config.js                 # Vite configuration
│
├── backend/                           # FastAPI Backend & AI Models
│   ├── main.py                        # API entry point & Real-time pollers
│   ├── db/
│   │   ├── connection.py              # NeonDB connection pool
│   │   └── queries.py                 # Database abstraction layer
│   ├── models/
│   │   ├── quantile_lstm.py           # TensorFlow LSTM model
│   │   ├── xgb_predictor.py           # XGBoost predictor
│   │   └── xgb_model/                 # Trained XGBoost model files
│   └── requirements.txt               # Python dependencies
│
└── daily_suggestion_system/           # AI Signal Generation Pipeline
    ├── src/
    │   ├── daily_pipeline/
    │   │   ├── run_daily_pipeline.py  # Main pipeline orchestrator
    │   │   ├── vn30f1m_update.py      # VN30F1M intraday update
    │   │   ├── daily_predict.py       # Signal generation & Trade management
    │   │   └── database_update.py     # Data refresh scripts
    │   ├── manager/
    │   │   └── trade_manager.py       # Portfolio & Position management
    │   └── data_access/               # Pipeline database layer
    └── categories.txt                 # Sector classifications
```

---

## ⚡ Quick Start

### 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # venv\Scripts\activate on Windows
pip install -r requirements.txt
# Create .env with DATABASE_URL and USE_XGB=true
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

## 📊 API Endpoints

### Core & Market Data
- `GET /api/stocks` - List all tickers
- `GET /api/market-status` - Snapshot for heatmap
- `GET /api/vnindex` - VNINDEX historical data
- `GET /api/sectors` - Sector mappings
- `GET /api/ohlc/{stock_id}` - Historical OHLC

### AI & Predictions
- `GET /api/predict/{stock_id}` - 10-day AI forecast
- `GET /api/ai-signals` - Trading signals (Buy/Sell)
- `GET /api/ai-signals/summary` - Daily signal counts

### Portfolio & History
- `GET /api/trade-history` - Closed and open trade records
- `GET /api/trade-history/stats` - Portfolio performance metrics (Win Rate, Avg Return)

---

## 🔄 Daily Pipeline

The pipeline automates the entire system:
1. **Database Update**: Fetches latest OHLC for all stocks.
2. **Signal Generation**: Runs the ML model to find breakout opportunities.
3. **Trade Management**: Updates existing positions (checks TP/SL) and records history.
4. **Intraday Updates**: Continuously polls VN30F1M during market hours.

Run it manually:
```bash
python daily_suggestion_system/src/daily_pipeline/run_daily_pipeline.py
```

---

*Built with ❤️ for Vietnam's stock market community*
