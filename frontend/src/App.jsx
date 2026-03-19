import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import StockChart from './components/StockChart';
import AIAnalystTab from './components/AIAnalystTab';
import { getPrediction, getTickers } from './services/stock_api';
import LandingPage from './components/LandingPage';
import { Search } from 'lucide-react';

function App() {
    const [activeTab, setActiveTab] = useState('home');
    const [selectedTicker, setSelectedTicker] = useState(null);
    const [predictionData, setPredictionData] = useState(null);
    const [error, setError] = useState(null);
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
        setError(null);
        setLoading(true);
        try {
            const data = await getPrediction(ticker);
            setPredictionData(data);
        } catch (e) {
            console.error("Fetch error:", e);
            setError(`Failed to load data for ${ticker}. Please try again.`);
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
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <Dashboard onSelectStock={handleSelectStock} />
                        </div>
                    )}

                    {activeTab === 'chart' && (
                        <div className="flex-1 w-full flex flex-row min-h-0 overflow-hidden" style={{ minHeight: '600px' }}>
                            {/* Main Chart Area */}
                            <div className="flex-1 flex flex-col border-r border-gray-800 min-w-0 min-h-0 overflow-hidden">
                                {/* Chart Container */}
                                <div className="flex-1 relative bg-black min-h-0 overflow-hidden">
                                    {loading ? (
                                        <div className="absolute inset-0 flex items-center justify-center bg-[#111213] flex-col gap-4 z-10">
                                            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                            <span className="text-gray-400 font-medium tracking-wide animate-pulse">Loading {selectedTicker} Data...</span>
                                        </div>
                                    ) : error ? (
                                        <div className="absolute inset-0 flex items-center justify-center bg-[#111213] flex-col gap-4 z-10">
                                            <div className="text-red-400 font-medium tracking-wide bg-red-500/10 px-4 py-2 rounded border border-red-500/20 shadow break-words max-w-md text-center">{error}</div>
                                            <div className="flex gap-4 mt-2">
                                                <button 
                                                    onClick={() => handleSelectStock(selectedTicker)}
                                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded transition-colors"
                                                >
                                                    Retry
                                                </button>
                                                <button 
                                                    onClick={() => { setError(null); setSelectedTicker(null); }}
                                                    className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded transition-colors"
                                                >
                                                    Back to Search
                                                </button>
                                            </div>
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

                    {activeTab === 'analyst' && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <AIAnalystTab onSelectStock={handleSelectStock} />
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
