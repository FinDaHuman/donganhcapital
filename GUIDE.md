# Deployment Guide

## 1. Prepare for GitHub
Your project is already structured for monorepo storage (Frontend + Backend in one repo).

1. **Initialize Git**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Stock Prediction App"
   ```
2. **Push to GitHub**:
   - Create a new repository on GitHub.
   - Run:
     ```bash
     git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
     git push -u origin main
     ```

## 2. Deploy Backend (Render.com)
Render is excellent for Python FastAPI apps.

1. **Sign up/Login** to [Render.com](https://render.com).
2. **Create New Web Service**.
3. **Connect GitHub** and select your repo.
4. **Settings**:
   - **Root Directory**: `backend`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. **Environment Variables** (Advanced):
   - Add `DATA_PATH` if you are committing the Excel file. 
   - *Note*: Since `all_stocks.xlsx` is inside `data/` (root level, outside `backend`), you might need to adjust the path or move `data/` inside `backend/` for simpler deployment on Render.
   - **Recommendation**: Move `data` folder inside `backend` folder and update `app/core/config.py` path.

## 3. Deploy Frontend (Vercel.com)
Vercel is best for React/Vite.

1. **Sign up/Login** to [Vercel.com](https://vercel.com).
2. **Add New Project**.
3. **Select GitHub Repo**.
4. **Settings**:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
5. **Environment Variables**:
   - Key: `VITE_API_URL`
   - Value: `https://your-backend-app.onrender.com/api` (The URL provided by Render)
6. **Deploy**.

## 4. Code Maintenance
- **Change API URL**: 
  - Locally: Edit `frontend/.env`.
  - Production: Edit Vercel Environment Variables.
- **Update Model**:
  - Edit `backend/app/services/model_service.py`.
  - Push changes -> Render auto-deploys.
