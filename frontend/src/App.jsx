import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Plot from 'react-plotly.js';

function App() {
    const [tickers, setTickers] = useState([]);
    const [selectedTicker, setSelectedTicker] = useState('');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

    // Fetch Tickers on mount
    useEffect(() => {
        axios.get(`${API_URL}/tickers`)
            .then(res => {
                setTickers(res.data.tickers);
                if (res.data.tickers.length > 0) {
                    setSelectedTicker(res.data.tickers[0]);
                }
            })
            .catch(err => {
                console.error("Error fetching tickers:", err);
                setError("Không thể tải danh sách mã chứng khoán. Backend có thể chưa chạy.");
            });
    }, []);

    // Fetch Prediction when ticker changes
    useEffect(() => {
        if (!selectedTicker) return;

        setLoading(true);
        setError(null);
        setData(null);

        // Call the synchronous/optimized endpoint
        axios.get(`${API_URL}/predict_sync/${selectedTicker}`)
            .then(res => {
                setData(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching prediction:", err);
                if (err.response && err.response.data && err.response.data.detail) {
                    setError(err.response.data.detail);
                } else {
                    setError("Lỗi khi tải dữ liệu dự báo. Vui lòng thử lại sau.");
                }
                setLoading(false);
            });
    }, [selectedTicker]);

    // Prepare Chart Data
    const getChartTraces = () => {
        if (!data) return [];

        const history = data.history;
        const forecast = data.forecast;
        const lower = data.lower_bound;
        const upper = data.upper_bound;

        // 1. History Candles
        const historyTrace = {
            x: history.map(d => d.Date),
            close: history.map(d => d.Close),
            decreasing: { line: { color: '#F44336' } }, // Red
            high: history.map(d => d.High),
            increasing: { line: { color: '#4CAF50' } }, // Green
            low: history.map(d => d.Low),
            open: history.map(d => d.Open),
            type: 'candlestick',
            xaxis: 'x',
            yaxis: 'y',
            name: 'Lịch sử'
        };

        // 2. Forecast Candles
        const forecastTrace = {
            x: forecast.map(d => d.Date),
            close: forecast.map(d => d.Close),
            decreasing: { line: { color: '#FF9800' } }, // Orange
            high: forecast.map(d => d.High),
            increasing: { line: { color: '#2196F3' } }, // Blue
            low: forecast.map(d => d.Low),
            open: forecast.map(d => d.Open),
            type: 'candlestick',
            xaxis: 'x',
            yaxis: 'y',
            name: 'Dự báo (XGBoost)'
        };

        // 3. Confidence Band (Upper) - Hidden Line
        const upperTrace = {
            x: forecast.map(d => d.Date),
            y: upper,
            type: 'scatter',
            mode: 'lines',
            line: { width: 0 },
            marker: { color: '#444' },
            showlegend: false,
            name: 'Upper Bound'
        };

        // 4. Confidence Band (Lower) - Filled to Upper
        const lowerTrace = {
            x: forecast.map(d => d.Date),
            y: lower,
            type: 'scatter',
            mode: 'lines',
            line: { width: 0 },
            marker: { color: '#444' },
            fill: 'tonexty', // Fill to the previous trace (Upper)
            fillcolor: 'rgba(200, 200, 200, 0.4)', // Light Gray
            showlegend: true,
            name: 'Vùng tin cậy (95%)'
        };

        // Order matters for fill='tonexty': Upper then Lower
        return [historyTrace, upperTrace, lowerTrace, forecastTrace];
    };

    return (
        <div className="container">
            <h1>Dự Báo Giá Chứng Khoán (XGBoost)</h1>

            <div className="controls">
                <label>Chọn Mã Chứng Khoán: </label>
                <select
                    value={selectedTicker}
                    onChange={(e) => setSelectedTicker(e.target.value)}
                    disabled={loading}
                >
                    {tickers.map(t => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
            </div>

            {error && <div className="error">{error}</div>}

            <div className="chart-container">
                {loading && <div className="loading">Đang chạy mô hình XGBoost...</div>}

                {data && !loading && (
                    <Plot
                        data={getChartTraces()}
                        layout={{
                            title: `Biểu đồ giá & Dự báo: ${selectedTicker}`,
                            xaxis: {
                                title: 'Ngày',
                                type: 'date',
                                rangeslider: { visible: false }
                            },
                            yaxis: {
                                title: 'Giá (VND)',
                                autorange: true
                            },
                            autosize: true,
                            height: 600,
                            showlegend: true,
                            margin: { l: 50, r: 50, t: 50, b: 50 }
                        }}
                        useResizeHandler={true}
                        style={{ width: "100%", height: "100%" }}
                    />
                )}
            </div>
        </div>
    );
}

export default App;
