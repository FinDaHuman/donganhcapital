# DongAnh Capital - AI Stock Prediction Platform

A comprehensive stock analysis and prediction platform for the Vietnam market ("DongAnh Capital"), featuring a high-fidelity **Finpath Pro** clone frontend and a **Quantile Regression LSTM** backend for probabilistic price forecasting.

## 🚀 Key Features

### Frontend (User Interface)
- **Pixel-Perfect Finpath Clone**: Dark mode aesthetic (`#111213`), professional stock charting, and responsive layout.
- **Market Heatmap**: Real-time (or static demo) treemap visualization of market performance by volume and price change.
- **Pro Charting Workstation**:
    - Interactive **Candlestick Chart** (Open, High, Low, Close).
    - **Prediction Bands**: Visual confidence intervals (5th, 50th, 95th percentiles) for future prices.
    - **Drawing Tools**: Custom toolbar for technical analysis.
    - **Zoom/Pan**: Mouse wheel zooming and drag-to-pan functionality.

### Backend (AI Core)
- **Quantile Regression LSTM**: Advanced Deep Learning model architecture tailored for financial time-series.
    - **Bidirectional LSTM**: Captures both past momentum and reversal patterns.
    - **Confidence Intervals**: Outputs P5, P50 (Median), and P95 price forecasts to model uncertainty (crucial for VN market limits).
- **FastAPI**: High-performance asynchronous API for real-time predictions.
- **Model Loading**: Efficient "Load-Once" architecture using FastAPI lifespan events.

## 🛠 Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Plotly.js, Lucide React.
- **Backend**: Python 3.10+, FastAPI, TensorFlow/Keras, Joblib, Uvicorn.
- **Data**: Excel-based data ingestion (Bluechips & Midcaps).

## 📂 Project Structure

```
DongAnhCapital/
├── frontend/                # React Application
│   ├── src/
│   │   ├── components/      # UI Components (StockChart, Dashboard, MarketBar)
│   │   ├── App.jsx          # Main Router & Layout
│   │   └── main.jsx         # Entry Point
│   └── tailwind.config.js   # Design Tokens (Finpath Colors)
│
├── backend/                 # API & AI Model
│   ├── data/                # Training Data (Excel)
│   ├── models/              # Model Architecture
│   │   └── quantile_lstm.py # The LSTM Class
│   ├── main.py              # FastAPI Application
│   ├── train_and_save.py    # Training Script
│   └── requirements.txt     # Python Dependencies
│
└── README.md                # This file
```

## ⚡ Getting Started

### 1. Backend Setup
```bash
cd backend
# Create virtual environment (optional but recommended)
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Train the Model (Required first time)
python train_and_save.py

# Start the API Server
uvicorn main:app --reload
```
*API will run at `http://localhost:8000`*

### 2. Frontend Setup
```bash
cd frontend
# Install dependencies
npm install

# Start Dev Server
npm run dev
```
*App will open at `http://localhost:5173`*

## 📝 Training the Model
The `train_and_save.py` script automatically:
1. Loads all `.xlsx` files from `backend/data/`.
2. Preprocesses data (Scaling, Sequence Generation).
3. Trains the Quantile LSTM model.
4. Saves the model (`.h5`) and scaler (`.pkl`) to `backend/models/`.

## ⚠️ Notes for Production
- The frontend currently uses a **static fallback** for the Heatmap to avoid CORS issues on Vercel with the external VNDirect API.
- Ensure the backend API URL is correctly configured in the frontend `.env` (currently hardcoded or relative).
