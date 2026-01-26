# Stock Price Prediction App (XGBoost Edition)

## Overview

A scalable web application to predict stock prices using XGBoost with Confidence Interval visualization.

## Tech Stack

- **Backend**: FastAPI, Clean Architecture, XGBoost (Optimized), Caching (LRU).
- **Frontend**: React, Vite, Plotly.js (Candlestick + Confidence Bands).
- **Data**: Microsoft Excel storage.

## Installation for Developers

### Prerequisite

- Python 3.9+
- Node.js

### 1. Backend Setup

```bash
cd backend
python -m venv venv
# Activate venv: .\venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env if needed
python main.py
```

Backend runs on `http://localhost:8000`.

### 2. Frontend Setup

```bash
cd frontend
npm install
# Ensure .env exists with VITE_API_URL
npm run dev
```

Frontend runs on `http://localhost:5173`.

## Architecture Note

- **API**: Modular structure in `app/`.
- **Model**: XGBoost is configured with `n_estimators=50` and `n_jobs=1` to handle concurrency efficiently.
- **Caching**: Predictions are cached until new data arrives to prevent CPU overload.
