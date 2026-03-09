import axios from 'axios';

// Use environment variable if available, otherwise fallback to production URL
const baseUrl = import.meta.env.VITE_API_URL || 'https://donganhcapital.onrender.com/api';
// Remove trailing slash if present to avoid // in requests
let API_Base_URL = baseUrl.replace(/\/$/, '');

// Auto-append /api if the environment variable missed it (prevents 404 errors)
if (!API_Base_URL.endsWith('/api')) {
    API_Base_URL += '/api';
}

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

export const getLoadingProgress = async () => {
    try {
        const response = await axios.get(`${API_Base_URL}/loading-progress`);
        return response.data; // { loaded: N, total: M }
    } catch (error) {
        console.error("Error fetching loading progress:", error);
        return { loaded: 0, total: 0 };
    }
};

export const getTickers = async () => {
    try {
        const response = await axios.get(`${API_Base_URL}/stocks`);
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
        const response = await axios.get(`${API_Base_URL}/market-status`);
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

export const getPrediction = async (ticker) => {
    try {
        const response = await axios.get(`${API_Base_URL}/predict/${ticker}`);
        return response.data;
    } catch (error) {
        console.error(`Error predicting for ${ticker}:`, error);
        throw error;
    }
};
