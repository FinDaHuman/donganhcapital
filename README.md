# DongAnh Capital - AI Stock Prediction & Signal Platform

DongAnh Capital is a professional stock analysis and AI prediction platform tailored for the Vietnam market. It combines high-fidelity market visualization with advanced Machine Learning models to provide actionable insights for investors.

---

## 🚀 Key Features

### 📊 Market Visualization
- **Pro Charting Workstation**: High-performance Canvas-based candlestick charts with real-time zoom/pan and AI forecast bands.
- **Market Heatmap**: Interactive Plotly-based treemap for sector-wide performance tracking.
- **VNINDEX Analytics**: Real-time integration and historical tracking of the Vietnam index.

### 🤖 AI Prediction & Signals
- **Hybrid AI Models**: Support for both **XGBoost** (momentum-based) and **Quantile LSTM** (probabilistic forecasting).
- **Daily AI Signals**: Automated pipeline generating Buy/Sell suggestions with Entry, Target (TP), and Stop Loss (SL) levels.
- **Confidence Bands**: Visual P5/P50/P95 forecast intervals to quantify market uncertainty.

### 🏛️ Architecture & Data
- **Real-time Data**: Integrated with **Vnstock/VCI** for latest market data.
- **NeonDB Scaling**: Cloud-native PostgreSQL (NeonDB) architecture for reliable and scalable data storage.
- **FastAPI Core**: Asynchronous, high-performance API backend.

---

## 🛠 Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Plotly.js, Framer Motion.
- **Backend**: Python 3.10+, FastAPI, SQLAlchemy, NeonDB.
- **AI/ML Core**: TensorFlow 2.15 (LSTM), XGBoost, Scikit-learn.

---

## 📂 Project Structure

```text
DongAnhCapital/
├── frontend/                 # React Application (Vite)
│   ├── src/
│   │   ├── components/       # UI (Dashboard, StockChart, Heatmap)
│   │   ├── services/         # API integration (stock_api.js)
│   │   └── App.jsx           # SPA Main Router
│
├── backend/                  # FastAPI & AI Backend
│   ├── db/                   # NeonDB Connection & Queries
│   ├── models/               # XGBoost & LSTM Model architectures
│   ├── data/                 # Training datasets (Excel/Parquet)
│   └── main.py               # API Entry Point (FastAPI)
│
├── daily_suggestion_system/  # AI Signal Generation Pipeline
│   ├── daily_pipeline/       # Automation scripts
│   └── signals/              # Signal logic and backtesting
│
└── Documentations/           # Comprehensive SRS & Project Docs
```

---

## ⚡ Getting Started

### 1. Backend Setup
```bash
cd backend
# Create & activate venv
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure Environment (.env)
# DATABASE_URL=postgresql://user:pass@ep-hostname.region.aws.neon.tech/neondb

# Start Server
uvicorn main:app --reload
```

### 2. Frontend Setup
```bash
cd frontend
# Install dependencies
npm install

# Start Dev Server
npm run dev
```

---

## 📝 Training & Signals
- **Retraining**: Run `python backend/train_and_save.py` (ensure `backend/data` has latest OHLC data).
- **Signal Generation**: Navigate to `daily_suggestion_system` and execute the pipeline scripts to update NeonDB signals.

---

## ⚠️ Notes
- The platform is designed as a **Single Page Application (SPA)**. Start from the landing page and click "Get Started" to access the dashboard.
- Prediction models require at least 60 trading days of history to generate valid forecasts.

---

## 👥 Contributors
- **[Fullstack]** - Trần Huy Tuấn
- **[Data Analyst]** - 
- **[Data Engineer]** - Nguyễn Nhật Minh
- **[AI Engineer]** - Đoàn Minh Hiếu
- **[AI Engineer]** - 
