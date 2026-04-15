# DongAnh Capital

DongAnh Capital is a Vietnam-market stock analysis platform with three main parts:

- a React SPA for market visualization and signal review
- a FastAPI backend serving market, analytics, and prediction endpoints
- a daily Python pipeline that refreshes NeonDB and generates AI signals

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/react-18.2.0-blue.svg)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/fastapi-0.109.0-green.svg)](https://fastapi.tiangolo.com/)

## What It Does

- Serves a stock dashboard with sector heatmaps, market summaries, and charting.
- Stores market data and signal history in NeonDB PostgreSQL.
- Runs an AI signal pipeline that updates market data, generates signals, and tracks trade outcomes.
- Exposes analytics endpoints for pipeline health, signal performance, and market intelligence.
- Syncs VN30F1M intraday data separately from the end-of-day signal pipeline.

## Current Data Flow

The codebase currently uses `vnstock==3.5.1` and fetches quote history through direct `Quote(..., source="VCI")` calls.

- Stock OHLC refresh: [daily_suggestion_system/src/data_update/stock_ohlc_update.py](daily_suggestion_system/src/data_update/stock_ohlc_update.py)
- VNINDEX refresh: [daily_suggestion_system/src/data_update/vnindex_ohlc_update.py](daily_suggestion_system/src/data_update/vnindex_ohlc_update.py)
- VN30F1M intraday refresh: [daily_suggestion_system/src/daily_pipeline/vn30f1m_update.py](daily_suggestion_system/src/daily_pipeline/vn30f1m_update.py)
- Backend intraday sync path: [backend/main.py](backend/main.py)

This avoids the broken `Vnstock().stock(...).quote` wrapper path for VCI and preserves VCI-level precision for stocks, VNINDEX, and VN30F1M.

## Daily Pipeline Behavior

The daily GitHub Actions job runs:

- [.github/workflows/daily-pipeline.yml](.github/workflows/daily-pipeline.yml)
- entrypoint: [daily_suggestion_system/src/daily_pipeline/run_daily_pipeline.py](daily_suggestion_system/src/daily_pipeline/run_daily_pipeline.py)

Execution order:

1. Database update
2. Signal generation
3. VN30F1M intraday update

Important operational details:

- The stock updater deduplicates tickers before downloading.
- Requests are intentionally paced to stay under the VCI guest limit envelope.
- Stock OHLC and VNINDEX writes use upsert behavior.
- If database update fails, the pipeline exits before prediction to avoid using stale data.
- The workflow sets UTF-8 environment variables to prevent vnstock console encoding issues in GitHub Actions.

## Architecture

### Frontend

Path: [frontend](frontend)

- React 18 + Vite
- Plotly heatmap and lightweight charting
- Axios for API calls
- Framer Motion for motion and transitions

Key files:

- [frontend/src/App.jsx](frontend/src/App.jsx)
- [frontend/src/components](frontend/src/components)
- [frontend/src/services](frontend/src/services)

### Backend API

Path: [backend](backend)

- FastAPI application in [backend/main.py](backend/main.py)
- SQLAlchemy + `psycopg2-binary` for NeonDB access
- XGBoost is the default prediction model path via `USE_XGB=true`
- Supports cached reads for common market and analytics endpoints

Selected endpoints:

- `GET /api/health`
- `GET /api/stocks`
- `GET /api/market-status`
- `GET /api/vnindex`
- `GET /api/ai-signals`
- `GET /api/ai-signals/dates`
- `GET /api/ai-signals/summary`
- `GET /api/trade-history`
- `GET /api/trade-history/stats`
- `GET /api/analytics/overview`
- `GET /api/analytics/bootstrap`
- `GET /api/analytics/market`
- `GET /api/analytics/signals`
- `GET /api/analytics/trades`
- `GET /api/analytics/pipeline-health`
- `GET /api/sectors`
- `GET /api/ohlc/{stock_id}`
- `GET /api/predict/{stock_id}`

### Daily Suggestion System

Path: [daily_suggestion_system](daily_suggestion_system)

Main responsibilities:

- refresh stock OHLC into `stock_ohlc`
- refresh VNINDEX into `vnindex_ohlc`
- generate AI signals into `ai_signals`
- update `daily_signal_summary`
- manage trade lifecycle records
- refresh `vn30f1m_intraday`

Key files:

- [daily_suggestion_system/src/daily_pipeline/run_daily_pipeline.py](daily_suggestion_system/src/daily_pipeline/run_daily_pipeline.py)
- [daily_suggestion_system/src/daily_pipeline/database_update.py](daily_suggestion_system/src/daily_pipeline/database_update.py)
- [daily_suggestion_system/src/daily_pipeline/daily_predict.py](daily_suggestion_system/src/daily_pipeline/daily_predict.py)
- [daily_suggestion_system/src/manager/trade_manager.py](daily_suggestion_system/src/manager/trade_manager.py)

## Project Structure

```text
DongAnhCapital/
|-- frontend/                    React SPA
|-- backend/                     FastAPI API and model-serving layer
|-- daily_suggestion_system/     Data refresh and signal pipeline
|-- .github/workflows/           CI/CD workflows
|-- README.md
`-- AGENTS.md
```

## Setup

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Required environment variables:

- `DATABASE_URL`
- `USE_XGB` optional, defaults to `true`

Run locally:

```bash
cd backend
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Daily Pipeline

Run manually from the same path used in CI:

```bash
cd daily_suggestion_system/src/daily_pipeline
python run_daily_pipeline.py
```

## Notes

- NeonDB is the production system of record for market data, signals, summaries, and trade history.
- The current pipeline is designed to fail closed on market-data refresh errors rather than continue into prediction with stale inputs.
- The GitHub Actions daily workflow is scheduled for weekdays at `08:02 UTC`, which is `15:02` Vietnam time.
