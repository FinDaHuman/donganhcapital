import React, { useState, useEffect } from 'react';
import { Search, Bell, Sun, User } from 'lucide-react';
import axios from 'axios';

const Header = () => {
    const [marketData, setMarketData] = useState(null);

    useEffect(() => {
        const fetchMarketIndex = async () => {
            try {
                // Fetch VNINDEX
                const res = await axios.get('https://finfo-api.vndirect.com.vn/v4/stock_prices?q=code:VNINDEX&sort=date&size=1');
                if (res.data && res.data.data && res.data.data.length > 0) {
                    setMarketData(res.data.data[0]);
                }
            } catch (err) {
                console.error("Failed to fetch VNINDEX", err);
            }
        };

        fetchMarketIndex();
        const interval = setInterval(fetchMarketIndex, 60000); // Update every minute
        return () => clearInterval(interval);
    }, []);

    const formatNumber = (num) => new Intl.NumberFormat('en-US').format(num);

    return (
        <header className="h-16 bg-[#0b0e11] border-b border-[#2a2e39] flex items-center justify-between px-6 pl-20 fixed top-0 w-full z-40">

            {/* Brand & Market Ticker */}
            <div className="flex items-center gap-8">
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                    DongAnh Capital
                </h1>

                {/* Live Ticker */}
                {marketData && (
                    <div className="flex items-center gap-4 text-sm bg-[#151924] px-4 py-1.5 rounded-full border border-[#2a2e39]">
                        <span className="font-bold text-gray-300">VNINDEX</span>
                        <span className={`font-mono font-medium ${marketData.change >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
                            {marketData.close}
                        </span>
                        <span className={`text-xs ${marketData.change >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
                            {marketData.change >= 0 ? '+' : ''}{((marketData.close - marketData.open) / marketData.open * 100).toFixed(2)}%
                        </span>
                    </div>
                )}
            </div>

            {/* Right Side Tools */}
            <div className="flex items-center gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
                    <input
                        type="text"
                        placeholder="Search symbol..."
                        className="bg-[#151924] text-gray-200 pl-10 pr-4 py-2 rounded-lg text-sm border border-[#2a2e39] focus:outline-none focus:border-blue-500 w-64 transition-all"
                    />
                </div>

                <button className="text-gray-400 hover:text-white transition-colors"><Bell size={20} /></button>
                <button className="text-gray-400 hover:text-white transition-colors"><Sun size={20} /></button>
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-xs cursor-pointer">
                    DA
                </div>
            </div>
        </header>
    );
};

export default Header;
