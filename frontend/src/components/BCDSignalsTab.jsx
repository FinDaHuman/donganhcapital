import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { SkeletonCard, SkeletonChart } from './SkeletonLoader';
import { TrendingDown, BarChart2 } from 'lucide-react';
import { SignInGate, UpgradeGate } from './AccessGate';

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

const ProBadge = () => (
    <span
        className="ml-2 px-2 py-0.5 rounded text-xs font-bold tracking-wider uppercase align-middle"
        style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}
    >
        PRO
    </span>
);

// Blurred placeholder card grid shown to free-tier users (mirrors the real signal cards)
const PlaceholderCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-[#111213] border border-gray-800 rounded-xl p-5">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg"
                            style={{ background: `${GOLD}18`, color: GOLD }}>•</div>
                        <span className="inline-block w-16 h-6 rounded bg-gray-800" />
                    </div>
                    <span className="inline-block w-20 h-6 rounded-full bg-gray-800" />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-[#0a0a0c] p-3 rounded-lg border border-gray-800/50">
                        <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold">Entry</div>
                        <span className="inline-block w-14 h-5 rounded bg-gray-800" />
                    </div>
                    <div className="bg-[#0a0a0c] p-3 rounded-lg border border-gray-800/50 flex flex-col items-end">
                        <div className="text-xs text-green-500/70 mb-1 uppercase tracking-wider font-semibold">Take Profit</div>
                        <span className="inline-block w-14 h-5 rounded bg-gray-800" />
                    </div>
                </div>
                <div className="bg-red-500/5 border border-red-500/10 p-3 rounded-lg flex justify-between items-center">
                    <span className="text-xs text-red-400/70 uppercase tracking-wider font-semibold">Stop Loss</span>
                    <span className="inline-block w-14 h-5 rounded bg-gray-800" />
                </div>
            </div>
        ))}
    </div>
);

const BCDSignalsTab = ({ onSelectStock, onTabChange }) => {
    const { user, isAuthenticated, authApi, refreshUser } = useAuth();

    // Signals state
    const [signals, setSignals] = useState([]);
    const [date, setDate] = useState('');
    const [dates, setDates] = useState([]);
    const [summary, setSummary] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Trade history state
    const [trades, setTrades] = useState([]);
    const [tradesLoading, setTradesLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState(null);
    const [minScore, setMinScore] = useState(0);
    const [sortConfig, setSortConfig] = useState({ key: 'entry_date', direction: 'desc' });

    // BCD history starts sparse, so default to the signals section (AI Analyst defaults to history)
    const [activeSection, setActiveSection] = useState('signals');

    const isPro = user?.subscription_tier === 'pro' || user?.subscription_tier === 'premium';

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
            return Array.isArray(res.data) ? res.data : [];
        } catch {
            return [];
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
        if (!isAuthenticated || !isPro) {
            setLoading(false);
            setTradesLoading(false);
            return;
        }
        const init = async () => {
            setLoading(true);
            const [fetchedDates, fetchedSummary] = await Promise.all([fetchDates(), fetchSummary()]);
            setDates(fetchedDates);
            setSummary(fetchedSummary);
            await fetchSignals(null);
        };
        init();
        fetchTrades();
    }, [isAuthenticated, isPro, fetchDates, fetchSummary, fetchSignals, fetchTrades]);

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

    const baseTrades = useMemo(() => {
        return trades.filter(trade => {
            if (minScore > 0 && (!trade.prob || trade.prob < minScore)) return false;
            return true;
        });
    }, [trades, minScore]);

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

    const dynamicStats = useMemo(() => {
        const closedTrades = filteredTrades.filter(t => ['TP', 'SL', 'TIMEOUT'].includes(t.status));
        // TIMEOUT with return > 0 is a win, TIMEOUT with return <= 0 is a loss
        const winCount = filteredTrades.filter(t =>
            t.status === 'TP' || (t.status === 'TIMEOUT' && t.return_pct != null && t.return_pct > 0)
        ).length;
        const winRate = closedTrades.length > 0 ? ((winCount / closedTrades.length) * 100).toFixed(1) : 0;

        const validReturns = closedTrades.map(t => t.return_pct).filter(r => r != null);
        const avgReturn = validReturns.length > 0 ? ((validReturns.reduce((a, b) => a + b, 0) / validReturns.length) * 100).toFixed(2) : 0;
        const bestReturn = validReturns.length > 0 ? (Math.max(...validReturns) * 100).toFixed(2) : 0;

        const validDays = closedTrades.map(t => t.holding_days).filter(d => d != null);
        const avgHoldingDays = validDays.length > 0 ? (validDays.reduce((a, b) => a + b, 0) / validDays.length).toFixed(1) : 0;

        return {
            total_trades: filteredTrades.length,
            win_rate: Number(winRate),
            avg_return: Number(avgReturn),
            best_return: Number(bestReturn),
            avg_holding_days: Number(avgHoldingDays)
        };
    }, [filteredTrades]);

    const summaryTotals = useMemo(() => ({
        events: summary.reduce((acc, s) => acc + (s.signal_count || 0), 0),
        passed: summary.reduce((acc, s) => acc + (s.passed_count || 0), 0),
    }), [summary]);

    // ── Not authenticated ───────────────────────────────────────────────────
    if (!isAuthenticated) {
        return (
            <div className="flex-1 w-full flex flex-col" style={{ background: '#000' }}>
                <SignInGate
                    onTabChange={onTabChange}
                    icon={TrendingDown}
                    title="Sign In to Access BCD Signals"
                    description="BCD Recovery Signals are exclusive to Pro and Premium subscribers. Sign in to view breakdown-reversal candidates."
                />
            </div>
        );
    }

    // ── Free tier: blurred card grid + upgrade overlay ──────────────────────
    if (!isPro) {
        return (
            <div className="flex-1 w-full flex flex-col p-4 sm:p-6 overflow-auto" style={{ background: '#000' }}>
                <div className="mb-6">
                    <h2 className="text-xl font-bold text-white mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        BCD Recovery Signals
                        <ProBadge />
                    </h2>
                    <p className="text-sm text-gray-500">Breakdown-pattern reversal candidates scored by a LightGBM recovery model</p>
                </div>

                <div className="relative rounded-xl overflow-hidden min-h-[460px]" style={{ border: '1px solid #1f2937' }}>
                    <div style={{ filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none' }}>
                        <PlaceholderCards />
                    </div>
                    <UpgradeGate
                        onTabChange={onTabChange}
                        overlay
                        title="BCD Recovery Signals"
                        description="Our LightGBM model detects B-C-D breakdown patterns and scores each one for recovery potential, with suggested entry, take-profit and stop-loss levels."
                    />
                </div>
            </div>
        );
    }

    // ── Pro / Premium ───────────────────────────────────────────────────────
    return (
        <div className="flex-1 overflow-y-auto p-6 bg-[#000]">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        BCD Recovery Signals
                        <ProBadge />
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
                                Scored by a LightGBM classifier on B-C-D breakdown events. <strong style={{ color: GOLD }}>Confidence Rate</strong> = model
                                confidence that price recovers ≥15% within 60 sessions after the post-breakdown low — this is model confidence, not a win rate.
                                Entry is a suggested B–C trendline level; TP/SL are +15% / −7% from entry. <strong style={{ color: GOLD }}>For research only</strong>, not financial advice.
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

                                        <div className="grid grid-cols-2 gap-3 mb-4">
                                            <div className="bg-[#0a0a0c] p-3 rounded-lg border border-gray-800/50">
                                                <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold">Entry</div>
                                                <div className="text-lg text-gray-200 font-medium" style={{ fontFamily: MONO }}>{fmt(sig.entry_price)}</div>
                                            </div>
                                            <div className="bg-[#0a0a0c] p-3 rounded-lg border border-gray-800/50 flex flex-col items-end">
                                                <div className="text-xs text-green-500/70 mb-1 uppercase tracking-wider font-semibold">Take Profit</div>
                                                <div className="text-lg text-green-400 font-medium" style={{ fontFamily: MONO }}>{fmt(sig.tp_price)}</div>
                                            </div>
                                        </div>

                                        <div className="bg-red-500/5 border border-red-500/10 p-3 rounded-lg flex justify-between items-center">
                                            <span className="text-xs text-red-400/70 uppercase tracking-wider font-semibold">Stop Loss</span>
                                            <span className="text-red-400 font-medium" style={{ fontFamily: MONO }}>{fmt(sig.sl_price)}</span>
                                        </div>

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
                                    onChange={(e) => setMinScore(Number(e.target.value))}
                                    className="bg-[#111213] border border-gray-800 text-white rounded-lg px-3 py-1.5 focus:outline-none transition-colors"
                                >
                                    <option value={0}>Any</option>
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
                                    <div className="text-2xl font-bold" style={{ color: GOLD }}>{dynamicStats.avg_holding_days}</div>
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
                                <h3 className="text-xl text-gray-300 mb-2">No trades yet</h3>
                                <p className="text-gray-500 max-w-md mx-auto">
                                    Every breakdown-recovery signal with valid Entry, TP, and SL levels
                                    appears here while its trade lifecycle is tracked.
                                </p>
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
                                                        <span className="text-xs" style={{ color: GOLD }}>Conf {(trade.prob * 100).toFixed(1)}%</span>
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
                                                        <td className="px-5 py-4 text-right font-medium" style={{ color: GOLD }}>{trade.prob != null ? `${(trade.prob * 100).toFixed(1)}%` : '—'}</td>
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
