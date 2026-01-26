# Deployment Guide: How to Go Public

Target URLs:
- **Backend**: [https://donganhcapital.onrender.com](https://donganhcapital.onrender.com)
- **Frontend**: [https://dong-anh-capital.vercel.app](https://dong-anh-capital.vercel.app)

## Phase 1: GitHub Setup

1.  **Initialize Git** (if you haven't already):
    Open your terminal in `D:\Vs Code\DongAnhCapital`:
    ```powershell
    git init
    git add .
    git commit -m "Ready for deployment: Fixed paths and Config"
    ```

2.  **Create Repository**:
    -   Go to [GitHub.com](https://github.com) -> New Repository -> Name it `donganhcapital`.
    -   Do **NOT** initialize with README, license, or gitignore (we already have them).

3.  **Push Code**:
    ```powershell
    git remote add origin https://github.com/YOUR_GITHUB_USERNAME/donganhcapital.git
    git branch -M main
    git push -u origin main
    ```

---

## Phase 2: Deploy Backend (Render.com)

1.  Log in to [Render.com](https://dashboard.render.com/).
2.  Click **New +** -> **Web Service**.
3.  Select "Build and deploy from a Git repository" -> Connect your `donganhcapital` repo.
4.  **Configuration Page** (Fill exactly as below):
    -   **Name**: `donganhcapital`
    -   **Region**: Singapore (closest to VN) or Oregon.
    -   **Root Directory**: `. ` (Leave empty or set to root `/`)
    -   **Runtime**: `Python 3`
    -   **Build Command**: 
        ```bash
        cd backend && pip install -r requirements.txt
        ```
    -   **Start Command**:
        ```bash
        cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
        ```
5.  **Environment Variables** (Scroll down to "Advanced" or "Environment"):
    -   **Key**: `PYTHON_VERSION` | **Value**: `3.11.0` (Optional but good)
    -   *Note*: We don't need `DATA_PATH` var because your code defaults to relative path inside the repo, and we committed the excel file.
6.  Click **Create Web Service**.
    -   Wait ~5 minutes. You should see "Your service is live".
    -   Copy the URL: `https://donganhcapital.onrender.com`.

---

## Phase 3: Deploy Frontend (Vercel.com)

1.  Log in to [Vercel.com](https://vercel.com/dashboard).
2.  Click **Add New...** -> **Project**.
3.  Import `donganhcapital` from GitHub.
4.  **Configure Project**:
    -   **Framework Preset**: `Vite` (Should detect automatically).
    -   **Root Directory**: Click "Edit" and select `frontend`.
5.  **Environment Variables**:
    -   **Key**: `VITE_API_URL`
    -   **Value**: `https://donganhcapital.onrender.com/api` (NO trailing slash after `api` generally, but check your code logic. Your code adds `/predict`, so base URL `.../api` is correct).
6.  Click **Deploy**.
    -   Wait ~2 minutes.
    -   You will get `https://dong-anh-capital.vercel.app`.

---

## Phase 4: Final Check

1.  Open [https://dong-anh-capital.vercel.app](https://dong-anh-capital.vercel.app).
2.  The Dropdown should load tickers (fetching from Render).
3.  The Chart should appear.

### Troubleshooting
-   **Backend 500 Error**: Check Render Logs. Likely path issue if `data/` wasn't committed.
-   **Frontend Network Error**: Check Vercel Env Var `VITE_API_URL` -> Is it https?
