import React, { useState, useEffect } from 'react';
import Header from './components/Header';
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
        <div className="flex flex-col h-screen overflow-hidden bg-black text-gray-200 font-sans selection:bg-blue-900">
            <Header activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="flex-1 flex flex-col w-full h-full relative">
                {/* MarketBar Removed per user request */}

                <main className="flex-1 overflow-hidden bg-black relative flex flex-col">
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
                                            ticker={selectedTicker}
                                            stockList={stockList}
                                            onSelectStock={handleSelectStock}
                                        />
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-500 flex-col gap-2">
                                            <span>Select a stock from the Dashboard to view Chart</span>
                                        </div>
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
