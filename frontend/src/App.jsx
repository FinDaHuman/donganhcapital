import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import MarketBar from './components/MarketBar';
import Dashboard from './components/Dashboard';
import StockChart from './components/StockChart';
import { getPrediction } from './services/stock_api';

function App() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [selectedTicker, setSelectedTicker] = useState(null);
    const [predictionData, setPredictionData] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSelectStock = async (ticker) => {
        setSelectedTicker(ticker);
        setActiveTab('chart');
        setLoading(true);
        try {
            const data = await getPrediction(ticker);
            setPredictionData(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-black text-gray-200 font-sans selection:bg-blue-900">
            <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="flex-1 flex flex-col ml-[300px]">
                <MarketBar />

                <main className="flex-1 mt-14 overflow-y-auto bg-black scrollbar-thin scrollbar-thumb-gray-800">
                    {activeTab === 'dashboard' && (
                        <Dashboard onSelectStock={handleSelectStock} />
                    )}

                    {activeTab === 'chart' && (
                        <div className="h-full flex flex-row">
                            {/* Main Chart Area */}
                            <div className="flex-1 flex flex-col border-r border-gray-800">
                                {/* Sub-header for Chart */}
                                <div className="h-12 border-b border-gray-800 flex items-center px-4 justify-between bg-[#050505]">
                                    <div className="flex items-center gap-4">
                                        <h2 className="font-bold text-white text-lg tracking-wide">{selectedTicker || 'Select a Stock'}</h2>
                                        {loading && <span className="text-xs text-blue-500 animate-pulse">Loading Prediction...</span>}
                                    </div>
                                    {/* Buttons removed */}
                                </div>

                                {/* Chart Container */}
                                <div className="flex-1 relative bg-black">
                                    {predictionData ? (
                                        <StockChart
                                            history={predictionData.history}
                                            forecast={predictionData.forecast}
                                            showSMA={true}
                                            showRSI={true}
                                            lowerBound={predictionData.lower_bound}
                                            upperBound={predictionData.upper_bound}
                                        />
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-500 flex-col gap-2">
                                            <span>Select a stock from the Watchlist or Dashboard</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Watchlist Sidebar */}
                            <div className="w-72 bg-[#050505] flex flex-col border-l border-gray-800">
                                <div className="h-10 border-b border-gray-800 flex items-center px-4 font-bold text-sm text-gray-400">
                                    WATCHLIST
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    {/* Short hardcoded list for demo, or could use marketData if lifted */}
                                    {['FPT', 'VCB', 'VHM', 'HPG', 'MSN', 'MWG', 'TCB', 'VPB', 'STB', 'VIC'].map(ticker => (
                                        <div
                                            key={ticker}
                                            onClick={() => handleSelectStock(ticker)}
                                            className={`p-3 border-b border-gray-800 cursor-pointer hover:bg-[#121212] flex justify-between items-center ${selectedTicker === ticker ? 'bg-[#121212] border-l-2 border-l-blue-500' : ''}`}
                                        >
                                            <span className="font-bold text-sm text-gray-200">{ticker}</span>
                                            <span className="text-xs text-blue-400">View</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'news' && (
                        <div className="p-10 text-center text-gray-500">News Feed Coming Soon...</div>
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;
