import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import StockChart from './components/StockChart';
import { getTickers, getPrediction } from './services/stock_api';
import { Sliders, RefreshCw, AlertCircle } from 'lucide-react';

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
        if (!ticker) return;
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
        <Layout>
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Controls Bar */}
                <div className="bg-[#151924] p-4 rounded-xl border border-[#2a2e39] flex flex-wrap items-center justify-between gap-4 shadow-lg">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <select
                                className="appearance-none bg-[#0b0e11] text-white border border-[#2a2e39] rounded-lg py-2 pl-4 pr-10 focus:outline-none focus:border-blue-500 font-medium tracking-wide w-48 transition-colors"
                                onChange={(e) => handleTickerChange(e.target.value)}
                                value={selectedTicker || ''}
                            >
                                <option value="">-- Select Symbol --</option>
                                {tickers.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                                <svg className="fill-current h-4 w-4" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                            </div>
                        </div>

                        {selectedTicker && (
                            <div className="bg-[#2a2e39] px-3 py-1 rounded text-xs text-gray-400 font-mono">
                                XGBOOST GLOBAL MODEL v2
                            </div>
                        )}
                    </div>

                    {/* Toggles */}
                    <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${showSMA ? 'bg-purple-600 border-purple-600' : 'border-gray-500 bg-transparent'}`}>
                                {showSMA && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className="text-sm text-gray-400 group-hover:text-white transition-colors">MA Lines</span>
                            <input type="checkbox" checked={showSMA} onChange={(e) => setShowSMA(e.target.checked)} className="hidden" />
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer group">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${showRSI ? 'bg-pink-600 border-pink-600' : 'border-gray-500 bg-transparent'}`}>
                                {showRSI && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className="text-sm text-gray-400 group-hover:text-white transition-colors">RSI Panel</span>
                            <input type="checkbox" checked={showRSI} onChange={(e) => setShowRSI(e.target.checked)} className="hidden" />
                        </label>

                        <button className="p-2 text-gray-400 hover:text-white hover:bg-[#2a2e39] rounded transition-all">
                            <Sliders size={20} />
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                {error && (
                    <div className="bg-red-900/20 border border-red-500/50 text-red-200 px-6 py-4 rounded-xl flex items-center gap-3">
                        <AlertCircle size={24} className="text-red-500" />
                        <div>
                            <strong className="block font-bold">Unable to Load Data</strong>
                            <span className="text-sm opacity-80">{error}</span>
                        </div>
                    </div>
                )}

                {loading && (
                    <div className="h-[600px] flex flex-col justify-center items-center bg-[#151924] rounded-xl border border-[#2a2e39]">
                        <RefreshCw className="animate-spin text-blue-500 mb-4" size={48} />
                        <h3 className="text-xl font-medium text-gray-300">Analyzing Market Data...</h3>
                        <p className="text-gray-500 mt-2">Running Global XGBoost Inference</p>
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
                    <div className="h-[600px] flex flex-col justify-center items-center bg-[#151924] rounded-xl border border-[#2a2e39] border-dashed">
                        <div className="w-20 h-20 bg-[#1e222d] rounded-full flex items-center justify-center mb-6">
                            <LineChart className="text-gray-600" size={40} />
                        </div>
                        <h3 className="text-xl font-medium text-gray-300">Welcome to DongAnh Capital</h3>
                        <p className="text-gray-500 mt-2 max-w-md text-center">
                            Select a stock ticker from the dropdown above to view AI-powered price predictions and technical analysis.
                        </p>
                    </div>
                )}

            </div>
        </Layout>
    );
}

// Helper for icon (internal usage if not imported from lucide in App.jsx scope - but we imported it)
import { LineChart } from 'lucide-react';

export default App;
