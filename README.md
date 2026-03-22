# DongAnh Capital - AI Stock Prediction & Signal Platform

DongAnh Capital is a professional stock analysis and AI prediction platform tailored for the Vietnam market. It combines high-fidelity market visualization with advanced Machine Learning models to provide actionable insights for investors.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/react-18.2.0-blue.svg)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/fastapi-0.109.0-green.svg)](https://fastapi.tiangolo.com/)

---

## 🚀 Key Features

### 📊 Market Visualization

- **Interactive Dashboard**: Real-time market heatmap using Plotly treemap visualization by sector
- **Pro Charting Workstation**: High-performance Canvas-based candlestick charts with real-time zoom/pan
- **VNINDEX Analytics**: Real-time integration and historical tracking of the Vietnam index
- **Market Statistics**: Volume, value, and breadth indicators with live updates

### 🤖 AI Prediction & Signals

- **Hybrid AI Models**:
  - **Quantile LSTM**: Probabilistic forecasting with P5/P50/P95 confidence bands (TensorFlow)
  - **XGBoost**: Momentum-based predictions with quantile regression
- **10-Day Forecast Horizon**: Both models predict 10 trading days ahead using 60-day historical sequences
- **Daily AI Signals**: Automated pipeline generating Buy/Sell suggestions with Entry, Target (TP), and Stop Loss (SL) levels
- **Confidence Intervals**: Visual uncertainty quantification for all predictions

### 🏛️ Data & Architecture

- **Real-time Data**: Integrated with **Vnstock/VCI** for latest Vietnam market data
- **NeonDB Scaling**: Cloud-native PostgreSQL (NeonDB) for reliable and scalable data storage
- **FastAPI Backend**: Asynchronous, high-performance API with concurrency limiting (max 5 simultaneous users)
- **Daily Automation**: Scheduled pipeline for signal generation and data updates

---

## 🛠 Tech Stack

### Frontend

- **Framework**: React 18.2.0 with Vite
- **Styling**: Tailwind CSS with custom dark theme (#111213, #1a1c1e)
- **Charts**: Plotly.js 2.27.0 for interactive visualizations
- **Animations**: Framer Motion 12.35.1
- **HTTP Client**: Axios 1.6.0
- **Icons**: Lucide React 0.563.0
- **3D Elements**: Spline (React Spline 4.1.0)

### Backend

- **Framework**: FastAPI 0.109.0 with Uvicorn 0.27.0
- **Data Processing**: Pandas, NumPy
- **Database**: SQLAlchemy with Psycopg2-binary for NeonDB PostgreSQL
- **AI/ML**:
  - TensorFlow 2.15 (Quantile LSTM)
  - XGBoost (Quantile regression)
  - Scikit-learn, Joblib
- **Environment**: Python 3.10+

### AI Models

- **QuantileLSTM**: Bidirectional LSTM with custom quantile loss (sequence_length=60, n_steps=10, quantiles=[0.05, 0.5, 0.95])
- **XGBPredictor**: Ensemble of quantile regressors per prediction step (sequence_length=10, n_steps=10)

### Data Pipeline

- **Source**: Vnstock library for Vietnam market data
- **Storage**: PostgreSQL with tables for stocks, OHLC data, AI signals, trade history
- **Automation**: Daily pipeline scripts for data updates and signal generation

---

## 📂 Project Structure

```
DongAnhCapital/
├── frontend/                          # React SPA Application
│   ├── src/
│   │   ├── components/                # UI Components
│   │   │   ├── Dashboard.jsx          # Market heatmap dashboard
│   │   │   ├── StockChart.jsx         # Interactive candlestick charts
│   │   │   ├── AIAnalystTab.jsx       # AI signals interface
│   │   │   ├── LandingPage.jsx        # Marketing landing page
│   │   │   └── Header.jsx             # Navigation header
│   │   ├── services/
│   │   │   └── stock_api.js           # API integration layer
│   │   └── App.jsx                    # Main SPA router
│   ├── package.json                   # Frontend dependencies
│   └── vite.config.js                 # Vite configuration
│
├── backend/                           # FastAPI Backend & AI Models
│   ├── main.py                        # API entry point with endpoints
│   ├── db/
│   │   ├── connection.py              # NeonDB connection
│   │   └── queries.py                 # Database operations
│   ├── models/
│   │   ├── quantile_lstm.py           # TensorFlow LSTM model
│   │   ├── xgb_predictor.py           # XGBoost predictor
│   │   └── vn_stock_predictor_model.h5 # Trained LSTM weights
│   ├── xgb_model/                     # XGBoost model files
│   ├── train_and_save.py              # Model training script
│   └── requirements.txt               # Python dependencies
│
├── daily_suggestion_system/           # AI Signal Generation Pipeline
│   ├── src/
│   │   ├── daily_pipeline/
│   │   │   ├── run_daily_pipeline.py  # Main pipeline orchestrator
│   │   │   ├── daily_predict.py       # Signal generation logic
│   │   │   └── database_update.py     # Data refresh scripts
│   │   ├── data_access/               # Database abstraction layer
│   │   ├── features/                  # Feature engineering
│   │   ├── labels/                    # Label generation
│   │   ├── filters/                   # Signal filtering
│   │   └── models/                    # ML model training
│   ├── categories.txt                 # Sector classifications
│   └── requirements.txt               # Pipeline dependencies
│
├── Documentations/                    # Comprehensive SRS & Project Docs
│   ├── 00_SRS_COMPLETE_SUMMARY.md     # Documentation overview
│   ├── Part1_Introduction_and_Core_Features.md
│   ├── Part2_Advanced_Features.md
│   ├── Part3_Non_Functional_Requirements.md
│   ├── Part4_User_Stories_and_Acceptance_Criteria.md
│   └── Part5_Test_Cases_and_Data_Requirements.md
│
├── Procfile                          # Heroku deployment
├── run_api.bat                       # Windows API runner
└── ToDoList.txt                      # Development tasks
```

---

## ⚡ Quick Start

### Prerequisites

- Python 3.10+
- Node.js 16+
- PostgreSQL database (NeonDB recommended)

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
# Create .env file with:
# DATABASE_URL=postgresql://user:pass@host:port/database
# USE_XGB=true  # or false for LSTM

# Start development server
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## 🔧 Configuration

### Environment Variables

Create `.env` files in the respective directories:

**Backend (.env)**

```env
DATABASE_URL=postgresql://user:password@ep-hostname.region.aws.neon.tech/neondb
USE_XGB=true  # true for XGBoost, false for LSTM
CUDA_VISIBLE_DEVICES=-1  # Disable GPU for inference
```

**Frontend (.env)**

```env
VITE_API_URL=http://localhost:8000/api
# For production: https://your-api-domain.com/api
```

### Model Selection

The platform supports two AI models:

- **XGBoost** (default): Faster inference, momentum-based predictions
- **Quantile LSTM**: More sophisticated probabilistic forecasting

Switch models by setting `USE_XGB` in the backend environment.

---

## 📊 API Endpoints

### Core Endpoints

- `GET /api` - Health check and stock count
- `GET /api/health` - Simple health status
- `GET /api/stocks` - List all available stock tickers
- `GET /api/market-status` - Current market data for heatmap

### Prediction Endpoints

- `GET /api/predict/{stock_id}` - AI price prediction with forecast
- `GET /api/ohlc/{stock_id}` - Historical OHLC data
- `GET /api/ai-signals` - AI-generated trading signals
- `GET /api/ai-signals/dates` - Available signal dates

### Market Data

- `GET /api/vnindex` - VNINDEX historical data
- `GET /api/sectors` - Sector classification mapping
- `GET /api/trade-history` - Signal execution history

Full API documentation available at `/docs` when running the backend.

---

## 🤖 AI Model Training

### Training Scripts

**LSTM Model:**

```bash
cd backend
python train_and_save.py
```

**XGBoost Model:**

```bash
cd daily_suggestion_system/src/training
python train_breakout_model.py
```

### Model Architecture

**Quantile LSTM:**

- Input: 60-day log return sequences
- Architecture: Bidirectional LSTM (128→64 units) + Dense output
- Output: 10-day forecast with 3 quantiles (P5/P50/P95)
- Loss: Custom quantile loss function

**XGBoost:**

- Input: 10-day feature sequences
- Architecture: Ensemble of quantile regressors per step
- Output: Point predictions with confidence bounds

---

## 🔄 Daily Pipeline

The daily suggestion system automates signal generation:

```bash
cd daily_suggestion_system/src/daily_pipeline
python run_daily_pipeline.py
```

**Pipeline Steps:**

1. **Data Update**: Fetch latest OHLC data from Vnstock
2. **Feature Engineering**: Calculate technical indicators
3. **Signal Generation**: Apply ML models to generate buy/sell signals
4. **Database Update**: Store signals in NeonDB

### Signal Types

- **BUY**: Entry price, Target price, Stop loss
- **SELL**: Similar structure for short positions
- **HOLD**: No action recommended

---

## 🚀 Deployment

### Backend (FastAPI)

```bash
# Using Uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000

# Using Procfile (Heroku)
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Frontend (Vite)

```bash
# Build for production
npm run build

# Preview build
npm run preview

# Deploy to Vercel/Netlify
npm run build  # Output in dist/
```

### Docker Support

```dockerfile
# Backend Dockerfile available in backend/
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 🧪 Testing & Development

### Running Tests

```bash
# Backend tests
cd backend
python -m pytest

# Frontend tests
cd frontend
npm test
```

### Development Scripts

- `run_api.bat` - Windows batch file to start backend
- `frontend/package.json` scripts for dev/build/preview

### Data Requirements

- Minimum 60 trading days of historical data per stock
- OHLC data with volume information
- Real-time market status updates

---

## 📈 Performance & Scaling

### Backend Optimizations

- **Concurrency Limiting**: Max 5 simultaneous prediction requests
- **Caching**: 2-10 minute TTL for API responses
- **Memory Management**: Automatic garbage collection after predictions
- **Async Operations**: Non-blocking I/O with FastAPI

### Frontend Optimizations

- **Lazy Loading**: Components loaded on demand
- **Caching**: API responses cached in localStorage
- **Debouncing**: Search and API calls debounced
- **Progressive Loading**: Show cached data while fetching fresh data

---

## 👥 Contributors

- **[Fullstack Developer]** - Trần Huy Tuấn
- **[Data Analyst]** - Hoàng Hiếu Trung
- **[Data Engineer]** - Nguyễn Nhật Minh
- **[AI Engineer]** - Đoàn Duy Long
- **[AI Engineer]** - Đoàn Minh Hiếu

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📚 Documentation

Comprehensive project documentation is available in the `Documentations/` folder:

- **SRS Complete Summary**: Overview of all requirements and specifications
- **Part 1-5**: Detailed functional/non-functional requirements, user stories, and test cases
- **Architecture**: System design and data flow diagrams
- **API Reference**: Complete endpoint documentation

For detailed technical specifications, refer to the `Documentations/` directory.

---

## 🆘 Support & Issues

- **Issues**: Report bugs and request features via GitHub Issues
- **Discussions**: Join community discussions for questions and feedback
- **Documentation**: Check `Documentations/` for detailed specifications

---

*Built with ❤️ for Vietnam's stock market community*
