import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { SkeletonCard, SkeletonChart } from './SkeletonLoader';
import { TrendingDown, BarChart2 } from 'lucide-react';
import {
    computeTradeStats,
    formatDays,
    formatPercent,
    formatSignedPercent,
    rateToneClass,
    returnToneClass,
} from '../utils/tradeStats';

const GOLD = '#C9A96E';
const MONO = "'DM Mono', monospace";

const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));

const ProbBadge = ({ prob, passed }) => {
    const display = (prob * 100).toFixed(1);
    const hue = passed ? GOLD : prob > 0.5 ? '#4ade80' : '#94a3b8';
    return (
        <span className="inline-flex items-center gap-1.5">
            <span
                className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums"
                style={{ background: `${hue}18`, color: hue, border: `1px solid ${hue}30` }}
            >
                {display}
            </span>
            {passed && (
                <span
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase"
                    style={{ background: `${GOLD}20`, color: GOLD, border: `1px solid ${GOLD}40` }}
                >
                    High
                </span>
            )}
        </span>
    );
};

// Sentinel for the Min Confidence dropdown: filter by the model's own
// threshold instead of a round number picked by hand. Named RECOMMENDED
// internally for continuity; the user-facing label deliberately avoids that
// word, which would imply advice.
const RECOMMENDED = 'recommended';

// The Min Confidence filter judges every trade by the model's *current*
// threshold, so this tooltip keeps the historical record visible: the threshold
// a trade was actually scored against, which retraining has since moved.
const confidenceTooltip = (trade) => {
    if (trade.prob == null) return undefined;
    const scored = `Scored ${(trade.prob * 100).toFixed(1)}%`;
    if (trade.model_threshold == null) return `${scored}.`;
    const side = trade.prob >= trade.model_threshold ? 'above' : 'below';
    const on = trade.signal_date ? ` on ${trade.signal_date}` : '';
    return `${scored} — ${side} the model's ${(trade.model_threshold * 100).toFixed(0)}% threshold in force${on}.`;
};

const SortIndicator = ({ sortConfig, columnKey }) => {
    if (!sortConfig || sortConfig.key !== columnKey) return null;
    return <span className="ml-1" style={{ color: GOLD }}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
};

const STATUS_COLORS = {
    TP: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', label: 'Take Profit' },
    SL: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', label: 'Stop Loss' },
    TIMEOUT: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', label: 'Timeout' },
    HOLD: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Holding' },
};

// A signal is a resting limit order on the B–C line: it is only a position once
// the market has traded down to that line.
const SIGNAL_STATUS = {
    WAITING: { text: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/10', label: 'Waiting for entry' },
    TRIGGERED: { text: 'text-green-400', border: 'border-green-500/30', bg: 'bg-green-500/10', label: 'Filled' },
    EXPIRED: { text: 'text-gray-400', border: 'border-gray-600/40', bg: 'bg-gray-500/10', label: 'Expired' },
};

const SignalStatusBadge = ({ status }) => {
    const s = SIGNAL_STATUS[status];
    if (!s) return null;
    return (
        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${s.bg} ${s.text} ${s.border}`}>
            {s.label}
        </span>
    );
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


const BCDSignalsTab = ({ onSelectStock, onTabChange }) => {
    const { authApi, refreshUser } = useAuth();
    // App.jsx has already established a signed-in, verified session, and there
    // is no paid tier above it — so there is nothing further to gate on here.

    // Signals state
    const [signals, setSignals] = useState([]);
    const [date, setDate] = useState('');
    const [dates, setDates] = useState([]);
    const [summary, setSummary] = useState([]);
    // The model's current decision threshold, served by /api/bcd-signals/summary.
    const [modelThreshold, setModelThreshold] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Trade history state
    const [trades, setTrades] = useState([]);
    const [tradesLoading, setTradesLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState(null);
    // Open on the model's own threshold rather than "Any": the unfiltered list
    // mixes in trades the model scored well below its decision point.
    const [minScore, setMinScore] = useState(RECOMMENDED);
    const [sortConfig, setSortConfig] = useState({ key: 'entry_date', direction: 'desc' });

    const [activeSection, setActiveSection] = useState('history');

    const fetchDates = useCallback(async () => {
        try {
            const res = await authApi.get('/api/bcd-signals/dates');
            return Array.isArray(res.data) ? res.data : [];
        } catch {
            return [];
        }
    }, [authApi]);

    const fetchSummary = useCallback(async () => {
        try {
            const res = await authApi.get('/api/bcd-signals/summary');
            const data = res.data ?? {};
            return {
                rows: Array.isArray(data.summary) ? data.summary : [],
                threshold: typeof data.model_threshold === 'number' ? data.model_threshold : null,
            };
        } catch {
            return { rows: [], threshold: null };
        }
    }, [authApi]);

    const fetchSignals = useCallback(async (targetDate = null) => {
        setLoading(true);
        setError(null);
        try {
            const url = targetDate
                ? `/api/bcd-signals?date=${targetDate}`
                : '/api/bcd-signals?latest=true';
            const res = await authApi.get(url);
            const data = res.data;
            setSignals(data.signals || []);
            if (data.date) setDate(data.date);
        } catch (err) {
            const status = err.response?.status;
            if (status === 403) {
                // Subscription may have expired mid-session — sync auth state
                // so the upgrade overlay renders automatically
                await refreshUser();
                setSignals([]);
            } else if (status !== 401) {
                setError('Failed to load signals. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    }, [authApi]);

    const fetchTrades = useCallback(async () => {
        setTradesLoading(true);
        try {
            const res = await authApi.get('/api/bcd-trade-history');
            setTrades(Array.isArray(res.data) ? res.data : []);
        } catch {
            setTrades([]);
        } finally {
            setTradesLoading(false);
        }
    }, [authApi]);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            const [fetchedDates, fetchedSummary] = await Promise.all([fetchDates(), fetchSummary()]);
            setDates(fetchedDates);
            setSummary(fetchedSummary.rows);
            setModelThreshold(fetchedSummary.threshold);
            await fetchSignals(null);
        };
        init();
        fetchTrades();
    }, [fetchDates, fetchSummary, fetchSignals, fetchTrades]);

    const handleDateChange = async (e) => {
        const d = e.target.value;
        setDate(d);
        await fetchSignals(d);
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

    // Falls back to the newest trade's own threshold only when the API has none
    // to give (fresh DB with no scored signals yet). `trades` arrives ordered
    // entry_date DESC, so the first non-null is the most recent.
    const activeThreshold = modelThreshold
        ?? trades.find(t => t.model_threshold != null)?.model_threshold
        ?? null;

    // Every option compares `prob` against a single floor, so the dropdown is a
    // monotone ladder: a stricter choice can never return more trades. The
    // threshold option deliberately uses *today's* threshold rather than each
    // row's stored `passed_threshold`, which was frozen against whatever
    // threshold shipped on its signal date (retraining moved it 0.71 -> 0.61).
    // Judging old rows at 0.71 while labelling the option "61%" is what made
    // "above model threshold" return fewer trades than the stricter 65% option.
    const baseTrades = useMemo(() => {
        const floor = minScore === RECOMMENDED ? activeThreshold : minScore;
        if (!floor) return trades;
        return trades.filter(trade => trade.prob != null && trade.prob >= floor);
    }, [trades, minScore, activeThreshold]);

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

    // Names whichever filters are actually narrowing the table, for the empty state.
    const activeFilterLabel = useMemo(() => {
        const parts = [];
        if (minScore === RECOMMENDED && activeThreshold != null) {
            parts.push(`the model threshold (≥ ${(activeThreshold * 100).toFixed(0)}%)`);
        } else if (minScore > 0) {
            parts.push(`≥ ${(minScore * 100).toFixed(0)}% confidence`);
        }
        if (statusFilter) parts.push(`status ${STATUS_COLORS[statusFilter].label}`);
        return parts.join(' and ');
    }, [minScore, activeThreshold, statusFilter]);

    const summaryTotals = useMemo(() => ({
        events: summary.reduce((acc, s) => acc + (s.signal_count || 0), 0),
        passed: summary.reduce((acc, s) => acc + (s.passed_count || 0), 0),
    }), [summary]);

    return (
        <div className="flex-1 overflow-y-auto p-6 bg-[#000]">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        BCD Recovery Signals
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Breakdown-reversal candidates · B-C-D pattern · Generated at 15:02 Vietnam time
                    </p>
                </div>

                {/* Section Tabs */}
                <div className="flex gap-1 mb-6 bg-[#111213] rounded-xl p-1 border border-gray-800">
                    <button
                        onClick={() => setActiveSection('signals')}
                        className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm tracking-wide transition-all ${activeSection === 'signals' ? '' : 'text-gray-400 hover:text-white hover:bg-[#1a1c1e]'}`}
                        style={activeSection === 'signals'
                            ? { background: GOLD, color: '#0d1117', boxShadow: `0 4px 14px ${GOLD}30` }
                            : undefined}
                    >
                        Recovery Signals
                    </button>
                    <button
                        onClick={() => setActiveSection('history')}
                        className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm tracking-wide transition-all ${activeSection === 'history' ? '' : 'text-gray-400 hover:text-white hover:bg-[#1a1c1e]'}`}
                        style={activeSection === 'history'
                            ? { background: GOLD, color: '#0d1117', boxShadow: `0 4px 14px ${GOLD}30` }
                            : undefined}
                    >
                        Trade History
                    </button>
                </div>

                {/* ==================== SIGNALS SECTION ==================== */}
                {activeSection === 'signals' && (
                    <div className="animate-fade-in">
                        <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
                            <h3 className="text-2xl font-bold text-white">Recovery Signals</h3>
                            <div className="flex items-center gap-3">
                                <label className="text-gray-400 font-medium">Select Date:</label>
                                <select
                                    value={date}
                                    onChange={handleDateChange}
                                    className="bg-[#1a1c1e] border border-gray-700 text-white rounded-md px-3 py-1.5 focus:outline-none cursor-pointer"
                                >
                                    {dates.length === 0 && date && <option value={date}>{date}</option>}
                                    {dates.length === 0 && !date && <option value="">No dates available</option>}
                                    {dates.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Model disclaimer */}
                        <div
                            className="flex items-start gap-3 p-3 rounded-xl mb-5 text-xs text-gray-400 leading-relaxed"
                            style={{ background: `${GOLD}08`, border: `1px solid ${GOLD}20` }}
                        >
                            <BarChart2 size={14} style={{ color: GOLD, marginTop: 1, flexShrink: 0 }} />
                            <span>
                                Scored by a LightGBM classifier on B-C-D breakdown events. Each signal is a
                                <strong style={{ color: GOLD }}> buy limit resting on the B–C line</strong>: it becomes a position only on the first
                                session whose low reaches that line, and is dropped if the market never comes back within 10 days.
                                TP/SL are +15% / −7% from the fill. <strong style={{ color: GOLD }}>Confidence Rate</strong> = model confidence that a
                                filled trade closes at take-profit rather than stop-loss — this is model confidence, not a win rate.
                                <strong style={{ color: GOLD }}> For research only</strong>, not financial advice.
                                Past performance does not guarantee future results.
                            </span>
                        </div>

                        {/* Summary Stats */}
                        {summary.length > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Event Days</div>
                                    <div className="text-2xl font-bold text-white">{summary.length}</div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Events</div>
                                    <div className="text-2xl font-bold" style={{ color: GOLD }}>{summaryTotals.events}</div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">High Confidence</div>
                                    <div className="text-2xl font-bold" style={{ color: GOLD }}>{summaryTotals.passed}</div>
                                </div>
                                <div className="bg-[#111213] border border-gray-800 rounded-lg p-4">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Signal Count</div>
                                    <div className="text-2xl font-bold text-green-400">{signals.length}</div>
                                </div>
                            </div>
                        )}

                        {loading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
                                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                                <p className="text-red-400 text-sm">{error}</p>
                                <button
                                    onClick={() => fetchSignals(date || null)}
                                    className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                                    style={{ background: '#1f2937', color: '#e2e8f0', border: '1px solid #374151' }}
                                >
                                    Retry
                                </button>
                            </div>
                        ) : signals.length === 0 ? (
                            <div className="bg-[#111213] border border-gray-800 rounded-xl p-10 text-center animate-fade-in">
                                <div
                                    className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                                    style={{ background: '#0d1117', border: '1px solid #1f2937' }}
                                >
                                    <TrendingDown size={24} className="text-gray-600" />
                                </div>
                                <h3 className="text-xl text-gray-300 mb-2">No breakdown events for {date || 'this date'}</h3>
                                <p className="text-gray-500 max-w-md mx-auto">
                                    Unlike ranked signals, this model only fires when a stock completes a
                                    B-C-D breakdown pattern — quiet days are normal.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in">
                                {signals.map((sig, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => onSelectStock(sig.stock_id)}
                                        className="bg-[#111213] border border-gray-800 rounded-xl p-5 hover:bg-[#1a1c1e] transition-all cursor-pointer group shadow-lg"
                                    >
                                        <div className="flex justify-between items-center mb-4">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg"
                                                    style={{ background: `${GOLD}18`, color: GOLD }}
                                                >
                                                    {sig.stock_id.charAt(0)}
                                                </div>
                                                <h3 className="text-xl font-bold text-white">{sig.stock_id}</h3>
                                            </div>
                                            <div className="bg-[#1e2024] pl-3 pr-1.5 py-1 rounded-full text-sm font-medium text-gray-300 flex items-center gap-1.5">
                                                Confidence Rate: <ProbBadge prob={sig.prob} passed={sig.passed_threshold} />
                                            </div>
                                        </div>

                                        {(() => {
                                            const filled = sig.status === 'TRIGGERED';
                                            // While waiting, the level moves with the B–C line, so quote
                                            // today's line and the TP/SL it would imply.
                                            const level = filled ? sig.entry_price : sig.line_price_today;
                                            const tp = filled ? sig.tp_price : (level != null ? level * 1.15 : null);
                                            const sl = filled ? sig.sl_price : (level != null ? level * 0.93 : null);
                                            return (
                                                <>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <SignalStatusBadge status={sig.status} />
                                                        <span className="text-xs text-gray-500" style={{ fontFamily: MONO }}>
                                                            {filled
                                                                ? `Filled ${sig.entry_date}`
                                                                : sig.status === 'EXPIRED'
                                                                    ? 'Never reached the line'
                                                                    : sig.expires_on ? `Expires ${sig.expires_on}` : ''}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                                        <div className="bg-[#0a0a0c] p-3 rounded-lg border border-gray-800/50">
                                                            <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold">
                                                                {filled ? 'Entry' : 'Buy Limit Today'}
                                                            </div>
                                                            <div className="text-lg text-gray-200 font-medium" style={{ fontFamily: MONO }}>{fmt(level)}</div>
                                                        </div>
                                                        <div className="bg-[#0a0a0c] p-3 rounded-lg border border-gray-800/50 flex flex-col items-end">
                                                            <div className="text-xs text-green-500/70 mb-1 uppercase tracking-wider font-semibold">Take Profit</div>
                                                            <div className="text-lg text-green-400 font-medium" style={{ fontFamily: MONO }}>{fmt(tp)}</div>
                                                        </div>
                                                    </div>

                                                    <div className="bg-red-500/5 border border-red-500/10 p-3 rounded-lg flex justify-between items-center">
                                                        <span className="text-xs text-red-400/70 uppercase tracking-wider font-semibold">Stop Loss</span>
                                                        <span className="text-red-400 font-medium" style={{ fontFamily: MONO }}>{fmt(sl)}</span>
                                                    </div>
                                                </>
                                            );
                                        })()}

                                        {sig.live_price != null && (
                                            <div className="mt-3 bg-[#0a0a0c] border border-gray-800/50 p-3 rounded-lg flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: GOLD }}></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: GOLD }}></span>
                                                    </span>
                                                    <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Live</span>
                                                    <span className="text-gray-200 font-medium" style={{ fontFamily: MONO }}>{Number(sig.live_price).toFixed(2)}</span>
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

                                        {/* B-C-D pattern trace */}
                                        <div className="mt-3 text-xs text-gray-400 whitespace-nowrap overflow-x-auto" style={{ fontFamily: MONO }}>
                                            Peak {fmt(sig.peak_price)} → B {fmt(sig.b_price)} → C {fmt(sig.c_price)}
                                        </div>

                                        <div className="mt-4 pt-4 border-t border-gray-800/50 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-sm text-gray-500">View detailed chart</span>
                                            <span style={{ color: GOLD }}>→</span>
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
                            <h3 className="text-2xl font-bold text-white">Trade History</h3>
                            <div className="flex flex-wrap items-center gap-3 text-sm">
                                <span className="text-gray-400">Min Confidence:</span>
                                <select
                                    value={minScore}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setMinScore(v === RECOMMENDED ? RECOMMENDED : Number(v));
                                    }}
                                    className="bg-[#111213] border border-gray-800 text-white rounded-lg px-3 py-1.5 focus:outline-none transition-colors"
                                >
                                    <option value={0}>Any</option>
                                    <option value={RECOMMENDED} disabled={activeThreshold == null}>
                                        {/* Was "Recommended", which reads as advice. It is simply the
                                            model's own decision threshold. Disabled when unknown, so
                                            it can never be selected without a floor to apply. */}
                                        Above model threshold{activeThreshold != null ? ` (≥ ${(activeThreshold * 100).toFixed(0)}%)` : ''}
                                    </option>
                                    <option value={0.65}>&ge; 65%</option>
                                    <option value={0.75}>&ge; 75%</option>
                                    <option value={0.85}>&ge; 85%</option>
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
                                    <div
                                        className="text-2xl font-bold"
                                        style={{ color: dynamicStats.avg_holding_days == null ? undefined : GOLD }}
                                    >
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
                                {trades.length === 0 ? (
                                    <>
                                        <h3 className="text-xl text-gray-300 mb-2">No trades yet</h3>
                                        <p className="text-gray-500 max-w-md mx-auto">
                                            Every breakdown-recovery signal with valid Entry, TP, and SL levels
                                            appears here while its trade lifecycle is tracked.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <h3 className="text-xl text-gray-300 mb-2">No trades match this filter</h3>
                                        <p className="text-gray-500 max-w-md mx-auto">
                                            {trades.length} tracked {trades.length === 1 ? 'trade' : 'trades'}, none
                                            matching {activeFilterLabel}.
                                        </p>
                                    </>
                                )}
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
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                                                            style={{ background: `${GOLD}18`, color: GOLD }}
                                                        >
                                                            {trade.stock_id.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-white leading-tight">{trade.stock_id}</div>
                                                            <div className="text-xs text-gray-500">{trade.entry_date}</div>
                                                        </div>
                                                    </div>
                                                    <StatusBadge status={trade.status} />
                                                </div>
                                                <div className="grid grid-cols-3 gap-1.5 mb-3 text-xs">
                                                    <div className="bg-[#1a1c1e] rounded-lg p-2 text-center">
                                                        <div className="text-gray-500 mb-0.5">Entry</div>
                                                        <div className="text-white font-medium" style={{ fontFamily: MONO }}>{trade.entry_price?.toFixed(2) ?? '—'}</div>
                                                    </div>
                                                    <div className="bg-[#1a1c1e] rounded-lg p-2 text-center">
                                                        <div className="text-green-500/70 mb-0.5">TP</div>
                                                        <div className="text-green-400 font-medium" style={{ fontFamily: MONO }}>{trade.tp_price?.toFixed(2) ?? '—'}</div>
                                                    </div>
                                                    <div className="bg-[#1a1c1e] rounded-lg p-2 text-center">
                                                        <div className="text-red-500/70 mb-0.5">SL</div>
                                                        <div className="text-red-400 font-medium" style={{ fontFamily: MONO }}>{trade.sl_price?.toFixed(2) ?? '—'}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-800/50">
                                                    <span className={`font-bold ${mobileDisplayReturn == null ? 'text-gray-500' : mobileDisplayReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                        {mobileDisplayReturn != null ? `${mobileIsLive ? '~' : ''}${(mobileDisplayReturn * 100).toFixed(2)}%` : '—'}
                                                    </span>
                                                    {trade.prob != null && (
                                                        <span className="text-xs" style={{ color: GOLD }} title={confidenceTooltip(trade)}>Conf {(trade.prob * 100).toFixed(1)}%</span>
                                                    )}
                                                    <span className="text-gray-500 text-xs">
                                                        {trade.holding_days != null ? `${trade.holding_days}d` : '—'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* ── Desktop table (≥ md) ── */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-800 bg-[#0a0a0c]">
                                                <th onClick={() => handleSort('stock_id')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-left px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold select-none">Stock<SortIndicator sortConfig={sortConfig} columnKey="stock_id" /></th>
                                                <th onClick={() => handleSort('entry_date')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-left px-5 py-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold select-none">Entry Date<SortIndicator sortConfig={sortConfig} columnKey="entry_date" /></th>
                                                <th onClick={() => handleSort('prob')} className="cursor-pointer hover:bg-gray-800/50 transition-colors text-right px-5 py-3.5 text-xs uppercase tracking-wider font-semibold select-none" style={{ color: `${GOLD}CC` }}>Confidence<SortIndicator sortConfig={sortConfig} columnKey="prob" /></th>
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
                                                                <div
                                                                    className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
                                                                    style={{ background: `${GOLD}18`, color: GOLD }}
                                                                >
                                                                    {trade.stock_id.charAt(0)}
                                                                </div>
                                                                <span className="font-bold text-white transition-colors">{trade.stock_id}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-5 py-4 text-gray-400 text-xs">{trade.entry_date}</td>
                                                        <td className="px-5 py-4 text-right font-medium" style={{ color: GOLD }} title={confidenceTooltip(trade)}>{trade.prob != null ? `${(trade.prob * 100).toFixed(1)}%` : '—'}</td>
                                                        <td className="px-5 py-4 text-right text-gray-200 font-medium" style={{ fontFamily: MONO }}>{trade.entry_price?.toFixed(2)}</td>
                                                        <td className="px-5 py-4 text-right text-green-400/80 font-medium" style={{ fontFamily: MONO }}>{trade.tp_price?.toFixed(2)}</td>
                                                        <td className="px-5 py-4 text-right text-red-400/80 font-medium" style={{ fontFamily: MONO }}>{trade.sl_price?.toFixed(2)}</td>
                                                        <td className="px-5 py-4 text-gray-400 text-xs">{trade.exit_date || '—'}</td>
                                                        <td className="px-5 py-4 text-right text-gray-200 font-medium" style={{ fontFamily: MONO }}>{trade.exit_price?.toFixed(2) || '—'}</td>
                                                        <td className="px-5 py-4 text-center"><StatusBadge status={trade.status} /></td>
                                                        <td className={`px-5 py-4 text-right font-bold ${displayReturn == null ? 'text-gray-500' :
                                                            displayReturn >= 0 ? 'text-green-400' : 'text-red-400'
                                                            }`}>
                                                            {displayReturn != null ? `${isLive ? '~' : ''}${(displayReturn * 100).toFixed(2)}%` : '—'}
                                                        </td>
                                                        <td className="px-5 py-4 text-right text-gray-400">{trade.holding_days ?? '—'}</td>
                                                    </tr>
                                                );
                                            })}
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

export default BCDSignalsTab;
