import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import MarketBar from './components/MarketBar';
import Dashboard from './components/Dashboard';
import StockChart from './components/StockChart';
import { getPrediction, getTickers } from './services/stock_api';

function App() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [selectedTicker, setSelectedTicker] = useState(null);
    const [predictionData, setPredictionData] = useState(null);
    const [loading, setLoading] = useState(false);

    // Stock List State
    const [stockList, setStockList] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchStocks = async () => {
            try {
                const res = await getTickers();
                // res is { count: N, stocks: [...] }
                if (res && res.stocks) {
                    setStockList(res.stocks.sort());
                }
            } catch (e) {
                console.error("Failed to load stocks");
            }
        };
        fetchStocks();
    }, []);

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

    // Filter stocks
    const filteredStocks = stockList.filter(s => s.includes(searchTerm.toUpperCase()));

    return (
        <div className="flex h-screen overflow-hidden bg-black text-gray-200 font-sans selection:bg-blue-900">
            <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="flex-1 flex flex-col md:ml-[300px] ml-0 transition-all w-full h-full">
                {/* MarketBar Removed per user request */}

                <main className="flex-1 mt-14 overflow-hidden bg-black relative flex flex-col">
                    {activeTab === 'dashboard' && (
                        <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800">
                            <Dashboard onSelectStock={handleSelectStock} />
                        </div>
                    )}

                    {activeTab === 'chart' && (
                        <div className="h-full flex flex-row">
                            {/* Main Chart Area */}
                            <div className="flex-1 flex flex-col border-r border-gray-800">
                                {/* Sub-header for Chart - Removed per user request */}

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
                                            <span>Select a stock from the Stock List</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Stock List Sidebar */}
                            <div className="w-72 bg-[#050505] flex flex-col border-l border-gray-800">
                                <div className="h-12 border-b border-gray-800 flex items-center px-3 sticky top-0 bg-[#050505]">
                                    <input
                                        type="text"
                                        placeholder="Search Stock..."
                                        className="w-full bg-[#121212] border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    {filteredStocks.map(ticker => (
                                        <div
                                            key={ticker}
                                            onClick={() => handleSelectStock(ticker)}
                                            className={`p-3 border-b border-gray-800 cursor-pointer hover:bg-[#121212] flex justify-between items-center ${selectedTicker === ticker ? 'bg-[#121212] border-l-2 border-l-blue-500' : ''}`}
                                        >
                                            <span className="font-bold text-sm text-gray-200">{ticker}</span>
                                            <span className="text-xs text-blue-400">View</span>
                                        </div>
                                    ))}
                                    {filteredStocks.length === 0 && (
                                        <div className="p-4 text-center text-gray-500 text-xs">No stocks found</div>
                                    )}
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
