import React, { useState, useEffect, useMemo } from 'react';
import { getAISignals, getAISignalsDates, getAISignalsSummary, getTradeHistory } from '../services/stock_api';
import { SkeletonCard, SkeletonChart } from './SkeletonLoader';
import { AlertTriangle } from 'lucide-react';
import {
    computeTradeStats,
    formatDays,
    formatPercent,
    formatSignedPercent,
    rateToneClass,
    returnToneClass,
} from '../utils/tradeStats';

// The confidence level at or above which breakout signals are treated as
// publishable. Unlike the BCD model, breakout_model.pkl ships no best_threshold
// and ai_signals carries no model_threshold column, so this is a fixed
// site-side cut rather than a value read from the model.
const MODEL_THRESHOLD = 0.85;

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
    const [minWinRate, setMinWinRate] = useState(MODEL_THRESHOLD);
    const [sortConfig, setSortConfig] = useState({ key: 'entry_date', direction: 'desc' });

    // Active section — default to Trade History
    const [activeSection, setActiveSection] = useState('history');

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

    const baseTrades = useMemo(() => {
        return trades.filter(trade => {
            if (minWinRate > 0 && (!trade.prob || trade.prob < minWinRate)) return false;
            return true;
        });
    }, [trades, minWinRate]);

    const filteredTrades = useMemo(() => {
        return baseTrades.filter(trade => {
            if (statusFilter && trade.status !== statusFilter) return false;
            return true;
        });
    }, [baseTrades, statusFilter]);

    const statusCounts = useMemo(() => {
        return {
            TP: baseTrades.filter(t => t.status === 'TP').length,
            SL: baseTrades.filter(t => t.status === 'SL').length,
            TIMEOUT: baseTrades.filter(t => t.status === 'TIMEOUT').length,
            HOLD: baseTrades.filter(t => t.status === 'HOLD').length,
        };
    }, [baseTrades]);

    const sortedTrades = useMemo(() => {
        const sorted = [...filteredTrades];
        if (!sortConfig) return sorted;

        sorted.sort((a, b) => {
            // For return_pct, HOLD trades sort by live_return_pct
            let aVal = (sortConfig.key === 'return_pct' && a.status === 'HOLD')
                ? (a.live_return_pct ?? a.return_pct)
                : a[sortConfig.key];
            let bVal = (sortConfig.key === 'return_pct' && b.status === 'HOLD')
                ? (b.live_return_pct ?? b.return_pct)
                : b[sortConfig.key];

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

    const dynamicStats = useMemo(() => computeTradeStats(filteredTrades), [filteredTrades]);

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

                        {/* Model disclaimer. This tab is the flagship signals view and
                            had none at all, while the LTR and BCD tabs both did. */}
                        <div
                            className="flex items-start gap-3 p-3 rounded-xl mb-6 text-xs text-gray-400 leading-relaxed"
                            style={{ background: 'rgba(201,169,110,0.05)', border: '1px solid rgba(201,169,110,0.15)' }}
                        >
                            <AlertTriangle size={14} style={{ color: '#C9A96E', marginTop: 1, flexShrink: 0 }} />
                            <span>
                                <strong style={{ color: '#C9A96E' }}>Confidence</strong> is the model's own score for a setup, computed from historical data — it is not a win rate, not an accuracy figure and not a forecast of return.
                                Entry, take-profit and stop-loss are technical levels the model derived; they are not orders and not price targets we suggest you trade.
                                Thông tin tham khảo, <strong style={{ color: '#C9A96E' }}>không phải khuyến nghị đầu tư</strong>. Đầu tư chứng khoán có rủi ro mất vốn.
                            </span>
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
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
                                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
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
                                                Confidence: <span className={sig.prob > 0.6 ? 'text-green-400' : 'text-blue-400'}>{(sig.prob * 100).toFixed(1)}%</span>
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

                                        {sig.live_price != null && (
                                            <div className="mt-3 bg-[#0a0a0c] border border-gray-800/50 p-3 rounded-lg flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                                    </span>
                                                    <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Live</span>
                                                    <span className="text-gray-200 font-medium">{Number(sig.live_price).toFixed(2)}</span>
                                                    {sig.live_change_pct != null && (
                                                        <span className={`text-xs ${sig.live_change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                            {sig.live_change_pct >= 0 ? '+' : ''}{sig.live_change_pct.toFixed(2)}%
                                                        </span>
                                                    )}
                                                </div>
                                                {(sig.distance_to_tp_pct != null || sig.distance_to_sl_pct != null) && (
                                                    <div className="flex gap-3 text-xs">
                                                        {sig.distance_to_tp_pct != null && (
                                                            <span className="text-green-400/70">TP {sig.distance_to_tp_pct >= 0 ? '+' : ''}{sig.distance_to_tp_pct.toFixed(1)}%</span>
                                                        )}
                                                        {sig.distance_to_sl_pct != null && (
                                                            <span className="text-red-400/70">SL {sig.distance_to_sl_pct >= 0 ? '+' : ''}{sig.distance_to_sl_pct.toFixed(1)}%</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

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
                                <span className="text-gray-400">Min confidence:</span>
                                <select
                                    value={minWinRate}
                                    onChange={(e) => setMinWinRate(Number(e.target.value))}
                                    className="bg-[#111213] border border-gray-800 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 transition-colors"
                                >
                                    <option value={0}>Any</option>
                                    <option value={MODEL_THRESHOLD}>Above model threshold (&ge; 85%)</option>
                                    <option value={0.65}>&ge; 65%</option>
                                    <option value={0.75}>&ge; 75%</option>
                                    <option value={0.9}>&ge; 90%</option>
                                </select>
                            </div>
                        </div>

                        {/* Portfolio Stats Cards */}
                        {trades.length > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Trades</div>
                                    <div className="text-2xl font-bold text-white">{dynamicStats.total_trades}</div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1" title="Share of closed backtest trades that ended in profit. Historical, not a forecast.">Backtest Win Rate</div>
                                    <div className={`text-2xl font-bold ${rateToneClass(dynamicStats.win_rate)}`}>
                                        {formatPercent(dynamicStats.win_rate)}
                                    </div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Return</div>
                                    <div className={`text-2xl font-bold ${returnToneClass(dynamicStats.avg_return)}`}>
                                        {formatSignedPercent(dynamicStats.avg_return)}
                                    </div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Best Trade</div>
                                    <div className={`text-2xl font-bold ${returnToneClass(dynamicStats.best_return)}`}>
                                        {formatSignedPercent(dynamicStats.best_return)}
                                    </div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Hold Days</div>
                                    <div className={`text-2xl font-bold ${dynamicStats.avg_holding_days == null ? 'text-gray-500' : 'text-blue-400'}`}>
                                        {formatDays(dynamicStats.avg_holding_days)}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Status breakdown mini-cards */}
                        {trades.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                                {[
                                    { key: 'TP', count: statusCounts.TP },
                                    { key: 'SL', count: statusCounts.SL },
                                    { key: 'TIMEOUT', count: statusCounts.TIMEOUT },
                                    { key: 'HOLD', count: statusCounts.HOLD },
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
                            <div className="w-full animate-pulse">
                                <SkeletonChart />
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
                                    {sortedTrades.map((trade, idx) => {
                                        const mobileDisplayReturn = trade.status === 'HOLD' ? trade.live_return_pct : trade.return_pct;
                                        const mobileIsLive = trade.status === 'HOLD' && mobileDisplayReturn != null;
                                        return (
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
                                                <span className={`font-bold ${mobileDisplayReturn == null ? 'text-gray-500' : mobileDisplayReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {mobileDisplayReturn != null ? `${mobileIsLive ? '~' : ''}${(mobileDisplayReturn * 100).toFixed(2)}%` : '—'}
                                                </span>
                                                {trade.prob != null && (
                                                    <span className="text-blue-400 text-xs">Conf {(trade.prob * 100).toFixed(1)}%</span>
                                                )}
                                                <span className="text-gray-500 text-xs">
                                                    {trade.holding_days != null ? `${trade.holding_days}d` : '—'}
                                                </span>
                                            </div>
                                        </div>
                                        );})}
                                </div>

                                {/* ── Desktop table (≥ md) ── */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-800 bg-[#0a0a0c]">
                                                <th onClick={() => handleSort('stock_id')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-left px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold select-none">Stock<SortIndicator sortConfig={sortConfig} columnKey="stock_id" /></th>
                                                <th onClick={() => handleSort('entry_date')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-left px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold select-none">Entry Date<SortIndicator sortConfig={sortConfig} columnKey="entry_date" /></th>
                                                <th onClick={() => handleSort('prob')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-right px-5 py-3.5 text-xs text-blue-500/80 uppercase tracking-wider font-semibold select-none">Confidence<SortIndicator sortConfig={sortConfig} columnKey="prob" /></th>
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
                                            {sortedTrades.map((trade, idx) => {
                                            const displayReturn = trade.status === 'HOLD' ? trade.live_return_pct : trade.return_pct;
                                            const isLive = trade.status === 'HOLD' && displayReturn != null;
                                            return (
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
                                                    <td className={`px-5 py-4 text-right font-bold ${displayReturn == null ? 'text-gray-500' :
                                                        displayReturn >= 0 ? 'text-green-400' : 'text-red-400'
                                                        }`}>
                                                        {displayReturn != null ? `${isLive ? '~' : ''}${(displayReturn * 100).toFixed(2)}%` : '—'}
                                                    </td>
                                                    <td className="px-5 py-4 text-right text-gray-400">{trade.holding_days ?? '—'}</td>
                                                </tr>
                                            );})}
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
