# DongAnh Capital

DongAnh Capital is a Vietnamese equities analysis platform. The repository
contains the web app, the FastAPI backend, the daily signal-generation pipeline,
and a Facebook posting bot.

It is a **non-commercial project**. Nothing is sold, there are no subscription
tiers, and model output is published as scores and reference price levels — not
as investment recommendations.

The core product flow is:

1. Market data is loaded into PostgreSQL.
2. Daily jobs generate breakout, learning-to-rank, and breakdown signals.
3. The backend exposes market data, signals, forecasts, auth, news, reports, and
   AI chat endpoints.
4. The React app consumes those endpoints and renders the dashboard, analyst
   views, signal tabs, account pages, news feed, and chatbot.

## Repository Layout

```text
.
|-- backend/                    # FastAPI API service
|   |-- db/                     # PostgreSQL and MongoDB query/migration helpers
|   |-- models/                 # XGBoost/LSTM model artifacts and predictors
|   |-- routers/                # Auth, account, legal, news, chat, reports
|   |-- utils/                  # Security, email, LLM, legal, storage helpers
|   |-- main.py                 # FastAPI app, market endpoints, background jobs
|   `-- requirements.txt
|-- frontend/                   # Vite + React single-page application
|   |-- public/                 # Static images, icons, robots, sitemap
|   `-- src/
|       |-- legal/{vi,en}/      # Versioned legal documents
|       `-- ...                 # App, pages, components, context, API client
|-- daily_suggestion_system/    # Data update, feature engineering, training, inference
|   |-- model/                  # Pipeline models tracked through Git LFS
|   |-- categories.txt          # Ticker universe by sector
|   `-- src/
|-- facebook_bot/               # Scheduled Facebook content generator/poster
|-- scripts/                    # setup-local-env.ps1
|-- agents/                     # Agent instruction pointer
|-- .github/workflows/          # Scheduled automation
|-- Procfile                    # Root Render-style backend process
`-- run_api.bat                 # Local Windows backend launcher
```

`RemotionMarketing/` is a gitignored, standalone Remotion video project. It has
its own README and is unrelated to the app.

## Main Services

### Backend API

Location: `backend/`

The backend is a FastAPI application backed by PostgreSQL and optional MongoDB.
It loads prediction artifacts at startup, runs lightweight startup migrations,
and starts background tasks for VN30F1M intraday polling, live quote refresh,
subscription-expiry cleanup with the pending-deletion sweep, and batched feedback
email.

Important areas:

- `backend/main.py` exposes market data, OHLC, predictions, AI signals, LTR
  signals, BCD signals, trade history, sectors, and email subscription
  endpoints.
- `backend/routers/auth.py` handles email/password auth, Google OAuth, password
  reset, httpOnly cookie sessions, refresh-token rotation, rate limiting,
  account lockout, and consent capture.
- `backend/routers/account.py` handles data export, deactivation, and the
  deletion request/cancel flow.
- `backend/routers/legal.py` exposes public unsubscribe, subscribe confirmation,
  and legal document versions.
- `backend/routers/news.py` and `macro_news.py` expose login-gated,
  MongoDB-backed news feeds (CafeF and world macro).
- `backend/routers/chat.py` exposes Gemini chat and news analysis with DB-backed
  daily quota tracking and deterministic no-advice guardrails.
- `backend/routers/reports.py` serves PDF research notes from Cloudflare R2 via
  presigned URLs.
- `backend/db/models_user.py`, `models_payment.py`, `ltr_signals_migration.py`,
  and `bcd_signals_migration.py` contain direct SQL migrations run at startup.
  This project does not use Alembic.

`backend/routers/payments.py` exists but is **not mounted**. Nothing is sold;
`/api/payments/*` does not resolve. `utils/sepay.py` and `utils/trial.py` are
likewise unreferenced.

### Frontend SPA

Location: `frontend/`

The frontend is a Vite React 18 application styled with Tailwind CSS. It uses
Axios for API calls, `lightweight-charts` for market visualization,
Framer Motion for UI transitions, and `AuthContext` for cookie-based session
state. UI copy is English; `frontend/src/legal/vi/` holds the Vietnamese legal
documents.

Important areas:

- `frontend/src/App.jsx` wires the main application views. There is no React
  Router — routing is custom `window.history.pushState` logic.
- `frontend/src/context/AuthContext.jsx` manages login state, refresh retries,
  cross-tab token refresh coordination, and non-sensitive session caching.
- `frontend/src/services/stock_api.js` is the main market data API client.
- `frontend/src/components/` contains dashboard, chart, landing, news, LTR, BCD,
  AI analyst, reports, chatbot, layout, and loading components.
- `frontend/vercel.json` rewrites all routes to `index.html` for SPA routing.

### Daily Suggestion Pipeline

Location: `daily_suggestion_system/`

The pipeline updates OHLC data, builds market and stock features, scores breakout
signals, updates trade state, fetches VN30F1M intraday data, writes LTR ranked
signals, and detects and tracks BCD breakdown signals.

Entry point:

```bash
python daily_suggestion_system/src/daily_pipeline/run_daily_pipeline.py
```

Pipeline order:

0. Verify `DATABASE_URL` and database connectivity.
1. Update stock and VNINDEX OHLC data.
2. Run breakout inference and persist `ai_signals` and daily summary rows.
3. Update VN30F1M intraday data.
4. Score all stocks with the LTR model and persist top-ranked rows to
   `ltr_signals`.
5. Detect BCD breakdown events and persist them to `bcd_signals`. Finding zero
   events on a given day is normal.
6. Evaluate BCD triggers — fill any waiting signal whose limit level was reached,
   expire the rest. Runs even when step 5 produced nothing.
7. Open and resolve BCD trades in `bcd_trade_history`.

The scheduled GitHub workflow runs this on weekdays at `08:02 UTC`, which is
`15:02` in Vietnam.

### Facebook Bot

Location: `facebook_bot/`

The bot runs from `.github/workflows/facebook-bot.yml` at `00:00 UTC` and
`08:00 UTC`. It selects a post type, fetches or generates content, uses Gemini to
write the post, and publishes through the Facebook Graph API.

`facebook_bot/rule.md` is loaded and injected as the model's system prompt on
every run. Editing it changes what the page publishes.

## Technology Stack

| Area | Technology |
| --- | --- |
| API | FastAPI, Uvicorn, Pydantic, SQLAlchemy |
| Relational data | PostgreSQL, commonly deployed on Neon |
| News data | MongoDB Atlas via `pymongo` (two clusters) |
| Object storage | Cloudflare R2 for PDF reports |
| Auth | JWT access/refresh cookies, bcrypt, Google OAuth |
| Email | Resend HTTP API |
| AI / LLM | Gemini via `google-genai` or direct HTTP helpers |
| ML / data | pandas, numpy, scikit-learn, LightGBM, XGBoost, joblib, requests (KBS / VCI public price data) |
| Frontend | React 18, Vite, Tailwind CSS, Axios, lightweight-charts |
| Automation | GitHub Actions |

## Prerequisites

- Python 3.11. The GitHub workflows and `backend/Dockerfile` both use 3.11.
- Node.js 18 or newer.
- PostgreSQL database access through `DATABASE_URL`.
- Git LFS for model files in `daily_suggestion_system/model/*.pkl`.
- Optional service credentials for Google OAuth, Resend, MongoDB, Cloudflare R2,
  Gemini, and Facebook automation.

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

> A `backend/.env` generated from the production export points `DATABASE_URL` at
> the live database. Starting the backend runs the startup migrations against it.
> Override `DATABASE_URL` before doing anything schema-related.

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
| `EDGE_SHARED_SECRET` | **Latent safeguard — leave unset; not needed today.** When set, `CF-Connecting-IP`/`X-Forwarded-For` are trusted only on requests carrying a matching `X-DAC-Edge` header from a Cloudflare Transform Rule. Verified 2026-07-29 that IP spoofing is already impossible: `*.onrender.com` sits behind Render's own Cloudflare, which rejects client-supplied `CF-Connecting-IP` (403 error 1000) and sets a real one that outranks `X-Forwarded-For`. Only becomes relevant if the API moves off a Cloudflare-fronted origin. To enable: add the Transform Rule first, confirm `/api/health` shows `edge.header_present: true`, then set this — doing it in the other order puts every user in one rate-limit bucket. |

Feature-specific backend variables:

| Variable | Used by |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google OAuth login |
| `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`, `SUPPORT_EMAIL` | Verification, password reset, welcome, and feedback emails |
| `PUBLIC_API_URL` | Absolute links in outbound email (unsubscribe, confirm) |
| `MONGODB_URI` | CafeF news feed |
| `MACRO_MONGODB_URI` | World macro news feed |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | PDF research reports |
| `CHAT_GEMINI_API_KEY`, `CHAT_GEMINI_MODELS` | AI chat and news analysis |

`SEPAY_*` variables appear in `backend/.env.example` but are read by nothing —
the payments router is not mounted. Leave them unset.

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
you are comfortable updating OHLC, signal, summary, trade, VN30F1M, LTR, and BCD
rows.

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

This publishes a real post to the live page. Do not run it casually.

## API Surface

Representative backend endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Health and model-load status |
| `GET /api/stocks` | Available ticker symbols |
| `GET /api/market-status` | Market heatmap/status data |
| `GET /api/vnindex` | VNINDEX OHLC series |
| `GET /api/sectors` | Sector groupings |
| `GET /api/loading-progress` | Startup warm-up progress for the loading gate |
| `GET /api/ohlc/{stock_id}` | Stock OHLC series |
| `GET /api/predict/{stock_id}` | Historical data plus forecast candles |
| `GET /api/ai-signals`, `/dates`, `/summary` | Breakout AI signals |
| `GET /api/ltr-signals`, `/dates` | LTR ranked signals |
| `GET /api/bcd-signals`, `/dates`, `/summary` | BCD breakdown signals |
| `GET /api/bcd-trade-history` | BCD trade lifecycle and outcomes |
| `GET /api/trade-history`, `/stats` | Breakout trade-manager history |
| `POST /api/subscribe` | Public email signup (double opt-in) |
| `GET /api/subscribe/confirm`, `/api/unsubscribe` | Public list management |
| `GET /api/legal/versions` | Current legal document versions |
| `POST /api/auth/*` | Register, login, logout, refresh, OAuth, password reset, consent |
| `GET/POST /api/account/*` | Data export, deactivate, delete request/cancel |
| `GET /api/news/*`, `/api/macro-news/*` | Login-gated news feeds |
| `POST /api/chat/message`, `/analyze-news`, `GET /quota` | AI chat and news analysis |
| `GET /api/reports`, `/api/reports/{id}/url` | PDF research notes on R2 |

`/api/health`, `/api/stocks`, `/api/vnindex`, `/api/sectors` and the public
subscribe/legal routes are open. Everything that returns model output requires a
signed-in, email-verified account.

FastAPI also exposes generated OpenAPI docs at `/docs` when the backend is
running.

### Payment code is present but not mounted

`backend/routers/payments.py`, `backend/utils/sepay.py`,
`frontend/src/pages/CheckoutPage.jsx` and `frontend/src/utils/trialOffer.js`
remain in the tree but are **deliberately not wired up** — the payments router is
never included in the FastAPI app (see the note at `backend/main.py:704`), and no
route reaches the checkout page.

They are leftovers from an earlier design that assumed paid tiers. That design
was dropped: DongAnh Capital is a non-commercial student project with no
registered entity, nothing is for sale, and access is a single rule — signed in
with a verified email. Re-enabling any of this would be a business and legal
decision requiring a registered company, not a code change.

The files are kept only so the history of the design is legible. Treat them as
dead code.

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
| `trade_history` | Managed breakout signal/trade lifecycle and realized outcomes |
| `ltr_signals` | Daily learning-to-rank top picks |
| `bcd_signals` | Breakdown events with WAITING/TRIGGERED/EXPIRED lifecycle |
| `bcd_trade_history` | BCD trade lifecycle and realized outcomes |
| `reports` | PDF report metadata and R2 object keys |
| `users` | Auth profiles, consent, token hashes, quotas |
| `payments` | Historical order rows, retained read-only |
| `subscribers` | Public email signup list |

MongoDB is used separately for the two news feeds. If `MONGODB_URI` or
`MACRO_MONGODB_URI` is not set, the corresponding news endpoints return
service-unavailable responses without blocking the rest of the API.

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
- `backend/Dockerfile`: containerized backend entrypoint (`python:3.11-slim`).
- `frontend/vercel.json`: SPA fallback rewrite for Vercel/static hosting.

## Development Notes

- Keep market-data writes and signal generation pointed at the intended database.
  Most scripts perform real upserts.
- Do not commit real `.env` files or service credentials.
- Prefer adding database changes through the existing explicit SQL migration
  pattern in `backend/db/`. Migrations run on every startup, so they must be
  idempotent.
- Auth tokens are intentionally stored in httpOnly cookies, not localStorage.
  Frontend sessionStorage stores only non-sensitive profile cache data.
- The backend uses in-memory TTL caches and semaphores to protect a small API
  instance from expensive chat and DB operations.
- Access is a single rule: signed in with a verified email. There are no tiers.
- Model output is presented as scores and reference price levels. It is not
  investment advice, and user-facing copy must not present it as such.
- There is no project-wide automated test suite. At minimum, run
  `npm run build` for the frontend and smoke-test `/api/health`, `/docs`, and any
  endpoint touched by a backend change.

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

# Facebook bot (publishes for real)
cd facebook_bot
python main.py
```

## Licence and Reuse

This repository is published for competition evaluation and study only.

**No licence is granted. All rights reserved.** The source may be read, but it
may not be copied, modified, redistributed, or reused in other work without
written permission from the project team.

This applies in particular to the **trained model artifacts**, which represent
the bulk of the work and may not be extracted, redistributed, or reused in any
form:

- `daily_suggestion_system/model/*.pkl` — breakout, LTR and BCD models
- `backend/models/*.pkl`, `backend/models/*.h5` — quantile LSTM and metadata
- `backend/models/xgb_model/*.json` — XGBoost quantile boosters

The market data these models were trained on is not ours to relicense either.

If you want to use any part of this for something, ask — contact details are on
the `/contact` page at https://www.donganhcapital.com.


### Market-data ingestion checks

The stock, VNINDEX, and VN30F1M batch updates re-fetch a rolling 10-calendar-day
window so missed runs can be recovered by later upserts. This is a recovery
window, not a guarantee that every source returned the latest session.

Both VN30F1M writers use `backend/market_calendar.py` to reject candles on
weekends and announced exchange holidays. The backend poller also skips those
dates before requesting data. Provider timestamps without a timezone are treated
as Vietnam time; timezone-aware timestamps are converted to Vietnam time.

The calendar currently covers **2026**. Add the next year's official exchange
holiday schedule before year-end, including announced amendments. An uncovered
year raises an explicit error rather than silently accepting holiday data. The
calendar file links its sources. Government make-up Saturdays are not assumed to
be trading sessions.

Run the offline ingestion and lifecycle checks from the repository root:

```bash
python -m unittest discover -s daily_suggestion_system/tests
```
