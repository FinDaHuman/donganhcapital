import axios from 'axios';

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

// --- localStorage Cache Helpers ---
const CACHE_PREFIX = 'dac_cache_';
const ANALYTICS_CACHE_TTL_MS = 5 * 60 * 1000;

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

function getAnalyticsCacheKey(path, filters = {}) {
    const normalized = Object.keys(filters)
        .sort()
        .reduce((acc, key) => {
            acc[key] = filters[key];
            return acc;
        }, {});
    return `analytics_${path}_${JSON.stringify(normalized)}`;
}

export function readCachedAnalytics(path, filters = {}, maxAgeMs = ANALYTICS_CACHE_TTL_MS) {
    const cached = getCached(getAnalyticsCacheKey(path, filters), maxAgeMs);
    if (cached && !cached.stale) return cached;
    if (cached?.data) return cached.data;
    return null;
}

// --- API Functions ---

export const getLoadingProgress = async () => {
    // No catch: the caller polls this and needs to distinguish a real
    // "0 stocks loaded" answer from a failed request so it can back off.
    const response = await api.get(`/loading-progress`);
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

const buildAnalyticsParams = (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '' && value !== 'ALL') {
            params.append(key, value);
        }
    });
    const query = params.toString();
    return query ? `?${query}` : '';
};

const fetchAnalytics = async (path, filters = {}, fallback = {}) => {
    try {
        const response = await api.get(`${path}${buildAnalyticsParams(filters)}`);
        const data = response.data;
        setCache(getAnalyticsCacheKey(path, filters), data);
        return data;
    } catch (error) {
        console.error(`Error fetching analytics from ${path}:`, error);
        const cached = readCachedAnalytics(path, filters);
        if (cached) return cached;
        return fallback;
    }
};

export const getDataAnalystBootstrap = async (filters = {}) =>
    fetchAnalytics('/analytics/bootstrap', filters, {
        overview: {
            summary: {},
            daily_activity: {},
            series: { signal_trend_30d: [], trade_close_trend_30d: [], equity_curve: [] },
            freshness: [],
            alerts: [],
        },
        health: {
            summary: {},
            freshness: [],
            coverage: { unmapped_tickers: [] },
            anomalies: [],
        },
    });

export const getDataAnalystOverview = async (filters = {}) =>
    fetchAnalytics('/analytics/overview', filters, {
        summary: {},
        daily_activity: {},
        series: { signal_trend_30d: [], trade_close_trend_30d: [], equity_curve: [] },
        freshness: [],
        alerts: [],
    });

export const getDataAnalystSignals = async (filters = {}) =>
    fetchAnalytics('/analytics/signals', filters, {
        summary: {},
        series: { signal_trend: [], probability_buckets: [], sector_distribution: [], top_tickers: [] },
        tables: { recent_signals: [] },
    });

export const getDataAnalystTrades = async (filters = {}) =>
    fetchAnalytics('/analytics/trades', filters, {
        summary: {},
        series: { outcome_breakdown: [], return_distribution: [], equity_curve: [] },
        tables: { ticker_leaderboard: [], sector_leaderboard: [], open_trades: [], recent_trades: [] },
    });

export const getDataAnalystMarket = async (filters = {}) =>
    fetchAnalytics('/analytics/market', filters, {
        summary: { breadth: {} },
        series: { sector_performance: [], liquidity_leaders: [], return_distribution: [], vnindex: [] },
    });

export const getDataAnalystPipelineHealth = async () =>
    fetchAnalytics('/analytics/pipeline-health', {}, {
        summary: {},
        freshness: [],
        coverage: { unmapped_tickers: [] },
        anomalies: [],
    });

export const subscribeEmail = async (email, honeypot = '') => {
    // Honeypot check — if filled, silently succeed (bot trap)
    if (honeypot) return { status: 'ok', message: 'Subscribed!' };

    // Client-side sanitization before sending
    const sanitized = email.trim().toLowerCase();
    if (!sanitized || sanitized.length > 254) throw new Error('Invalid email');

    const response = await api.post(`/subscribe`, { email: sanitized });
    return response.data;
};

