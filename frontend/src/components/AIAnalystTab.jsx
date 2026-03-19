import React, { useState, useEffect } from 'react';
import { getAISignals, getAISignalsDates, getAISignalsSummary } from '../services/stock_api';

const AIAnalystTab = ({ onSelectStock }) => {
    const [dates, setDates] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [data, setData] = useState({ signal_count: 0, signals: [] });
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState([]);

    useEffect(() => {
        const fetchDates = async () => {
            const [fetchedDates, fetchedSummary] = await Promise.all([
                getAISignalsDates(),
                getAISignalsSummary()
            ]);
            setDates(fetchedDates);
            setSummary(fetchedSummary);
            if (fetchedDates.length > 0) {
                setSelectedDate(fetchedDates[0]);
                fetchSignals(fetchedDates[0]);
            } else {
                fetchSignals(null, true);
            }
        };
        fetchDates();
    }, []);

    const fetchSignals = async (date, latest = false) => {
        setLoading(true);
        const result = await getAISignals(date, latest);
        setData(result);
        if (result.date && !selectedDate) {
            setSelectedDate(result.date);
        }
        setLoading(false);
    };

    const handleDateChange = (e) => {
        const newDate = e.target.value;
        setSelectedDate(newDate);
        fetchSignals(newDate);
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 bg-[#000]">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
                    <h2 className="text-2xl font-bold text-white">AI Breakout Signals</h2>
                    <div className="flex items-center gap-3">
                        <label className="text-gray-400 font-medium">Select Date:</label>
                        <select 
                            value={selectedDate} 
                            onChange={handleDateChange}
                            className="bg-[#1a1c1e] border border-gray-700 text-white rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
                        >
                            {dates.length === 0 && <option value="">No dates available</option>}
                            {dates.map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Summary Stats */}
                {summary.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Trading Days</div>
                            <div className="text-2xl font-bold text-white">{summary.length}</div>
                        </div>
                        <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Signals</div>
                            <div className="text-2xl font-bold text-blue-400">
                                {summary.reduce((acc, s) => acc + (s.signal_count || 0), 0)}
                            </div>
                        </div>
                        <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Today's Signals</div>
                            <div className="text-2xl font-bold text-green-400">{data.signal_count}</div>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : data.signals.length === 0 ? (
                    <div className="bg-[#111213] border border-gray-800 rounded-xl p-10 text-center animate-fade-in">
                        <h3 className="text-xl text-gray-300 mb-2">No signals found for {selectedDate}</h3>
                        <p className="text-gray-500">The AI model did not detect any breakout patterns today.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in">
                        {data.signals.map((sig, idx) => (
                            <div 
                                key={idx}
                                onClick={() => onSelectStock(sig.stock_id)}
                                className="bg-[#111213] border border-gray-800 rounded-xl p-5 hover:border-blue-500/50 hover:bg-[#1a1c1e] transition-all cursor-pointer group shadow-lg"
                            >
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-lg">
                                            {sig.stock_id.charAt(0)}
                                        </div>
                                        <h3 className="text-xl font-bold text-white">{sig.stock_id}</h3>
                                    </div>
                                    <div className="bg-[#1e2024] px-3 py-1 rounded-full text-sm font-medium text-gray-300">
                                        Win Rate: <span className={sig.prob > 0.6 ? 'text-green-400' : 'text-blue-400'}>{(sig.prob * 100).toFixed(1)}%</span>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="bg-[#0a0a0c] p-3 rounded-lg border border-gray-800/50">
                                        <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold">Entry</div>
                                        <div className="text-lg text-gray-200 font-medium">{sig.entry_price}</div>
                                    </div>
                                    <div className="bg-[#0a0a0c] p-3 rounded-lg border border-gray-800/50 flex flex-col items-end">
                                        <div className="text-xs text-green-500/70 mb-1 uppercase tracking-wider font-semibold">Take Profit</div>
                                        <div className="text-lg text-green-400 font-medium">{sig.tp_price}</div>
                                    </div>
                                </div>
                                
                                <div className="bg-red-500/5 border border-red-500/10 p-3 rounded-lg flex justify-between items-center">
                                    <span className="text-xs text-red-400/70 uppercase tracking-wider font-semibold">Stop Loss</span>
                                    <span className="text-red-400 font-medium">{sig.sl_price}</span>
                                </div>
                                
                                <div className="mt-4 pt-4 border-t border-gray-800/50 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-sm text-gray-500">View detailed chart</span>
                                    <span className="text-blue-400">→</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIAnalystTab;
