# News Feature Plan

A market-news feed available to **every signed-in user (any tier — free, pro,
premium)**, sourced from the existing CafeF MongoDB scrape. Login-gated but not
Pro-gated. Additive only — designed so that an unreachable or misconfigured
MongoDB cannot degrade any existing endpoint.

---

## 1. Data source (verified)

**Cluster:** `cluster0.9wiarvm.mongodb.net` (MongoDB Atlas, separate from NeonDB)
**Database / collection:** `cafef_news.articles`

| Metric | Value |
|---|---|
| Total docs | 48,355 |
| `status: "done"` (display-ready, has AI summary) | 29,465 |
| `status: "pending"` / `failed` / `processing` | 18,739 / 150 / 1 |
| Date coverage (`created_at`) | 2026-05-01 → present, refreshed daily |

`cafef_pipeline.articles` is a staging queue (raw_text empty, no summaries) — **ignore it**; read only `cafef_news.articles` filtered to `status: "done"`.

### Document shape

```jsonc
{
  "_id": ObjectId,
  "url_hash": "ec2d41...c136fa",        // 64-char sha256, indexed — use as public id
  "title": "Giá vàng trong nước bất ngờ bật tăng…",
  "category": "doanh_nghiep",           // 6 values (see below)
  "source_url": "https://cafef.vn/...chn",
  "published_at": <mixed type — DISPLAY ONLY, see §2>,
  "created_at": ISODate,                // reliable sort key, present on 100% of done docs
  "updated_at": ISODate,
  "status": "done",
  "raw_text": "…full article body ~3.5 KB…",   // EXCLUDE from list responses
  "summary_json": {
    "summary":     ["bullet 1", "bullet 2", "bullet 3"],
    "tickers":     ["FPT", …],          // indexed; empty on ~54% of docs
    "impact":      "Positive|Negative|Neutral|null",   // indexed; null on 1 doc
    "sector":      "Tài chính - Vàng bạc",
    "key_metrics": { "label": "value", … }
  }
}
```

**Categories** (`category`): `bat_dong_san`, `chung_khoan`, `doanh_nghiep`,
`hang_hoa`, `tai_chinh_nh`, `vi_mo`.

**Existing indexes:** `_id`, `url_hash`, `published_at_-1`,
`summary_json.tickers`, `summary_json.impact`, `status`.

---

## 2. ⚠️ Critical data quirk — sort by `created_at`, **not** `published_at`

`published_at` is **not safe to sort or paginate on**:
- **Mixed BSON type:** 29,341 docs store it as a `Date`, 124 as a `string`.
  Mongo sorts different BSON types into separate blocks (string < date), so the
  124 string docs always clump at one end regardless of their real date.
- **Mixed string format:** the string ones appear as both
  `"2026-06-20T16:32:00"` and `"20/06/2026 - 06:58"` — lexical order is wrong.

`created_at` is a true `Date` on **100%** of `done` docs and is monotonic with
ingestion. **It is the sort and pagination key.** `published_at` is parsed only
for *display* (handle both Date and the two string formats; fall back to
`created_at` if unparseable).

> Because there is **no index on `created_at`**, add a one-time compound index
> `{ status: 1, created_at: -1 }` (see §6). Without it, every list query is a
> 29k-doc in-memory sort on a 0.1-vCPU box.

---

## 3. Decisions (resolved)

1. **Audience — must be logged in, any tier.** The endpoint requires a valid
   auth cookie but does **no** tier check (free / pro / premium all allowed).
   Reuse `routers.auth.get_current_user` (raises **401** if unauthenticated) —
   same call the LTR endpoint uses, minus the `pro/premium` gate. Anonymous
   visitors get a "Sign in to read market news" CTA. → Frontend must send
   credentials (see §5).
2. **`raw_text` vs summary — resolved by the data analysis in §3a.** Summaries
   are almost always substantial, so the list ships **summary bullets**, with a
   **bounded `preview` excerpt** only for the ~0.1 % thin/empty cases. The full
   `raw_text` is served **only by the single-doc detail endpoint**. This honors
   the "show raw text when the summary is too short" idea without ever putting a
   full article body in a list response.

---

## 3a. Database analysis — does "show raw_text when summary is short" overflow the constraints?

**Short answer: no, if `raw_text` never goes into the list endpoint.** Measured
over the 29,465 `status:"done"` docs (3,000-doc random sample for distributions,
full-collection aggregation for the global max):

| Field | p10 | p50 | p90 | p99 | global max |
|---|---|---|---|---|---|
| `raw_text` (chars) | — | 2,927 | 5,449 | 10,050 | **45,206** (~88 KB UTF-8) |
| `summary` joined (chars) | 151 | 210 | 288 | — | 475 |

- **Thin summary (`<80` chars): 0.1 %.  Empty summary: 0 %.  Empty raw_text: 0 %.**
  → The premise "AI summary too short" is a **rare edge case**, not the norm.
  We still handle it, but it won't drive the design.

**Payload math — one page of 20 cards** (UTF-8 Vietnamese ≈ 2 bytes/char):

| List strategy | Est. page size | Verdict |
|---|---|---|
| Summary bullets only | **~12 KB** | ✅ lean |
| + bounded 280-char excerpt fallback | **~19 KB** | ✅ what we'll ship |
| Full `raw_text` in every card | ~221 KB avg, **up to ~1.8 MB worst case** | ❌ wasteful, slow to serialize on 0.1 vCPU |
| Single-doc **detail** with full `raw_text` | **≤ ~88 KB** | ✅ trivially safe |

**Constraint verdict:**
- The API is served from **Render** (`api.donganhcapital.com`), not Vercel
  serverless, so Vercel's 4.5 MB function-response limit doesn't directly gate
  these calls. The real binding constraints are **Render 512 MB RAM + 0.1 vCPU
  serialization cost + client bandwidth** — for which pagination + projection is
  the rule regardless.
- Putting full `raw_text` in the list wouldn't breach 4.5 MB at `limit=20`, but
  it's 10–18× heavier, churns Render memory, and slows JSON serialization on the
  0.1 vCPU box. **So: never full `raw_text` in the list.**

**Best-practice resolution of the idea:**
- **List:** always send `summary` bullets. If `summary` is thin/empty, the
  server adds `preview` = first ~280 chars of `raw_text`, truncated on a word
  boundary. Never the full body. Page stays ≤ ~19 KB.
- **Detail (one doc):** full `raw_text` + `summary` + `key_metrics`
  (≤ ~88 KB, safe). This is the natural home for "show the whole article."

---

## 4. Backend (mirrors existing `auth.py` / `payments.py` structure)

### 4a. `backend/db/mongo.py` — connection best practices

Reviewed the live connection; these are the pymongo-on-Render-free-tier rules:

- **One singleton `MongoClient`, reused across every request** (mirrors
  `get_engine()`). `MongoClient` is thread-safe and owns its own internal
  connection pool — **never** open a client per request (that's the #1 pymongo
  anti-pattern: a TLS-handshake + connection storm that would exhaust Atlas M0's
  shared ~500-connection cap and stall the 0.1 vCPU box).
- **Lazy init on first request, not in `lifespan`.** A dead/misconfigured Atlas
  must never block startup or any existing route. On failure: log + return
  `None`; callers raise **503** ("news temporarily unavailable"), never 500.
- **Small pool, fast timeouts** so failures fail fast instead of hanging:
  `maxPoolSize=5`, `serverSelectionTimeoutMS=4000`, `connectTimeoutMS=4000`,
  `socketTimeoutMS=8000`, `retryReads=True` (default).
- **Wrap every pymongo call in `asyncio.to_thread(...)`** — pymongo is
  blocking; calling it directly inside an async route stalls the event loop on
  0.1 vCPU (same reason `run_vn30f1m_sync` is offloaded).
- Always: **projection** (exclude `raw_text` in list), **lean on an index**,
  **`limit ≤ 20`**, **cursor pagination (no `skip`)** — see §4b/§6.
- Reads `MONGODB_URI` from env (read-only Atlas user — see §4e).

### 4b. `backend/db/news_queries.py` — projected, paginated reads
- `get_news(category=None, ticker=None, impact=None, cursor=None, limit=20)`
  - Base filter: `{ "status": "done" }` (+ optional `category`,
    `summary_json.tickers: ticker`, `summary_json.impact: impact`).
  - **Cursor pagination:** if `cursor` (an ISO `created_at`) is given, add
    `{ "created_at": { "$lt": parsed } }`. Sort `created_at: -1`. No `skip`.
  - **Projection excludes `raw_text`** and returns only:
    `_id`(→`url_hash` as `id`), `title`, `published_at`, `created_at`,
    `category`, `source_url`,
    `summary_json.{summary, tickers, impact, sector}`.
  - `limit` clamped to ≤ 20. Response includes `next_cursor` = `created_at` of
    the last item.
  - **Thin-summary fallback (§3a):** if the joined `summary` is `<80` chars (or
    missing), add `preview` = `raw_text[:280]` truncated on a word boundary.
    `raw_text` is fetched for the projection **only** when needed and never
    returned whole in the list. (Cheapest: always project a 280-char slice via
    `{ "$substrCP": ["$raw_text", 0, 280] }` so the full body never leaves Mongo.)
  - Defensive serialization: missing `summary_json`, empty `tickers`, `null`
    `impact`, mixed `published_at` all handled (never KeyError).
- `get_news_detail(url_hash)` — single doc by indexed `url_hash`
  (preferred over exposing raw `ObjectId`); validate it's 64-char hex; returns
  full doc incl. `raw_text` + `key_metrics`.
- `get_news_categories()` — static list of the 6 known categories (cheap; no DB
  round-trip needed).

### 4c. `backend/routers/news.py`
- **Auth gate (login required, any tier):** every route first calls
  `user = await get_current_user(request)` (from `routers.auth`) → **401** if
  not signed in. **No tier check** — free/pro/premium all pass. The per-user
  cache key can stay user-agnostic (news is identical for all tiers), so caching
  is still shared and cheap.
- `GET /api/news` → list; query params `category`, `ticker`, `impact`,
  `cursor`, `limit`. Wrapped in `get_cached(key, ttl=180, …)`; the Mongo call
  runs via `asyncio.to_thread(...)` (like `run_vn30f1m_sync`) so a cache-miss
  round-trip doesn't block the event loop. Uses `Depends(limit_concurrency)`.
- `GET /api/news/{url_hash}` → detail (full `raw_text` + `key_metrics`);
  `get_cached(ttl=600)`.
- Param validation mirrors existing routers (whitelist `category`/`impact`,
  regex-validate `ticker` and `url_hash`, clamp `limit`).
- Register in `main.py` next to the other routers:
  `from routers.news import router as news_router; app.include_router(news_router)`.

### 4d. `backend/requirements.txt`
Add `pymongo>=4.6` and `dnspython` (needed for the `mongodb+srv://` URI).

### 4e. Env / secrets / Atlas access
- Add `MONGODB_URI` to Render env (and local `.env`); **never commit it**.
  Document it in `CLAUDE.md`'s Environment Variables section.
- Use a **read-only** Atlas DB user for the app (the current creds are
  read/write — create a least-privilege user).
- Atlas **Network Access**: Render free-tier egress IPs are dynamic, so this
  likely needs `0.0.0.0/0`. (That open rule is why the local connect already
  succeeds.) Note this as the most probable "works locally, 503 in prod" cause.

---

## 5. Frontend (additive, mirrors `LTRSignalsTab.jsx`)

- **`frontend/src/components/NewsTab.jsx`** — replaces the
  `App.jsx:295` "News Feed Coming Soon…" placeholder. Card list: title, relative
  date, category chip, impact badge (Positive=green / Negative=red /
  Neutral=gray / null=hidden), ticker chips (click → `onSelectStock`), the 3
  summary bullets. "Load more" button drives `next_cursor`. Reuse
  `SkeletonCard`, the `GOLD` palette, and `'Outfit'` font from existing tabs.
  Optional filter bar: category + impact.
- **`App.jsx`** — swap the placeholder block for
  `<ErrorBoundary><NewsTab onSelectStock={handleSelectStock} /></ErrorBoundary>`.
  (`activeTab === 'news'` routing already exists.)
- **`Header.jsx`** — add `{ id: 'news', label: 'News' }` to `navTabs` (route is
  already wired, just missing from the nav bar) — desktop + mobile both render
  from this array.
- **`services/stock_api.js`** — add `getNews(filters)` and
  `getNewsDetail(urlHash)`. Because the endpoint is **cookie-gated**, these calls
  must send credentials: use a `withCredentials: true` axios call (the global
  client doesn't set it; either pass the per-call option or reuse the
  `AuthContext` axios instance). Same `try/catch` + `localStorage` fallback
  pattern as `getAISignals`. On **401**, surface a "sign in" state, not an error.
- **`NewsTab.jsx`** gates on `useAuth()`: unauthenticated users see a
  "Sign in to read market news" CTA (mirror the `UpgradeOverlay` pattern in
  `LTRSignalsTab.jsx`, but pointing to `login`/`register` instead of upgrade).
  In a card, show the `summary` bullets; if the API returned a `preview`
  (thin-summary case), render that instead.

---

## 6. One-time index (run once against Atlas)

```js
db.articles.createIndex(
  { status: 1, created_at: -1 },
  { name: "status_created_at", background: true }
)
```
Backs the default list query and cursor pagination. Optional secondary index if
category filtering proves slow: `{ status: 1, category: 1, created_at: -1 }`.

---

## 7. Why this won't break existing functionality

- **No shared state with NeonDB.** New Mongo client is a separate module; the
  SQLAlchemy engine, routers, background tasks, and migrations are untouched.
- **No startup coupling.** Client is lazy + fail-fast; `lifespan` is not
  modified, so a down Atlas cannot delay boot or affect `/api/health`,
  `/api/stocks`, signals, auth, or payments.
- **Bounded resources.** `status:"done"` + index + projection (no `raw_text`) +
  `limit ≤ 20` + cursor (no deep skip) respect Render 512 MB / 0.1 vCPU and the
  Vercel 4.5 MB response cap. Reads go through the existing `get_cached`
  TTL cache and `limit_concurrency` semaphore.
- **Frontend is purely additive** — one new component, one new nav entry, two
  new API functions; no existing component or service signature changes.
- **Graceful degradation.** Mongo failure → 503 + frontend shows "News
  temporarily unavailable" (with stale localStorage fallback), while every
  other tab keeps working.

---

## 8. Build order (suggested)

1. Create the `{status:1, created_at:-1}` index + read-only Atlas user.
2. `db/mongo.py` → `db/news_queries.py` → `routers/news.py`; register + add deps;
   smoke-test `/api/news` and `/api/news/{url_hash}` locally.
3. `getNews`/`getNewsDetail` in `stock_api.js`.
4. `NewsTab.jsx`; wire into `App.jsx`; add nav entry in `Header.jsx`.
5. Set `MONGODB_URI` on Render, confirm Atlas network access, deploy, verify the
   tab loads and other tabs are unaffected.
6. Update `CLAUDE.md` (new subsystem + `MONGODB_URI` env var).
