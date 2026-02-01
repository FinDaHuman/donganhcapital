# 📘 DongAnh Capital Guide

This project consists of two parts:
1.  **Frontend**: React + Vite (Port 5173 default)
2.  **Backend**: FastAPI + TensorFlow (Port 8000 default)

---

## 💻 1. How to Run Locally

### Prerequisites
- Python 3.10 or higher
- Node.js 18 or higher

### Step-by-Step

**1. Start the Backend (API)**
Open a terminal in the root folder:
```powershell
# Windows
run_api.bat
```
*Or manually:*
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python train_and_save.py  # Run once to generate model
uvicorn main:app --reload --port 8000
```
> API will run at: `http://localhost:8000`

**2. Start the Frontend (Website)**
Open a second terminal:
```powershell
cd frontend
npm install
npm run dev
```
> App will run at: `http://localhost:5173`

---

## 🚀 2. How to Deploy (Go Public)

### A. Deploy Frontend (Vercel)
*Best for React apps. Free & Fast.*

1.  Push your code to **GitHub**.
2.  Go to [Vercel.com](https://vercel.com) -> **Add New Project**.
3.  Import your `donganhcapital` repo.
4.  **Settings**:
    -   **Framework**: Vite
    -   **Root Directory**: `frontend` (Important!)
5.  **Environment Variables**:
    -   `VITE_API_URL`: `https://your-backend-url.onrender.com/api` (See Backend step below)
6.  Click **Deploy**.

### B. Deploy Backend (Render)
*Best for Python APIs with ML models.*

1.  Go to [Render.com](https://render.com) -> **New Web Service**.
2.  Connect your GitHub repo.
3.  **Settings**:
    -   **Root Directory**: `backend` (Important!)
    -   **Build Command**: `pip install -r requirements.txt`
    -   **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
    -   **Instance Type**: Select **Starter** or higher (Free tier might struggle with TensorFlow memory usage).
4.  **Important**: Because the model training takes time/resources, ensure `vn_stock_predictor_model.h5` is **committed to Git** inside `backend/models/`.
    -   *If the file is too large (>100MB), use Git LFS or run `python train_and_save.py` as part of the Build Command (but this increases build time).*
5.  Click **Deploy**.
6.  Copy the URL (e.g., `https://donganhcapital.onrender.com`) and update your Frontend's env var.

### C. Backend Strategy for Model Files
Since you trained the model locally, the easiest path is to **commit the model files** so Render doesn't have to retrain.
1. Ensure `backend/models/vn_stock_predictor_model.h5` is in your git repo.
2. If it's ignored by `.gitignore`, un-ignore it: `git add -f backend/models/*.h5`
