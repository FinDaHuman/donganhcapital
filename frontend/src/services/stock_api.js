import axios from 'axios';

const API_Base_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const getTickers = async () => {
    try {
        const response = await axios.get(`${API_Base_URL}/tickers`);
        return response.data;
    } catch (error) {
        console.error("Error fetching tickers:", error);
        throw error;
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
