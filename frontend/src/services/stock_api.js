import axios from 'axios';

// Use environment variable if available, otherwise fallback to production URL
const API_Base_URL = import.meta.env.VITE_API_URL || 'https://donganhcapital.onrender.com/api';

export const getTickers = async () => {
    try {
        const response = await axios.get(`${API_Base_URL}/stocks`);
        return response.data; // Expected { count: N, stocks: [...] }
    } catch (error) {
        console.error("Error fetching tickers:", error);
        throw error;
    }
};

export const getMarketStatus = async () => {
    try {
        const response = await axios.get(`${API_Base_URL}/market-status`);
        return response.data;
    } catch (error) {
        console.error("Error fetching market status:", error);
        // Fallback or empty to avoid crash
        return [];
    }
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
