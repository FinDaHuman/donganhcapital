import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { SkeletonCard } from './SkeletonLoader';
import { TrendingDown, BarChart2 } from 'lucide-react';
import { SignInGate, UpgradeGate } from './AccessGate';

const GOLD = '#C9A96E';

// Placeholder rows shown (blurred) to free-tier users so they can see the table shape
const PLACEHOLDER_SIGNALS = Array.from({ length: 4 }, (_, i) => ({
    id: i + 1,
    stock_id: '•••',
}));

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

const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));

const PatternCell = ({ row }) => (
    <span
        className="text-xs text-gray-400 whitespace-nowrap"
        style={{ fontFamily: "'DM Mono', monospace" }}
    >
        Peak {fmt(row.peak_price)} → B {fmt(row.b_price)} → C {fmt(row.c_price)}
    </span>
);

const BCDSignalsTab = ({ onSelectStock, onTabChange }) => {
    const { user, isAuthenticated, authApi, refreshUser } = useAuth();

    const [signals, setSignals] = useState([]);
    const [date, setDate] = useState('');
    const [dates, setDates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const isPro = user?.subscription_tier === 'pro' || user?.subscription_tier === 'premium';

    const fetchDates = useCallback(async () => {
        try {
            const res = await authApi.get('/api/bcd-signals/dates');
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

    useEffect(() => {
        if (!isAuthenticated || !isPro) {
            setLoading(false);
            return;
        }
        const init = async () => {
            setLoading(true);
            const [fetchedDates] = await Promise.all([fetchDates()]);
            setDates(fetchedDates);
            // Default to latest
            await fetchSignals(null);
        };
        init();
    }, [isAuthenticated, isPro, fetchDates, fetchSignals]);

    const handleDateChange = async (e) => {
        const d = e.target.value;
        setDate(d);
        await fetchSignals(d);
    };

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

    // ── Free tier: show blurred table + upgrade overlay ─────────────────────
    if (!isPro) {
        return (
            <div className="flex-1 w-full flex flex-col p-4 sm:p-6 overflow-auto" style={{ background: '#000' }}>
                <div className="mb-6">
                    <h2 className="text-xl font-bold text-white mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        BCD Recovery Signals
                        <span
                            className="ml-2 px-2 py-0.5 rounded text-xs font-bold tracking-wider uppercase align-middle"
                            style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}
                        >
                            PRO
                        </span>
                    </h2>
                    <p className="text-sm text-gray-500">Breakdown-pattern reversal candidates scored by a LightGBM recovery model</p>
                </div>

                <div className="relative rounded-xl overflow-hidden min-h-[460px]" style={{ border: '1px solid #1f2937' }}>
                    {/* Blurred placeholder table */}
                    <div style={{ filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none' }}>
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ background: '#0d1117', borderBottom: '1px solid #1f2937' }}>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Ticker</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Recovery Score</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Entry</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Take Profit</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Stop Loss</th>
                                </tr>
                            </thead>
                            <tbody>
                                {PLACEHOLDER_SIGNALS.map((row) => (
                                    <tr key={row.id} style={{ borderBottom: '1px solid #111827', background: '#0a0f1a' }}>
                                        <td className="px-4 py-3">
                                            <span className="font-bold text-gray-600">{row.stock_id}</span>
                                        </td>
                                        {Array.from({ length: 4 }).map((_, i) => (
                                            <td key={i} className="px-4 py-3">
                                                <span className="inline-block w-16 h-5 rounded bg-gray-800" />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/* Upgrade overlay */}
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

    // ── Pro / Premium: show real signals ────────────────────────────────────
    return (
        <div className="flex-1 w-full flex flex-col p-4 sm:p-6" style={{ background: '#000' }}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        BCD Recovery Signals
                        <span
                            className="ml-2 px-2 py-0.5 rounded text-xs font-bold tracking-wider uppercase align-middle"
                            style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}
                        >
                            PRO
                        </span>
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Breakdown-reversal candidates · B-C-D pattern · Generated at 15:02 Vietnam time
                    </p>
                </div>

                {/* Date selector */}
                <div className="flex items-center gap-2">
                    <select
                        value={date}
                        onChange={handleDateChange}
                        className="rounded-lg px-3 py-2 text-sm cursor-pointer"
                        style={{
                            background: '#0d1117',
                            border: '1px solid #1f2937',
                            color: '#e2e8f0',
                            fontFamily: "'Outfit', sans-serif",
                            outline: 'none',
                        }}
                    >
                        {dates.length === 0 && date && (
                            <option value={date}>{date}</option>
                        )}
                        {dates.map((d) => (
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
                    Scored by a LightGBM classifier on B-C-D breakdown events. <strong style={{ color: GOLD }}>Recovery Score</strong> = model
                    confidence that price recovers ≥15% within 60 sessions after the post-breakdown low — this is model confidence, not a win rate.
                    Entry is a suggested B–C trendline level; TP/SL are +15% / −7% from entry. <strong style={{ color: GOLD }}>For research only</strong>, not financial advice.
                    Past performance does not guarantee future results.
                </span>
            </div>

            {/* Loading */}
            {loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
            )}

            {/* Error */}
            {!loading && error && (
                <div
                    className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                >
                    <p className="text-red-400 text-sm">{error}</p>
                    <button
                        onClick={() => fetchSignals(date || null)}
                        className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                        style={{ background: '#1f2937', color: '#e2e8f0', border: '1px solid #374151' }}
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && signals.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                    <div
                        className="w-14 h-14 rounded-full flex items-center justify-center"
                        style={{ background: '#0d1117', border: '1px solid #1f2937' }}
                    >
                        <TrendingDown size={24} className="text-gray-600" />
                    </div>
                    <p className="text-gray-400 text-sm max-w-sm">
                        No breakdown events detected for this date. Unlike ranked signals, this model
                        only fires when a stock completes a B-C-D breakdown pattern — quiet days are normal.
                    </p>
                </div>
            )}

            {/* Signals table */}
            {!loading && !error && signals.length > 0 && (
                <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid #1f2937' }}>
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ background: '#0d1117', borderBottom: '1px solid #1f2937' }}>
                                <th className="px-4 py-3 text-left font-medium text-gray-400">Ticker</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-400">Recovery Score</th>
                                <th className="px-4 py-3 text-right font-medium text-gray-400">Entry</th>
                                <th className="px-4 py-3 text-right font-medium text-gray-400">TP</th>
                                <th className="px-4 py-3 text-right font-medium text-gray-400">SL</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-400 hidden lg:table-cell">Pattern</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-400 hidden sm:table-cell">Chart</th>
                            </tr>
                        </thead>
                        <tbody>
                            {signals.map((row, idx) => (
                                <tr
                                    key={row.stock_id}
                                    className="transition-colors"
                                    style={{
                                        borderBottom: idx < signals.length - 1 ? '1px solid #111827' : 'none',
                                        background: idx % 2 === 0 ? '#0a0f1a' : '#060b14',
                                    }}
                                >
                                    <td className="px-4 py-3.5">
                                        <span className="font-bold text-white tracking-wide">{row.stock_id}</span>
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <ProbBadge prob={row.prob} passed={row.passed_threshold} />
                                    </td>
                                    <td
                                        className="px-4 py-3.5 text-right text-gray-200 tabular-nums"
                                        style={{ fontFamily: "'DM Mono', monospace" }}
                                    >
                                        {fmt(row.entry_price)}
                                    </td>
                                    <td
                                        className="px-4 py-3.5 text-right tabular-nums"
                                        style={{ fontFamily: "'DM Mono', monospace", color: '#4ade80' }}
                                    >
                                        {fmt(row.tp_price)}
                                    </td>
                                    <td
                                        className="px-4 py-3.5 text-right tabular-nums"
                                        style={{ fontFamily: "'DM Mono', monospace", color: '#f87171' }}
                                    >
                                        {fmt(row.sl_price)}
                                    </td>
                                    <td className="px-4 py-3.5 hidden lg:table-cell">
                                        <PatternCell row={row} />
                                    </td>
                                    <td className="px-4 py-3.5 hidden sm:table-cell">
                                        <button
                                            onClick={() => onSelectStock(row.stock_id)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
                                            style={{
                                                background: 'rgba(59,130,246,0.1)',
                                                color: '#60a5fa',
                                                border: '1px solid rgba(59,130,246,0.2)',
                                                fontFamily: "'Outfit', sans-serif",
                                            }}
                                        >
                                            View Chart
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default BCDSignalsTab;
