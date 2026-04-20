# DongAnh Capital Technical Documentation & Architecture Overview

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT) [![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/release/python-3100/) [![React 18](https://img.shields.io/badge/react-18.2.0-blue.svg)](https://react.dev/) [![FastAPI](https://img.shields.io/badge/fastapi-0.109.0-green.svg)](https://fastapi.tiangolo.com/)

## Executive Summary

DongAnh Capital is an advanced, proprietary stock analysis and algorithmic signal generation platform engineered specifically for the Vietnamese equities market. The system integrates real-time market visualization, rigorous technical analysis, and machine learning (XGBoost/LSTM) to deliver actionable trading intelligence.

This repository contains the entirety of the platform's source code, structured as a decoupled, micro-architecture system comprising a React-based Single Page Application (SPA), a highly concurrent FastAPI backend, and an automated ETL/ML data pipeline.

---

## 1. Core System Architecture

The platform is logically partitioned into three independent subsystems to ensure scalability, maintainability, and clear separation of concerns.

### 1.1. Presentation Layer: React SPA (`/frontend`)
The frontend is a modern, responsive Single Page Application optimized for high-density data visualization.
*   **Frameworks:** React 18, Vite (for optimized bundling and HMR).
*   **Styling:** Tailwind CSS for utility-first, consistent design system implementation.
*   **Data Visualization:**
    *   **Plotly.js:** Utilized for rendering complex, interactive sector heatmaps.
    *   **HTML5 Canvas:** Employed for performant, high-frequency rendering of historical price charts and performance metrics, bypassing DOM overhead.
*   **State & Navigation:** Framer Motion manages smooth UI transitions. The `Dashboard.jsx` acts as the primary data orchestrator, implementing a critical gating mechanism that suspends rendering until a minimum threshold of market data (≥ 15 assets) is successfully loaded, preventing UI thrashing.

### 1.2. Application Server: FastAPI Backend (`/backend`)
A high-performance RESTful API serving as the intermediary between the presentation layer, the database, and the inference engine.
*   **Framework:** Python 3.10+ with FastAPI, chosen for its native async capabilities and automatic OpenAPI documentation.
*   **Database ORM:** SQLAlchemy coupled with `psycopg2-binary` for robust interactions with the NeonDB (PostgreSQL) instance.
*   **Inference Engine Integration:** Directly loads and serves pre-trained machine learning models (XGBoost by default, configurable via `USE_XGB=true`) to calculate real-time asset probabilities.
*   **Performance Engineering:**
    *   **TTL Caching:** Implements an in-memory `get_cached` utility within `main.py` to memoize expensive analytical queries (e.g., market overviews, signal summaries), drastically reducing database load during traffic spikes.
    *   **Concurrency Management:** Utilizes `asyncio.Semaphore` to throttle concurrent database connections, protecting the NeonDB instance from connection exhaustion.
    *   **Background Tasks:** Manages an asynchronous polling loop that synchronizes high-frequency VN30F1M derivative data every 60 seconds during active market hours.

### 1.3. ETL & Machine Learning Pipeline (`/daily_suggestion_system`)
An autonomous, scheduled system responsible for data ingestion, feature engineering, and the generation of predictive signals.
*   **Core Libraries:** Python, `vnstock` (market data adapter), XGBoost, TensorFlow, Pandas.
*   **Operational Execution:** Triggered daily via GitHub Actions (`.github/workflows/daily-pipeline.yml`).
*   **Fail-Safe Mechanisms:** Designed to fail closed. If upstream data acquisition (via the VCI source) fails or returns anomalous data, the pipeline halts execution immediately, preventing the generation of signals based on stale or corrupted data.

---

## 2. Data Flow & Operational Lifecycle

The lifeblood of the DongAnh Capital platform is its daily automated pipeline, which updates the system of record and generates trading intelligence.

### 2.1. The Signal Generation Lifecycle
1.  **Data Ingestion (`database_update.py`):** The orchestrator script (`run_daily_pipeline.py`) initiates the update sequence. It fetches the latest OHLC (Open, High, Low, Close) and volume data for approximately 400 tracked equities using the `vnstock` library. *Note: Requests are intentionally paced to respect upstream API rate limits.*
2.  **Feature Engineering (`features/`):** Raw market data is transformed into predictive features. This includes calculating moving averages, identifying price/volume breakouts, and evaluating trend alignment (e.g., SEPA methodology).
3.  **Model Inference (`daily_predict.py`):** The engineered feature set is fed into the active machine learning model (located in `backend/models/xgb_model/`). The model outputs a probability score indicating the likelihood of a positive price movement over the target horizon.
4.  **Signal Persistence:** Assets exceeding the predefined probability threshold generate "Buy" signals, which are inserted into the `ai_signals` database table alongside calculated Take Profit (TP) and Stop Loss (SL) levels.
5.  **Portfolio Management (`trade_manager.py`):** The system evaluates existing "HOLD" positions. If current market prices breach the associated TP or SL levels, the position is closed, and the realized Profit and Loss (PnL) is recorded in the `trade_history` table for performance auditing.

---

## 3. Database Schema Reference (NeonDB)

The platform relies on a normalized PostgreSQL database hosted on NeonDB.

| Table Name | Description | Key Attributes |
| :--- | :--- | :--- |
| `stocks` | Master registry of tracked assets. | `ticker_id`, `exchange`, `industry_classification` |
| `stock_ohlc` | Time-series historical price data. Updated via daily upserts. | `date`, `open`, `high`, `low`, `close`, `volume`, `stock_id` |
| `vnindex_ohlc` | Time-series historical data for the broader VN-Index. | `date`, `open`, `high`, `low`, `close`, `volume` |
| `vn30f1m_intraday`| High-frequency (1-minute) data for the VN30 derivative. | `timestamp`, `price`, `volume` |
| `ai_signals` | Daily generated algorithmic trading recommendations. | `date`, `stock_id`, `entry_price`, `tp_price`, `sl_price`, `probability` |
| `trade_history` | Ledger of simulated trades and outcome analysis. | `entry_date`, `exit_date`, `stock_id`, `realized_pnl`, `duration` |
| `daily_signal_summary`| Aggregated metrics of daily signal generation activity. | `date`, `total_signals`, `sector_breakdown` |

---

## 4. Codebase Navigation

```text
DongAnhCapital/
├── backend/                     # Application Server (FastAPI)
│   ├── db/                      # Database connection and query logic
│   ├── models/                  # Serialized ML models (XGBoost .json files, LSTM .h5)
│   ├── main.py                  # API routing and server entrypoint
│   └── train_xgb.py             # Utility for retraining the XGBoost model
├── daily_suggestion_system/     # ETL & ML Pipeline
│   └── src/
│       ├── daily_pipeline/      # Pipeline orchestration scripts
│       ├── data_access/         # Interfaces for Vnstock and DB writes
│       ├── features/            # Feature engineering logic
│       ├── manager/             # Trade lifecycle management
│       └── training/            # Model training configurations
├── frontend/                    # Presentation Layer (React SPA)
│   └── src/
│       ├── components/          # React components (Dashboard, Charts, Heatmaps)
│       └── services/            # Axios API client configurations
└── .github/workflows/           # CI/CD and automation pipelines
```

---

## 5. Developer Guide: Extending the Platform

### 5.1. Implementing a New API Endpoint
1.  **Data Access:** Define the required SQL execution logic within `backend/db/queries.py` (for raw data) or `backend/db/analytics.py` (for aggregated metrics).
2.  **Routing:** Expose the endpoint in `backend/main.py` using standard FastAPI decorators (e.g., `@app.get("/api/v1/new-resource")`). Ensure comprehensive type hinting for automatic documentation generation.
3.  **Optimization:** If the endpoint performs intensive calculations or queries, encapsulate the logic within the `get_cached(key, func, ttl)` utility to enforce memoization.

### 5.2. Modifying the User Interface
1.  **Component Architecture:** All UI modifications should occur within `frontend/src/components/`. Adhere strictly to functional components and React Hooks.
2.  **Styling Standards:** Utilize Tailwind CSS utility classes exclusively. Avoid creating custom CSS files unless fundamentally necessary for complex animations not supported by Tailwind/Framer.
3.  **Client Integration:** Register any new backend endpoints within the Axios client located at `frontend/src/services/stock_api.js`.

### 5.3. Retraining and Deploying the AI Model
1.  **Training:** Execute the training pipeline located at `daily_suggestion_system/src/training/breakout_training.py` with an updated dataset.
2.  **Export:** The training script will generate serialized artifacts. For XGBoost, this includes booster JSON files, `scaler.pkl`, and `types.pkl`.
3.  **Deployment:** Replace the existing artifacts in `backend/models/xgb_model/` with the newly generated files.
4.  **Verification:** Restart the FastAPI backend and execute a local test run of the prediction endpoint to ensure schema compatibility.

---

## 6. Local Development Environment Setup

### 6.1. Prerequisites
*   Python 3.10 or higher
*   Node.js 18 or higher
*   Access to a NeonDB PostgreSQL instance

### 6.2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```
**Environment Variables (`backend/.env`):**
*   `DATABASE_URL`: Connection string for NeonDB (Must use `sslmode=require`).
*   `USE_XGB`: `true` (default) or `false`.

**Run Server:**
```bash
uvicorn main:app --reload --port 8000
```

### 6.3. Frontend Setup
```bash
cd frontend
npm install
```
**Environment Variables (`frontend/.env`):**
*   `VITE_API_URL`: URL of the local backend (e.g., `http://localhost:8000/api`).

**Run Development Server:**
```bash
npm run dev
```

### 6.4. Executing the Data Pipeline Locally
```bash
cd daily_suggestion_system/src/daily_pipeline
# Ensure PYTHONPATH is correctly set if running outside an IDE
python run_daily_pipeline.py
```

---

## 7. Operational Troubleshooting & Known Behaviors

*   **Database Connection Exhaustion:** The backend mitigates this via `NullPool` in SQLAlchemy. If connection limits are reached locally, ensure no rogue Python processes are holding connections open.
*   **Missing Market Data / Pipeline Failures:** The `vnstock` library relies on third-party APIs (VCI). If the daily pipeline fails, check the GitHub Actions logs. Failures are typically caused by upstream guest limits or API changes. The pipeline is designed to halt to prevent data corruption.
*   **CORS Violations:** Ensure `VITE_API_URL` exactly matches the backend's address. The FastAPI backend employs `CORSMiddleware` configured to allow all origins by default in development.
*   **Empty VN30F1M Charts:** Intraday derivative data is only polled during active trading hours (GMT+7). The charts will naturally be empty during weekends or overnight hours.
