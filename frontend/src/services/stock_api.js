import axios from 'axios';
import { attachColdStartHandling } from './serverWake';

// Use environment variable if available, otherwise fallback to production URL
const baseUrl = import.meta.env.VITE_API_URL || 'https://api.donganhcapital.com/api';
// Remove trailing slash if present to avoid // in requests
let API_Base_URL = baseUrl.replace(/\/$/, '');

// Auto-append /api if the environment variable missed it (prevents 404 errors)
if (!API_Base_URL.endsWith('/api')) {
    API_Base_URL += '/api';
}

// Shared client with a hard timeout: when the network path stalls (proxy
// mitigation, cold start, flaky mobile), requests must fail fast so the UI
// can fall back to cache instead of hanging for minutes.
//
// withCredentials is required, not optional: the signal, prediction and
// analytics endpoints this client calls are now behind authentication, and the
// session lives in httpOnly cookies that the browser will not attach without it.
// (The backend enables allow_credentials whenever ALLOWED_ORIGINS names specific
// origins rather than "*", which is the case in both local and production setups.)
const api = axios.create({ baseURL: API_Base_URL, timeout: 15000, withCredentials: true });

// The 15s above is the *warm* budget. While the backend is still waking from
// its idle spin-down, this stretches it to cover the boot instead of failing
// every call on a first visit — and drops back to 15s the moment the server
// answers anything. See services/serverWake.js.
attachColdStartHandling(api);

// --- localStorage Cache Helpers ---
const CACHE_PREFIX = 'dac_cache_';

function getCached(key, maxAgeMs) {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts < maxAgeMs) return data;
        // Stale but return it anyway for instant display while fetching fresh
        return { data, stale: true };
    } catch {
        return null;
    }
}

function setCache(key, data) {
    try {
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
    } catch {
        // localStorage full or unavailable, silently ignore
    }
}

// --- API Functions ---

export const getLoadingProgress = async ({ timeout } = {}) => {
    // No catch: the caller polls this and needs to distinguish a real
    // "0 stocks loaded" answer from a failed request so it can back off.
    //
    // The caller may pass a timeout far longer than the 15s default. The
    // backend sleeps when idle and takes ~2 minutes to boot, and Render
    // *queues* the request that triggers the wake rather than refusing it —
    // so a single long-lived request resolves the moment the server is ready.
    // Aborting at 15s and retrying only throws that queued slot away.
    const response = await api.get(`/loading-progress`, timeout ? { timeout } : undefined);
    return response.data; // { loaded: N, total: M }
};

export const getTickers = async () => {
    try {
        const response = await api.get(`/stocks`);
        const data = response.data;
        if (data && Array.isArray(data.stocks)) {
            setCache('tickers', data);
        }
        return data;
    } catch (error) {
        console.error("Error fetching tickers:", error);
        // Return cached data if server fails
        const cached = getCached('tickers', 24 * 60 * 60 * 1000); // 24h fallback
        if (cached && !cached.stale) return cached;
        if (cached?.data) return cached.data;
        throw error;
    }
};

export const getMarketStatus = async () => {
    try {
        const response = await api.get(`/market-status`);
        const data = response.data;
        if (data && Array.isArray(data) && data.length > 0) {
            setCache('market_status', data);
        }
        return data;
    } catch (error) {
        console.error("Error fetching market status:", error);
        // Return cached data if server fails
        const cached = getCached('market_status', 24 * 60 * 60 * 1000); // 24h fallback
        if (cached && !cached.stale) return cached;
        if (cached?.data) return cached.data;
        return [];
    }
};

export const getCachedMarketStatus = () => {
    const cached = getCached('market_status', 10 * 60 * 1000); // 10 min fresh
    if (cached && !cached.stale) return cached;
    if (cached?.data) return cached.data;
    return null;
};

export const getVnindex = async (limit = 264) => {
    try {
        const response = await api.get(`/vnindex?limit=${limit}`);
        const data = response.data;
        if (Array.isArray(data) && data.length > 0) {
            setCache('vnindex', data);
        }
        return data;
    } catch (error) {
        console.error("Error fetching VNINDEX:", error);
        const cached = getCached('vnindex', 24 * 60 * 60 * 1000); // 24h fallback
        if (cached && !cached.stale) return cached;
        if (cached?.data) return cached.data;
        return [];
    }
};

export const getPrediction = async (ticker) => {
    try {
        const response = await api.get(`/predict/${ticker}`);
        return response.data;
    } catch (error) {
        console.error(`Error predicting for ${ticker}:`, error);
        // Rethrow — there is no cached fallback for predictions, unlike the
        // endpoints above. Swallowing this returned undefined, so the caller's
        // catch never fired and the chart's error panel (with Retry) was
        // unreachable: a failed load silently dumped the user back to search.
        throw error;
    }
};

export const getAISignalsDates = async () => {
    try {
        const response = await api.get(`/ai-signals/dates`);
        return response.data;
    } catch (error) {
        console.error("Error fetching AI signal dates:", error);
        return [];
    }
};

export const getAISignals = async (date = null, latest = false) => {
    try {
        let url = `/ai-signals`;
        if (latest) url += '?latest=true';
        else if (date) url += `?date=${date}`;

        const response = await api.get(url);
        return response.data;
    } catch (error) {
        console.error("Error fetching AI signals:", error);
        return { date: null, signal_count: 0, signals: [] };
    }
};

export const getSectors = async () => {
    try {
        const response = await api.get(`/sectors`);
        return response.data;
    } catch (error) {
        console.error("Error fetching sectors:", error);
        return {};
    }
};

export const getAISignalsSummary = async () => {
    try {
        const response = await api.get(`/ai-signals/summary`);
        return response.data;
    } catch (error) {
        console.error("Error fetching AI signals summary:", error);
        return [];
    }
};

export const getTradeHistory = async (status = null) => {
    try {
        let url = `/trade-history`;
        if (status) url += `?status=${status}`;
        const response = await api.get(url);
        return response.data;
    } catch (error) {
        console.error("Error fetching trade history:", error);
        return [];
    }
};

export const getTradeHistoryStats = async () => {
    try {
        const response = await api.get(`/trade-history/stats`);
        return response.data;
    } catch (error) {
        console.error("Error fetching trade history stats:", error);
        return { total_trades: 0 };
    }
};

export const subscribeEmail = async (email, honeypot = '') => {
    // Honeypot check — if filled, silently succeed (bot trap)
    if (honeypot) return { status: 'ok', message: 'Subscribed!' };

    // Client-side sanitization before sending
    const sanitized = email.trim().toLowerCase();
    if (!sanitized || sanitized.length > 254) throw new Error('Invalid email');

    const response = await api.post(`/subscribe`, { email: sanitized });
    return response.data;
};

