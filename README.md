# DongAnh Capital

DongAnh Capital is a Vietnamese equities analysis platform. The repository contains
the customer-facing web app, the FastAPI backend, the daily signal-generation
pipeline, a Facebook posting bot, and a Remotion marketing-video project.

The core product flow is:

1. Market data is loaded into PostgreSQL.
2. Daily jobs generate breakout and learning-to-rank signals.
3. The backend exposes market data, signals, forecasts, auth, subscriptions,
   news, and AI chat endpoints.
4. The React app consumes those endpoints and renders the trading dashboard,
   analyst views, account pages, checkout, news feed, and chatbot.

## Repository Layout

```text
.
|-- backend/                    # FastAPI API service
|   |-- db/                     # PostgreSQL and MongoDB query/migration helpers
|   |-- models/                 # XGBoost/LSTM model artifacts and predictors
|   |-- routers/                # Auth, payments, news, and chat routers
|   |-- utils/                  # Security, email, LLM, and SePay helpers
|   |-- main.py                 # FastAPI app, public market endpoints, background jobs
|   `-- requirements.txt
|-- frontend/                   # Vite + React single-page application
|   |-- public/                 # Static images, icons, robots, sitemap
|   `-- src/                    # App, pages, components, context, API client
|-- daily_suggestion_system/    # Data update, feature engineering, training, inference
|   |-- model/                  # Pipeline models tracked through Git LFS
|   `-- src/
|-- facebook_bot/               # Scheduled Facebook content generator/poster
|-- marketing/                  # Remotion project for promotional video assets
|-- .github/workflows/          # Scheduled automation
|-- Procfile                    # Root Render-style backend process
`-- run_api.bat                 # Local Windows backend launcher
```

## Main Services

### Backend API

Location: `backend/`

The backend is a FastAPI application backed by PostgreSQL and optional MongoDB.
It loads prediction artifacts at startup, runs lightweight startup migrations,
and starts background tasks for VN30F1M intraday polling and subscription expiry
cleanup.

Important areas:

- `backend/main.py` exposes market data, OHLC, predictions, AI signals, LTR
  signals, trade history, analytics, sectors, and email subscription endpoints.
- `backend/routers/auth.py` handles email/password auth, Google OAuth, password
  reset, httpOnly cookie sessions, refresh-token rotation, rate limiting, and
  account lockout.
- `backend/routers/payments.py` handles SePay/VietQR order creation, webhook
  confirmation, subscription upgrades, proration, purchase history, and the Pro
  trial flow.
- `backend/routers/news.py` exposes a login-gated, MongoDB-backed CafeF news feed.
- `backend/routers/chat.py` exposes Pro/Premium-gated Gemini chat and news
  analysis with DB-backed daily quota tracking.
- `backend/db/models_user.py`, `backend/db/models_payment.py`, and
  `backend/db/ltr_signals_migration.py` contain direct SQL migrations. This
  project does not currently use Alembic.

### Frontend SPA

Location: `frontend/`

The frontend is a Vite React 18 application styled with Tailwind CSS. It uses
Axios for API calls, `lightweight-charts` and Plotly for market visualization,
Framer Motion for UI transitions, and `AuthContext` for cookie-based session
state.

Important areas:

- `frontend/src/App.jsx` wires the main application routes/views.
- `frontend/src/context/AuthContext.jsx` manages login state, refresh retries,
  cross-tab token refresh coordination, and non-sensitive session caching.
- `frontend/src/services/stock_api.js` is the main market/analytics API client.
- `frontend/src/components/` contains dashboard, chart, landing, news, LTR,
  AI analyst, data analyst, chatbot, layout, and loading components.
- `frontend/vercel.json` rewrites all routes to `index.html` for SPA routing.

### Daily Suggestion Pipeline

Location: `daily_suggestion_system/`

The pipeline updates OHLC data, builds market and stock features, scores breakout
signals, updates trade state, fetches VN30F1M intraday data, and writes LTR ranked
signals.

Entry point:

```bash
python daily_suggestion_system/src/daily_pipeline/run_daily_pipeline.py
```

Pipeline order:

1. Verify `DATABASE_URL` and database connectivity.
2. Update stock and VNINDEX OHLC data.
3. Run breakout inference and persist `ai_signals` and daily summary rows.
4. Update VN30F1M intraday data.
5. Score all stocks with the LTR model and persist top-ranked rows to
   `ltr_signals`.

The scheduled GitHub workflow runs this on weekdays at `08:02 UTC`, which is
`15:02` in Vietnam.

### Facebook Bot

Location: `facebook_bot/`

The bot runs from `.github/workflows/facebook-bot.yml` at `00:00 UTC` and
`08:00 UTC`. It selects a post type, fetches or generates content, uses Gemini to
write the post, and publishes through the Facebook Graph API.

### Marketing Video Project

Location: `marketing/`

This is a Remotion project for promotional media. It is independent from the web
app and backend.

## Technology Stack

| Area | Technology |
| --- | --- |
| API | FastAPI, Uvicorn, Pydantic, SQLAlchemy |
| Relational data | PostgreSQL, commonly deployed on Neon |
| News data | MongoDB Atlas via `pymongo` |
| Auth | JWT access/refresh cookies, bcrypt, Google OAuth |
| Payments | SePay/VietQR webhook flow |
| Email | Resend HTTP API |
| AI / LLM | Gemini via `google-genai` or direct HTTP helpers |
| ML / data | pandas, numpy, scikit-learn, LightGBM, XGBoost, joblib, vnstock |
| Frontend | React 18, Vite, Tailwind CSS, Axios, Plotly, lightweight-charts |
| Marketing | Remotion |
| Automation | GitHub Actions |

## Prerequisites

- Python 3.11 recommended. The GitHub workflows use Python 3.11. The backend
  Dockerfile currently uses `python:3.9-slim`, so validate dependency behavior if
  you rely on that image.
- Node.js 18 or newer.
- PostgreSQL database access through `DATABASE_URL`.
- Git LFS for model files in `daily_suggestion_system/model/*.pkl`.
- Optional service credentials for Google OAuth, SePay, Resend, MongoDB, Gemini,
  and Facebook automation.

After cloning, pull LFS assets if they are not already present:

```bash
git lfs pull
```

## Local Development

If you have a Render environment export at `DongAnhCapital.env`, generate the
ignored local env files from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-env.ps1
```

This writes `backend/.env`, `frontend/.env`, and
`daily_suggestion_system/.env`. It keeps deployed secrets local, overrides
frontend/backend URLs to localhost, and enables local HTTP auth cookies.

### Local Test Tutorial

Use this flow before deploying a new feature or function:

1. Put the latest Render export at the repo root as `DongAnhCapital.env`.
   This file is ignored by git.
2. Regenerate local env files:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-env.ps1
   ```

3. Start the backend in the first terminal:

   ```powershell
   cd backend
   py -3.11 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

4. Confirm the backend is alive:

   ```text
   http://localhost:8000/api/health
   http://localhost:8000/docs
   ```

5. Start the frontend in a second terminal:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

6. Open the app at:

   ```text
   http://localhost:5173
   ```

7. Smoke-test the feature you changed. For auth-related work, use
   `http://localhost:5173` and `http://localhost:8000` consistently. Do not mix
   `localhost` with `127.0.0.1`, because browser cookies can stop matching.

8. Before deploying, run the frontend build:

   ```powershell
   cd frontend
   npm run build
   ```

Google OAuth local testing also requires this redirect URI to be allowed in
Google Cloud:

```text
http://localhost:5173/auth/google/callback
```

### Backend

Run commands from `backend/` so relative model paths and `.env` loading behave as
expected.

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API should respond at:

```text
http://localhost:8000/api/health
http://localhost:8000/docs
```

Copy `backend/.env.example` to `backend/.env` and fill the values you need.

Minimum backend variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. SSL is expected by the DB helpers. |
| `DATABASE_SSLMODE` | `require` for Render/Neon; use `disable` for a local Postgres server without SSL. |
| `JWT_SECRET_KEY` | Stable signing key for access and refresh tokens. Required for persistent sessions. |
| `ALLOWED_ORIGINS` | Comma-separated frontend origins. Use exact origins when cookies are involved. |
| `APP_ENV`, `COOKIE_SECURE`, `COOKIE_DOMAIN`, `COOKIE_SAMESITE` | Local/prod cookie behavior. Use `APP_ENV=local`, `COOKIE_SECURE=false`, and empty `COOKIE_DOMAIN` for localhost. |
| `USE_XGB` | `true` by default; controls XGBoost predictor loading behavior. |

Feature-specific backend variables:

| Variable | Used by |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google OAuth login |
| `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`, `SUPPORT_EMAIL` | Password reset and purchase emails |
| `SEPAY_API_TOKEN`, `SEPAY_WEBHOOK_SECRET`, `SEPAY_BANK_ID`, `SEPAY_BANK_ACCOUNT_NO`, `SEPAY_BANK_ACCOUNT_NAME` | SePay/VietQR subscriptions |
| `MONGODB_URI` | CafeF news feed |
| `CHAT_GEMINI_API_KEY`, `CHAT_GEMINI_MODELS` | Pro/Premium AI chat and news analysis |
| `HIRO_INTERNAL_TOKEN` | Shared server-only token for the presentation Hiro bridge; set the same value on the Lily backend |

For local browser auth, use `http://localhost:5173` for the frontend and
`http://localhost:8000` for the API. Avoid mixing `localhost` and `127.0.0.1`
while testing login cookies.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Create `frontend/.env` when you need to point the app at a non-production API:

```env
VITE_API_URL=http://localhost:8000/api
```

Build the frontend:

```powershell
cd frontend
npm run build
```

Preview the production build:

```powershell
cd frontend
npm run preview
```

### Daily Pipeline

```powershell
cd daily_suggestion_system
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL="postgresql+psycopg2://..."
cd src\daily_pipeline
python run_daily_pipeline.py
```

The pipeline writes to the shared database. Run it only against a database where
you are comfortable updating OHLC, signal, summary, trade, VN30F1M, and LTR rows.

### Facebook Bot

```powershell
cd facebook_bot
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:GEMINI_API_KEY="..."
$env:FB_PAGE_ID="..."
$env:FB_PAGE_TOKEN="..."
python main.py
```

### Marketing Project

```powershell
cd marketing
npm install
npm run studio
```

Render the promo reel:

```powershell
cd marketing
npm run render-promo
```

## API Surface

Representative backend endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Health and model-load status |
| `GET /api/stocks` | Available ticker symbols |
| `GET /api/market-status` | Market heatmap/status data |
| `GET /api/vnindex` | VNINDEX OHLC series |
| `GET /api/ohlc/{stock_id}` | Stock OHLC series |
| `GET /api/predict/{stock_id}` | Historical data plus forecast candles |
| `GET /api/ai-signals` | Breakout AI signals |
| `GET /api/ltr-signals` | Pro/Premium LTR ranked signals |
| `GET /api/trade-history` | Trade-manager history |
| `GET /api/analytics/*` | Dashboard analytics and pipeline health |
| `POST /api/subscribe` | Public email signup |
| `POST /api/auth/*` | Register, login, logout, refresh, OAuth, password reset |
| `POST /api/payments/*` | Order creation, trial, webhook, payment status/history |
| `GET /api/news/*` | Login-gated news feed |
| `POST /api/chat/*` | Pro/Premium AI chat and news analysis |

FastAPI also exposes generated OpenAPI docs at `/docs` when the backend is
running.

## Data Model Overview

The backend and pipeline expect these main PostgreSQL tables:

| Table | Role |
| --- | --- |
| `stocks` | Ticker registry and stock metadata |
| `stock_ohlc` | Historical OHLCV data by ticker |
| `vnindex_ohlc` | VNINDEX market series |
| `vn30f1m_intraday` | Intraday VN30F1M futures candles |
| `ai_signals` | Breakout model signals with entry, take-profit, stop-loss, probability |
| `daily_signal_summary` | Daily signal counts |
| `trade_history` | Managed signal/trade lifecycle and realized outcomes |
| `ltr_signals` | Daily learning-to-rank top picks |
| `users` | Auth profiles, subscription state, token hashes, quotas |
| `payments` | SePay order, status, subscription, and proration history |
| `subscribers` | Public email signup list |

MongoDB is used separately for the CafeF news feed. If `MONGODB_URI` is not set,
news endpoints return service-unavailable responses without blocking the rest of
the API.

## Automation and Deployment

### GitHub Actions

- `.github/workflows/daily-pipeline.yml`
  - Weekdays at `08:02 UTC`.
  - Requires `DATABASE_URL`.
  - Checks out Git LFS assets.
  - Runs `daily_suggestion_system/src/daily_pipeline/run_daily_pipeline.py`.

- `.github/workflows/facebook-bot.yml`
  - Daily at `00:00 UTC` and `08:00 UTC`.
  - Requires `GEMINI_API_KEY`, `FB_PAGE_ID`, and `FB_PAGE_TOKEN`.
  - Runs `facebook_bot/main.py`.

### Hosting Files

- Root `Procfile`: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
- `backend/Procfile`: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- `backend/Dockerfile`: containerized backend entrypoint.
- `frontend/vercel.json`: SPA fallback rewrite for Vercel/static hosting.

## Development Notes

- Keep market-data writes, signal generation, and payment subscription updates
  pointed at the intended database. Most scripts perform real upserts.
- Do not commit real `.env` files or service credentials.
- Prefer adding database changes through the existing explicit SQL migration
  pattern in `backend/db/` unless the project adopts a formal migration tool.
- Auth tokens are intentionally stored in httpOnly cookies, not localStorage.
  Frontend sessionStorage stores only non-sensitive profile cache data.
- The backend uses in-memory TTL caches and semaphores to protect a small API
  instance from expensive analytics, chat, and DB operations.
- Public market endpoints can work without browser auth. News, LTR signals,
  payments, profile, and chat endpoints require valid cookies and, for some
  features, a Pro/Premium subscription.
- There is no project-wide automated test suite in this checkout. At minimum,
  run `npm run build` for the frontend and smoke-test `/api/health`, `/docs`,
  and any endpoint touched by a backend change.

## Useful Commands

```powershell
# Backend
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm run dev
npm run build

# Daily pipeline
cd daily_suggestion_system\src\daily_pipeline
python run_daily_pipeline.py

# Marketing video studio
cd marketing
npm run studio

# Facebook bot
cd facebook_bot
python main.py
```
