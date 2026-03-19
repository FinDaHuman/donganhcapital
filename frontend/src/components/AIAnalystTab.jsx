import React, { useState, useEffect } from 'react';
import { getAISignals, getAISignalsDates, getAISignalsSummary, getTradeHistory, getTradeHistoryStats } from '../services/stock_api';

const STATUS_COLORS = {
    TP: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', label: 'Take Profit' },
    SL: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', label: 'Stop Loss' },
    TIMEOUT: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', label: 'Timeout' },
    HOLD: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Holding' },
};

const StatusBadge = ({ status }) => {
    const style = STATUS_COLORS[status] || STATUS_COLORS.HOLD;
    return (
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${style.bg} ${style.text} ${style.border} border`}>
            {status}
        </span>
    );
};

const AIAnalystTab = ({ onSelectStock }) => {
    const [dates, setDates] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [data, setData] = useState({ signal_count: 0, signals: [] });
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState([]);

    // Trade history state
    const [trades, setTrades] = useState([]);
    const [tradeStats, setTradeStats] = useState({ total_trades: 0 });
    const [statusFilter, setStatusFilter] = useState(null);
    const [tradesLoading, setTradesLoading] = useState(true);

    // Active section
    const [activeSection, setActiveSection] = useState('signals');

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
        fetchTradeData();
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

    const fetchTradeData = async (status = null) => {
        setTradesLoading(true);
        const [history, stats] = await Promise.all([
            getTradeHistory(status),
            status ? Promise.resolve(tradeStats) : getTradeHistoryStats()
        ]);
        setTrades(history);
        if (!status) setTradeStats(stats);
        setTradesLoading(false);
    };

    const handleDateChange = (e) => {
        const newDate = e.target.value;
        setSelectedDate(newDate);
        fetchSignals(newDate);
    };

    const handleStatusFilter = (status) => {
        const newStatus = statusFilter === status ? null : status;
        setStatusFilter(newStatus);
        fetchTradeData(newStatus);
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 bg-[#000]">
            <div className="max-w-6xl mx-auto">
                {/* Section Tabs */}
                <div className="flex gap-1 mb-6 bg-[#111213] rounded-xl p-1 border border-gray-800">
                    <button
                        onClick={() => setActiveSection('signals')}
                        className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm tracking-wide transition-all ${
                            activeSection === 'signals'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                : 'text-gray-400 hover:text-white hover:bg-[#1a1c1e]'
                        }`}
                    >
                         AI Breakout Signals
                    </button>
                    <button
                        onClick={() => setActiveSection('history')}
                        className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm tracking-wide transition-all ${
                            activeSection === 'history'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                : 'text-gray-400 hover:text-white hover:bg-[#1a1c1e]'
                        }`}
                    >
                         Trade History
                    </button>
                </div>

                {/* ==================== SIGNALS SECTION ==================== */}
                {activeSection === 'signals' && (
                    <div className="animate-fade-in">
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
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Selected Date</div>
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
                                <p className="text-gray-500">The AI model did not detect any breakout patterns on this date.</p>
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
                                                <div className="text-lg text-gray-200 font-medium">{Number(sig.entry_price).toFixed(2)}</div>
                                            </div>
                                            <div className="bg-[#0a0a0c] p-3 rounded-lg border border-gray-800/50 flex flex-col items-end">
                                                <div className="text-xs text-green-500/70 mb-1 uppercase tracking-wider font-semibold">Take Profit</div>
                                                <div className="text-lg text-green-400 font-medium">{Number(sig.tp_price).toFixed(2)}</div>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-red-500/5 border border-red-500/10 p-3 rounded-lg flex justify-between items-center">
                                            <span className="text-xs text-red-400/70 uppercase tracking-wider font-semibold">Stop Loss</span>
                                            <span className="text-red-400 font-medium">{Number(sig.sl_price).toFixed(2)}</span>
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
                )}

                {/* ==================== TRADE HISTORY SECTION ==================== */}
                {activeSection === 'history' && (
                    <div className="animate-fade-in">
                        <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
                            <h2 className="text-2xl font-bold text-white">Trade History</h2>
                        </div>

                        {/* Portfolio Stats Cards */}
                        {tradeStats.total_trades > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Trades</div>
                                    <div className="text-2xl font-bold text-white">{tradeStats.total_trades}</div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Win Rate</div>
                                    <div className={`text-2xl font-bold ${tradeStats.win_rate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                                        {tradeStats.win_rate}%
                                    </div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Return</div>
                                    <div className={`text-2xl font-bold ${tradeStats.avg_return >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {tradeStats.avg_return > 0 ? '+' : ''}{tradeStats.avg_return}%
                                    </div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Best Trade</div>
                                    <div className="text-2xl font-bold text-green-400">+{tradeStats.best_return}%</div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Hold Days</div>
                                    <div className="text-2xl font-bold text-blue-400">{tradeStats.avg_holding_days}</div>
                                </div>
                            </div>
                        )}

                        {/* Status breakdown mini-cards */}
                        {tradeStats.total_trades > 0 && (
                            <div className="grid grid-cols-4 gap-3 mb-6">
                                {[
                                    { key: 'TP', count: tradeStats.tp_count, color: 'green' },
                                    { key: 'SL', count: tradeStats.sl_count, color: 'red' },
                                    { key: 'TIMEOUT', count: tradeStats.timeout_count, color: 'yellow' },
                                    { key: 'HOLD', count: tradeStats.hold_count, color: 'blue' },
                                ].map(({ key, count, color }) => (
                                    <button
                                        key={key}
                                        onClick={() => handleStatusFilter(key)}
                                        className={`p-3 rounded-lg border transition-all text-center ${
                                            statusFilter === key
                                                ? `bg-${color}-500/20 border-${color}-500/50 ring-1 ring-${color}-500/30`
                                                : 'bg-[#111213] border-gray-800 hover:border-gray-600'
                                        }`}
                                    >
                                        <div className={`text-lg font-bold text-${color}-400`}>{count}</div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wider mt-0.5">{STATUS_COLORS[key].label}</div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Trade History Table */}
                        {tradesLoading ? (
                            <div className="flex justify-center items-center py-20">
                                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : trades.length === 0 ? (
                            <div className="bg-[#111213] border border-gray-800 rounded-xl p-10 text-center">
                                <h3 className="text-xl text-gray-300 mb-2">No trades found</h3>
                                <p className="text-gray-500">No trade history is available{statusFilter ? ` for status "${statusFilter}"` : ''}.</p>
                            </div>
                        ) : (
                            <div className="bg-[#111213] border border-gray-800 rounded-xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-800 bg-[#0a0a0c]">
                                                <th className="text-left px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold">Stock</th>
                                                <th className="text-left px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold">Entry Date</th>
                                                <th className="text-right px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold">Entry</th>
                                                <th className="text-right px-5 py-3.5 text-xs text-green-500/50 uppercase tracking-wider font-semibold">TP</th>
                                                <th className="text-right px-5 py-3.5 text-xs text-red-500/50 uppercase tracking-wider font-semibold">SL</th>
                                                <th className="text-left px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold">Exit Date</th>
                                                <th className="text-right px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold">Exit Price</th>
                                                <th className="text-center px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold">Status</th>
                                                <th className="text-right px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold">Return</th>
                                                <th className="text-right px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold">Days</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {trades.map((trade, idx) => (
                                                <tr 
                                                    key={idx}
                                                    onClick={() => onSelectStock(trade.stock_id)}
                                                    className="border-b border-gray-800/50 hover:bg-[#1a1c1e] cursor-pointer transition-colors group"
                                                >
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-sm">
                                                                {trade.stock_id.charAt(0)}
                                                            </div>
                                                            <span className="font-bold text-white group-hover:text-blue-400 transition-colors">{trade.stock_id}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4 text-gray-400 text-xs">{trade.entry_date}</td>
                                                    <td className="px-5 py-4 text-right text-gray-200 font-medium">{trade.entry_price?.toFixed(2)}</td>
                                                    <td className="px-5 py-4 text-right text-green-400/80 font-medium">{trade.tp_price?.toFixed(2)}</td>
                                                    <td className="px-5 py-4 text-right text-red-400/80 font-medium">{trade.sl_price?.toFixed(2)}</td>
                                                    <td className="px-5 py-4 text-gray-400 text-xs">{trade.exit_date || '—'}</td>
                                                    <td className="px-5 py-4 text-right text-gray-200 font-medium">{trade.exit_price?.toFixed(2) || '—'}</td>
                                                    <td className="px-5 py-4 text-center"><StatusBadge status={trade.status} /></td>
                                                    <td className={`px-5 py-4 text-right font-bold ${
                                                        trade.return_pct == null ? 'text-gray-500' :
                                                        trade.return_pct >= 0 ? 'text-green-400' : 'text-red-400'
                                                    }`}>
                                                        {trade.return_pct != null ? `${(trade.return_pct * 100).toFixed(2)}%` : '—'}
                                                    </td>
                                                    <td className="px-5 py-4 text-right text-gray-400">{trade.holding_days ?? '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIAnalystTab;
