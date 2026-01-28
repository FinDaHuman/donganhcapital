import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Bell, User } from 'lucide-react';

const MarketBar = () => {
    const [indices, setIndices] = useState([]);

    useEffect(() => {
        const fetchIndices = async () => {
            try {
                const codes = ['VNINDEX', 'VN30', 'HNXINDEX'];
                const p = codes.map(code =>
                    axios.get(`https://finfo-api.vndirect.com.vn/v4/stock_prices?q=code:${code}&sort=date&size=1`)
                );
                const results = await Promise.all(p);
                const data = results.map(r => r.data.data?.[0]).filter(Boolean);
                setIndices(data);
            } catch (err) {
                console.error("API Error", err);
            }
        };
        fetchIndices();
        const timer = setInterval(fetchIndices, 30000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="h-[60px] bg-[#111213] border-b border-[#2a2e39] flex items-center justify-between px-6 fixed top-0 left-[300px] right-0 z-40">
            {/* Ticker Tape */}
            <div className="flex items-center gap-6 overflow-hidden">
                <span className="font-bold text-lg text-white tracking-tight">DongAnh Capital</span>
                <div className="w-px h-6 bg-gray-700 mx-2"></div>
                {indices.map(idx => {
                    const change = (idx.close - idx.open);
                    const percent = (change / idx.open) * 100;
                    const color = change >= 0 ? 'text-[#00c853]' : 'text-[#d50000]';
                    return (
                        <div key={idx.code} className="flex items-center gap-2 text-sm">
                            <span className="font-bold text-gray-300">{idx.code}</span>
                            <span className={color}>{idx.close.toFixed(2)}</span>
                            <span className={`${color} text-xs`}>
                                {change > 0 ? '+' : ''}{change.toFixed(2)} ({percent.toFixed(2)}%)
                            </span>
                        </div>
                    )
                })}
            </div>

            {/* Right Tools - Cleared */}
            <div className="flex items-center gap-4">
                {/* Search removed per user request */}
            </div>
        </div>
    );
};

export default MarketBar;
