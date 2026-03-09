import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import StockChart from './components/StockChart';
import { getPrediction, getTickers } from './services/stock_api';
import LandingPage from './components/LandingPage';
import { Search } from 'lucide-react';

function App() {
    const [activeTab, setActiveTab] = useState('home');
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
        // Initial load
        fetchStocks();
        // Refresh every 120 seconds (reduced for free-tier backend)
        const interval = setInterval(fetchStocks, 120000);
        return () => clearInterval(interval);
    }, []);

    const handleSelectStock = async (ticker) => {
        setSearchTerm(''); // Clear search term when selected
        setSelectedTicker(ticker);
        setActiveTab('chart');
        setPredictionData(null); // Clear previous data to show loading screen
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
        <div className="w-full min-h-screen flex flex-col overflow-hidden text-gray-200 font-sans" style={{ backgroundColor: '#000' }}>
            {activeTab !== 'home' && <Header activeTab={activeTab} onTabChange={setActiveTab} />}

            <div className="flex-1 flex flex-col w-full min-h-0 relative">
                <main className="flex-1 overflow-hidden relative flex flex-col min-h-0" style={{ backgroundColor: '#000' }}>

                    {activeTab === 'home' && (
                        <div className="h-full w-full overflow-y-auto">
                            <LandingPage onTabChange={setActiveTab} />
                        </div>
                    )}

                    {activeTab === 'dashboard' && (
                        <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800">
                            <Dashboard onSelectStock={handleSelectStock} />
                        </div>
                    )}

                    {activeTab === 'chart' && (
                        <div className="h-full w-full flex flex-row min-h-0 overflow-hidden">
                            {/* Main Chart Area */}
                            <div className="flex-1 flex flex-col border-r border-gray-800 min-w-0 min-h-0 overflow-hidden">
                                {/* Chart Container */}
                                <div className="flex-1 relative bg-black min-h-0 overflow-hidden">
                                    {loading ? (
                                        <div className="absolute inset-0 flex items-center justify-center bg-[#111213] flex-col gap-4 z-10">
                                            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                            <span className="text-gray-400 font-medium tracking-wide animate-pulse">Loading {selectedTicker} Data...</span>
                                        </div>
                                    ) : predictionData ? (
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
                                        <div className="absolute inset-0 flex items-center justify-center bg-[#111213]/80 backdrop-blur-sm z-20">
                                            <div className="w-[450px] bg-[#1a1c1e] border border-[#2a2e39] rounded-2xl shadow-2xl flex flex-col max-h-[60vh] overflow-hidden">
                                                <div className="p-5 border-b border-[#2a2e39] flex items-center gap-3 bg-[#151719]">
                                                    <Search size={20} className="text-gray-500" />
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        placeholder="Search stock ticker to view chart..."
                                                        className="flex-1 bg-transparent border-none text-white focus:outline-none text-lg placeholder-gray-600"
                                                        value={searchTerm}
                                                        onChange={(e) => setSearchTerm(e.target.value)}
                                                    />
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-gray-800 bg-[#1a1c1e]">
                                                    {filteredStocks.map(s => (
                                                        <div
                                                            key={s}
                                                            onClick={() => handleSelectStock(s)}
                                                            className="px-4 py-3 mb-1 cursor-pointer rounded-xl hover:bg-[#25282c] text-gray-200 flex justify-between items-center transition-all bg-[#1e2024]/50 border border-transparent hover:border-[#3a3e49]"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-lg bg-[#25282c] flex items-center justify-center font-bold text-gray-400">
                                                                    {s.charAt(0)}
                                                                </div>
                                                                <span className="font-bold text-lg text-white tracking-wide">{s}</span>
                                                            </div>
                                                            <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-md uppercase tracking-wider">Select</span>
                                                        </div>
                                                    ))}
                                                    {filteredStocks.length === 0 && (
                                                        <div className="p-10 text-center text-gray-500 flex flex-col items-center gap-3">
                                                            <Search size={32} className="text-gray-600 opacity-50" />
                                                            <span>No stocks found matching "{searchTerm}"</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
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
