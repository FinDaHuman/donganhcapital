import React, { useState, useEffect, useMemo } from 'react';
import { getAISignals, getAISignalsDates, getAISignalsSummary, getTradeHistory } from '../services/stock_api';

const SortIndicator = ({ sortConfig, columnKey }) => {
    if (!sortConfig || sortConfig.key !== columnKey) return null;
    return <span className="ml-1 text-blue-400">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
};

const STATUS_COLORS = {
    TP: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', label: 'Take Profit' },
    SL: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', label: 'Stop Loss' },
    TIMEOUT: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', label: 'Timeout' },
    HOLD: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Holding' },
};

// Static lookup for filter button active styles (dynamic classes get purged by Tailwind)
const STATUS_FILTER_STYLES = {
    TP: { active: 'bg-green-500/20 border-green-500/50 ring-1 ring-green-500/30', count: 'text-green-400' },
    SL: { active: 'bg-red-500/20 border-red-500/50 ring-1 ring-red-500/30', count: 'text-red-400' },
    TIMEOUT: { active: 'bg-yellow-500/20 border-yellow-500/50 ring-1 ring-yellow-500/30', count: 'text-yellow-400' },
    HOLD: { active: 'bg-blue-500/20 border-blue-500/50 ring-1 ring-blue-500/30', count: 'text-blue-400' },
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
    const [statusFilter, setStatusFilter] = useState(null);
    const [tradesLoading, setTradesLoading] = useState(true);
    const [minWinRate, setMinWinRate] = useState(0);
    const [sortConfig, setSortConfig] = useState({ key: 'entry_date', direction: 'desc' });

    // Active section
    const [activeSection, setActiveSection] = useState('signals');

    useEffect(() => {
        const fetchDates = async () => {
            const [fetchedDates, fetchedSummary] = await Promise.all([
                getAISignalsDates(),
                getAISignalsSummary()
            ]);

            // Get today's date in YYYY-MM-DD format (Vietnam timezone)
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

            // Add today to the dates list if not already present
            let allDates = fetchedDates;
            if (!fetchedDates.includes(today)) {
                allDates = [today, ...fetchedDates];
            }

            setDates(allDates);
            setSummary(fetchedSummary);

            // Default to today
            setSelectedDate(today);
            fetchSignals(today);
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

    const fetchTradeData = async () => {
        setTradesLoading(true);
        const history = await getTradeHistory();
        setTrades(history);
        setTradesLoading(false);
    };

    const handleDateChange = (e) => {
        const newDate = e.target.value;
        setSelectedDate(newDate);
        fetchSignals(newDate);
    };

    const handleStatusFilter = (status) => {
        setStatusFilter(statusFilter === status ? null : status);
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredTrades = useMemo(() => {
        return trades.filter(trade => {
            if (minWinRate > 0 && (!trade.prob || trade.prob < minWinRate)) return false;
            if (statusFilter && trade.status !== statusFilter) return false;
            return true;
        });
    }, [trades, minWinRate, statusFilter]);

    const sortedTrades = useMemo(() => {
        const sorted = [...filteredTrades];
        if (!sortConfig) return sorted;

        sorted.sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];

            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return sortConfig.direction === 'asc' ? 1 : -1;
            if (bVal == null) return sortConfig.direction === 'asc' ? -1 : 1;

            if (sortConfig.key === 'prob' || sortConfig.key === 'return_pct') {
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }

            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [filteredTrades, sortConfig]);

    const dynamicStats = useMemo(() => {
        const tpCount = filteredTrades.filter(t => t.status === 'TP').length;
        const slCount = filteredTrades.filter(t => t.status === 'SL').length;
        const timeoutCount = filteredTrades.filter(t => t.status === 'TIMEOUT').length;
        const holdCount = filteredTrades.filter(t => t.status === 'HOLD').length;

        const closedTrades = filteredTrades.filter(t => ['TP', 'SL', 'TIMEOUT'].includes(t.status));
        const winRate = closedTrades.length > 0 ? ((tpCount / closedTrades.length) * 100).toFixed(1) : 0;

        const validReturns = closedTrades.map(t => t.return_pct).filter(r => r != null);
        const avgReturn = validReturns.length > 0 ? ((validReturns.reduce((a, b) => a + b, 0) / validReturns.length) * 100).toFixed(2) : 0;
        const bestReturn = validReturns.length > 0 ? (Math.max(...validReturns) * 100).toFixed(2) : 0;

        const validDays = closedTrades.map(t => t.holding_days).filter(d => d != null);
        const avgHoldingDays = validDays.length > 0 ? (validDays.reduce((a, b) => a + b, 0) / validDays.length).toFixed(1) : 0;

        return {
            total_trades: filteredTrades.length,
            tp_count: tpCount,
            sl_count: slCount,
            timeout_count: timeoutCount,
            hold_count: holdCount,
            win_rate: Number(winRate),
            avg_return: Number(avgReturn),
            best_return: Number(bestReturn),
            avg_holding_days: Number(avgHoldingDays)
        };
    }, [filteredTrades]);

    return (
        <div className="flex-1 overflow-y-auto p-6 bg-[#000]">
            <div className="max-w-6xl mx-auto">
                {/* Section Tabs */}
                <div className="flex gap-1 mb-6 bg-[#111213] rounded-xl p-1 border border-gray-800">
                    <button
                        onClick={() => setActiveSection('signals')}
                        className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm tracking-wide transition-all ${activeSection === 'signals'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                            : 'text-gray-400 hover:text-white hover:bg-[#1a1c1e]'
                            }`}
                    >
                        AI Breakout Signals
                    </button>
                    <button
                        onClick={() => setActiveSection('history')}
                        className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm tracking-wide transition-all ${activeSection === 'history'
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
                        ) : data.signals.length === 0 ? (() => {
                            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
                            const isToday = selectedDate === today;
                            return (
                                <div className="bg-[#111213] border border-gray-800 rounded-xl p-10 text-center animate-fade-in">
                                    <h3 className="text-xl text-gray-300 mb-2">No signals found for {selectedDate}</h3>
                                    {isToday ? (
                                        <p className="text-gray-500">Signals are generated daily at <span className="text-blue-400 font-medium">3:02 PM (Vietnam time)</span>. Check back after the pipeline completes.</p>
                                    ) : (
                                        <p className="text-gray-500">The AI model did not detect any breakout patterns on this date.</p>
                                    )}
                                </div>
                            );
                        })() : (
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
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-gray-800 pb-4">
                            <h2 className="text-2xl font-bold text-white">Trade History</h2>
                            <div className="flex flex-wrap items-center gap-3 text-sm">
                                <span className="text-gray-400">Min Win Rate:</span>
                                <select
                                    value={minWinRate}
                                    onChange={(e) => setMinWinRate(Number(e.target.value))}
                                    className="bg-[#111213] border border-gray-800 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 transition-colors"
                                >
                                    <option value={0}>Any</option>
                                    <option value={0.6}>&ge; 60%</option>
                                    <option value={0.7}>&ge; 70%</option>
                                    <option value={0.8}>&ge; 80%</option>
                                    <option value={0.9}>&ge; 90%</option>
                                </select>
                            </div>
                        </div>

                        {/* Portfolio Stats Cards */}
                        {dynamicStats.total_trades > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Trades</div>
                                    <div className="text-2xl font-bold text-white">{dynamicStats.total_trades}</div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Win Rate</div>
                                    <div className={`text-2xl font-bold ${dynamicStats.win_rate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                                        {dynamicStats.win_rate}%
                                    </div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Return</div>
                                    <div className={`text-2xl font-bold ${dynamicStats.avg_return >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {dynamicStats.avg_return > 0 ? '+' : ''}{dynamicStats.avg_return}%
                                    </div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Best Trade</div>
                                    <div className="text-2xl font-bold text-green-400">+{dynamicStats.best_return}%</div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Hold Days</div>
                                    <div className="text-2xl font-bold text-blue-400">{dynamicStats.avg_holding_days}</div>
                                </div>
                            </div>
                        )}

                        {/* Status breakdown mini-cards */}
                        {dynamicStats.total_trades > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                                {[
                                    { key: 'TP', count: dynamicStats.tp_count },
                                    { key: 'SL', count: dynamicStats.sl_count },
                                    { key: 'TIMEOUT', count: dynamicStats.timeout_count },
                                    { key: 'HOLD', count: dynamicStats.hold_count },
                                ].map(({ key, count }) => (
                                    <button
                                        key={key}
                                        onClick={() => handleStatusFilter(key)}
                                        className={`p-3 rounded-lg border transition-all text-center min-h-[64px] ${statusFilter === key
                                                ? STATUS_FILTER_STYLES[key].active
                                                : 'bg-[#111213] border-gray-800 hover:border-gray-600'
                                            }`}
                                    >
                                        <div className={`text-lg font-bold ${STATUS_FILTER_STYLES[key].count}`}>{count}</div>
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
                        ) : sortedTrades.length === 0 ? (
                            <div className="bg-[#111213] border border-gray-800 rounded-xl p-10 text-center">
                                <h3 className="text-xl text-gray-300 mb-2">No trades found</h3>
                                <p className="text-gray-500">No trade history is available with the current filters.</p>
                            </div>
                        ) : (
                            <div className="bg-[#111213] border border-gray-800 rounded-xl overflow-hidden">
                                {/* ── Mobile card list (< md) ── */}
                                <div className="md:hidden space-y-2 p-2">
                                    {sortedTrades.map((trade, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => onSelectStock(trade.stock_id)}
                                            className="bg-[#111213] border border-gray-800 rounded-xl p-4 cursor-pointer active:bg-[#1a1c1e] transition-colors"
                                        >
                                            {/* Ticker + Status */}
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-sm shrink-0">
                                                        {trade.stock_id.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-white leading-tight">{trade.stock_id}</div>
                                                        <div className="text-xs text-gray-500">{trade.entry_date}</div>
                                                    </div>
                                                </div>
                                                <StatusBadge status={trade.status} />
                                            </div>
                                            {/* Entry / TP / SL prices */}
                                            <div className="grid grid-cols-3 gap-1.5 mb-3 text-xs">
                                                <div className="bg-[#1a1c1e] rounded-lg p-2 text-center">
                                                    <div className="text-gray-500 mb-0.5">Entry</div>
                                                    <div className="text-white font-medium">{trade.entry_price?.toFixed(2) ?? '—'}</div>
                                                </div>
                                                <div className="bg-[#1a1c1e] rounded-lg p-2 text-center">
                                                    <div className="text-green-500/70 mb-0.5">TP</div>
                                                    <div className="text-green-400 font-medium">{trade.tp_price?.toFixed(2) ?? '—'}</div>
                                                </div>
                                                <div className="bg-[#1a1c1e] rounded-lg p-2 text-center">
                                                    <div className="text-red-500/70 mb-0.5">SL</div>
                                                    <div className="text-red-400 font-medium">{trade.sl_price?.toFixed(2) ?? '—'}</div>
                                                </div>
                                            </div>
                                            {/* Return / Win Rate / Days */}
                                            <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-800/50">
                                                <span className={`font-bold ${trade.return_pct == null ? 'text-gray-500' : trade.return_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {trade.return_pct != null ? `${(trade.return_pct * 100).toFixed(2)}%` : '—'}
                                                </span>
                                                {trade.prob != null && (
                                                    <span className="text-blue-400 text-xs">WR {(trade.prob * 100).toFixed(1)}%</span>
                                                )}
                                                <span className="text-gray-500 text-xs">
                                                    {trade.holding_days != null ? `${trade.holding_days}d` : '—'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* ── Desktop table (≥ md) ── */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-800 bg-[#0a0a0c]">
                                                <th onClick={() => handleSort('stock_id')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-left px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold select-none">Stock<SortIndicator sortConfig={sortConfig} columnKey="stock_id" /></th>
                                                <th onClick={() => handleSort('entry_date')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-left px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold select-none">Entry Date<SortIndicator sortConfig={sortConfig} columnKey="entry_date" /></th>
                                                <th onClick={() => handleSort('prob')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-right px-5 py-3.5 text-xs text-blue-500/80 uppercase tracking-wider font-semibold select-none">Win Rate<SortIndicator sortConfig={sortConfig} columnKey="prob" /></th>
                                                <th onClick={() => handleSort('entry_price')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-right px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold select-none">Entry<SortIndicator sortConfig={sortConfig} columnKey="entry_price" /></th>
                                                <th onClick={() => handleSort('tp_price')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-right px-5 py-3.5 text-xs text-green-500/50 uppercase tracking-wider font-semibold select-none">TP<SortIndicator sortConfig={sortConfig} columnKey="tp_price" /></th>
                                                <th onClick={() => handleSort('sl_price')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-right px-5 py-3.5 text-xs text-red-500/50 uppercase tracking-wider font-semibold select-none">SL<SortIndicator sortConfig={sortConfig} columnKey="sl_price" /></th>
                                                <th onClick={() => handleSort('exit_date')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-left px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold select-none">Exit Date<SortIndicator sortConfig={sortConfig} columnKey="exit_date" /></th>
                                                <th onClick={() => handleSort('exit_price')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-right px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold select-none">Exit Price<SortIndicator sortConfig={sortConfig} columnKey="exit_price" /></th>
                                                <th onClick={() => handleSort('status')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-center px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold select-none">Status<SortIndicator sortConfig={sortConfig} columnKey="status" /></th>
                                                <th onClick={() => handleSort('return_pct')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-right px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold select-none">Return<SortIndicator sortConfig={sortConfig} columnKey="return_pct" /></th>
                                                <th onClick={() => handleSort('holding_days')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-right px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold select-none">Days<SortIndicator sortConfig={sortConfig} columnKey="holding_days" /></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedTrades.map((trade, idx) => (
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
                                                    <td className="px-5 py-4 text-right text-blue-400 font-medium">{trade.prob != null ? `${(trade.prob * 100).toFixed(1)}%` : '—'}</td>
                                                    <td className="px-5 py-4 text-right text-gray-200 font-medium">{trade.entry_price?.toFixed(2)}</td>
                                                    <td className="px-5 py-4 text-right text-green-400/80 font-medium">{trade.tp_price?.toFixed(2)}</td>
                                                    <td className="px-5 py-4 text-right text-red-400/80 font-medium">{trade.sl_price?.toFixed(2)}</td>
                                                    <td className="px-5 py-4 text-gray-400 text-xs">{trade.exit_date || '—'}</td>
                                                    <td className="px-5 py-4 text-right text-gray-200 font-medium">{trade.exit_price?.toFixed(2) || '—'}</td>
                                                    <td className="px-5 py-4 text-center"><StatusBadge status={trade.status} /></td>
                                                    <td className={`px-5 py-4 text-right font-bold ${trade.return_pct == null ? 'text-gray-500' :
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