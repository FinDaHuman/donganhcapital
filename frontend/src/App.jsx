import React, { useState, useEffect } from 'react';
import StockChart from './components/StockChart';
import { getTickers, getPrediction } from './services/stock_api';

function App() {
    const [tickers, setTickers] = useState([]);
    const [selectedTicker, setSelectedTicker] = useState(null);
    const [predictionData, setPredictionData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Toggles
    const [showSMA, setShowSMA] = useState(true);
    const [showRSI, setShowRSI] = useState(true);

    useEffect(() => {
        getTickers().then(data => setTickers(data.tickers)).catch(err => console.error(err));
    }, []);

    const handleTickerChange = async (ticker) => {
        setSelectedTicker(ticker);
        setLoading(true);
        setError(null);
        setPredictionData(null);

        try {
            const data = await getPrediction(ticker);
            setPredictionData(data);
        } catch (err) {
            setError("Failed to fetch data.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800 mb-6">Stock Price Prediction (XGBoost)</h1>

                <div className="bg-white p-6 rounded-lg shadow-md mb-6 flex flex-wrap gap-4 items-center">
                    <div className="w-64">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Ticker</label>
                        <select
                            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border"
                            onChange={(e) => handleTickerChange(e.target.value)}
                            value={selectedTicker || ''}
                        >
                            <option value="">-- Choose Stock --</option>
                            {tickers.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>

                    {/* Toggles */}
                    <div className="flex items-center gap-4 mt-6">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" checked={showSMA} onChange={(e) => setShowSMA(e.target.checked)} className="form-checkbox h-5 w-5 text-blue-600" />
                            <span>Show SMA (5/20)</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" checked={showRSI} onChange={(e) => setShowRSI(e.target.checked)} className="form-checkbox h-5 w-5 text-pink-600" />
                            <span>Show RSI</span>
                        </label>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
                        <strong className="font-bold">Error!</strong>
                        <span className="block sm:inline"> {error}</span>
                    </div>
                )}

                {loading && (
                    <div className="flex justify-center items-center py-20 bg-white rounded-lg shadow-md">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
                        <span className="ml-4 text-xl text-gray-600">Training Global Model & Predicting... (May take a moment)</span>
                    </div>
                )}

                {!loading && predictionData && (
                    <StockChart
                        history={predictionData.history}
                        forecast={predictionData.forecast}
                        showSMA={showSMA}
                        showRSI={showRSI}
                        lowerBound={predictionData.lower_bound}
                        upperBound={predictionData.upper_bound}
                    />
                )}

                {!loading && !predictionData && !selectedTicker && (
                    <div className="text-center py-20 bg-white rounded-lg shadow-md text-gray-500">
                        Please select a ticker to view analysis.
                    </div>
                )}

            </div>
        </div>
    );
}

export default App;
