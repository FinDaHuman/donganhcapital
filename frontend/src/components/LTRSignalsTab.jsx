import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { SkeletonCard } from './SkeletonLoader';
import { Lock, TrendingUp, BarChart2 } from 'lucide-react';

const GOLD = '#C9A96E';

// Placeholder rows shown (blurred) to free-tier users so they can see the table shape
const PLACEHOLDER_SIGNALS = Array.from({ length: 10 }, (_, i) => ({
    rank: i + 1,
    stock_id: '•••',
    score: 0,
}));

const ScoreBadge = ({ score }) => {
    const pct = (score * 100).toFixed(1);
    const hue = score > 0.6 ? '#4ade80' : score > 0.4 ? GOLD : '#94a3b8';
    return (
        <span
            className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums"
            style={{ background: `${hue}18`, color: hue, border: `1px solid ${hue}30` }}
        >
            {pct}%
        </span>
    );
};

const UpgradeOverlay = ({ onTabChange, user, claimProTrial }) => {
    const [claiming, setClaiming] = useState(false);
    const [claimMsg, setClaimMsg] = useState('');

    const handleClaim = async () => {
        setClaiming(true);
        const res = await claimProTrial();
        if (res.success) {
            setClaimMsg('Trial activated! Refreshing…');
            setTimeout(() => window.location.reload(), 1200);
        } else {
            setClaimMsg(res.error || 'Could not activate trial.');
            setClaiming(false);
        }
    };

    const canClaim = user && !user.pro_trial_claimed;

    return (
        <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-xl z-20"
            style={{ background: 'rgba(6,11,20,0.82)', backdropFilter: 'blur(6px)' }}
        >
            <div
                className="flex flex-col items-center gap-4 p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4 text-center"
                style={{ background: '#0d1117', border: `1px solid ${GOLD}30` }}
            >
                <div
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}
                >
                    <Lock size={24} style={{ color: GOLD }} />
                </div>
                <div>
                    <span
                        className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-3"
                        style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}
                    >
                        Pro Feature
                    </span>
                    <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        LTR Pro Signals
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                        Our LightGBM ranker scores all 167 stocks daily by probability of gaining
                        &gt;6% over 3 trading days. Top 20 picks are updated every afternoon.
                    </p>
                </div>

                <div className="flex flex-col gap-2 w-full">
                    {canClaim ? (
                        <>
                            <button
                                onClick={handleClaim}
                                disabled={claiming}
                                className="w-full py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer"
                                style={{
                                    background: `linear-gradient(135deg, ${GOLD}, #E8C97A)`,
                                    color: '#0A1020',
                                    border: 'none',
                                    fontFamily: "'Outfit', sans-serif",
                                    opacity: claiming ? 0.7 : 1,
                                }}
                            >
                                {claiming ? 'Activating…' : 'Claim Free 1-Week Trial'}
                            </button>
                            {claimMsg && (
                                <p className="text-xs text-center" style={{ color: claimMsg.includes('Refresh') ? '#4ade80' : '#f87171' }}>
                                    {claimMsg}
                                </p>
                            )}
                            <button
                                onClick={() => onTabChange('checkout', { plan: 'pro', period: 'monthly' })}
                                className="w-full py-2.5 rounded-xl font-medium text-sm transition-all cursor-pointer"
                                style={{
                                    background: 'transparent',
                                    color: GOLD,
                                    border: `1px solid ${GOLD}35`,
                                    fontFamily: "'Outfit', sans-serif",
                                }}
                            >
                                Upgrade to Pro
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => onTabChange('checkout', { plan: 'pro', period: 'monthly' })}
                            className="w-full py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer"
                            style={{
                                background: `linear-gradient(135deg, ${GOLD}, #E8C97A)`,
                                color: '#0A1020',
                                border: 'none',
                                fontFamily: "'Outfit', sans-serif",
                            }}
                        >
                            Upgrade to Pro
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const SignInPrompt = ({ onTabChange }) => (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}
        >
            <TrendingUp size={28} style={{ color: GOLD }} />
        </div>
        <div>
            <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Sign In to Access Pro Signals
            </h3>
            <p className="text-sm text-gray-400 max-w-sm">
                LTR Pro Signals are exclusive to Pro and Premium subscribers. Sign in to view your ranked picks.
            </p>
        </div>
        <div className="flex gap-3">
            <button
                onClick={() => onTabChange('login')}
                className="px-6 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all"
                style={{ color: GOLD, background: 'transparent', border: `1px solid ${GOLD}35`, fontFamily: "'Outfit', sans-serif" }}
            >
                Sign In
            </button>
            <button
                onClick={() => onTabChange('register')}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-all"
                style={{ color: '#0A1020', background: `linear-gradient(135deg, ${GOLD}, #E8C97A)`, border: 'none', fontFamily: "'Outfit', sans-serif" }}
            >
                Sign Up Free
            </button>
        </div>
    </div>
);

const LTRSignalsTab = ({ onSelectStock, onTabChange }) => {
    const { user, isAuthenticated, authApi, claimProTrial, refreshUser } = useAuth();

    const [signals, setSignals] = useState([]);
    const [date, setDate] = useState('');
    const [dates, setDates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const isPro = user?.subscription_tier === 'pro' || user?.subscription_tier === 'premium';

    const fetchDates = useCallback(async () => {
        try {
            const res = await authApi.get('/api/ltr-signals/dates');
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
                ? `/api/ltr-signals?date=${targetDate}`
                : '/api/ltr-signals?latest=true';
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
                <SignInPrompt onTabChange={onTabChange} />
            </div>
        );
    }

    // ── Free tier: show blurred table + upgrade overlay ─────────────────────
    if (!isPro) {
        return (
            <div className="flex-1 w-full flex flex-col p-4 sm:p-6" style={{ background: '#000' }}>
                <div className="mb-6">
                    <h2 className="text-xl font-bold text-white mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        LTR Pro Signals
                        <span
                            className="ml-2 px-2 py-0.5 rounded text-xs font-bold tracking-wider uppercase align-middle"
                            style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}
                        >
                            PRO
                        </span>
                    </h2>
                    <p className="text-sm text-gray-500">Daily ranked shortlist — top 20 stocks by 3-day breakout probability</p>
                </div>

                <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid #1f2937' }}>
                    {/* Blurred placeholder table */}
                    <div style={{ filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none' }}>
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ background: '#0d1117', borderBottom: '1px solid #1f2937' }}>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Rank</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Ticker</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">P(&gt;6% / 3 days)</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Chart</th>
                                </tr>
                            </thead>
                            <tbody>
                                {PLACEHOLDER_SIGNALS.map((row) => (
                                    <tr key={row.rank} style={{ borderBottom: '1px solid #111827', background: '#0a0f1a' }}>
                                        <td className="px-4 py-3 text-gray-600">#{row.rank}</td>
                                        <td className="px-4 py-3">
                                            <span className="font-bold text-gray-600">{row.stock_id}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="inline-block w-16 h-5 rounded bg-gray-800" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="inline-block w-16 h-7 rounded bg-gray-800" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/* Upgrade overlay */}
                    <UpgradeOverlay onTabChange={onTabChange} user={user} claimProTrial={claimProTrial} />
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
                        LTR Pro Signals
                        <span
                            className="ml-2 px-2 py-0.5 rounded text-xs font-bold tracking-wider uppercase align-middle"
                            style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}
                        >
                            PRO
                        </span>
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Top 20 ranked stocks · P(&gt;6% over 3 days) · Generated at 15:02 Vietnam time
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
                    Ranked by a LightGBM classifier (binary cross-entropy). Score = P(&gt;6% over 3 trading days).
                    Win rate: ~42.5% · This is a <strong style={{ color: GOLD }}>ranked shortlist for research only</strong>, not financial advice.
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
                        <TrendingUp size={24} className="text-gray-600" />
                    </div>
                    <p className="text-gray-400 text-sm max-w-xs">
                        No signals found for this date. Signals are generated daily at 15:02 Vietnam time on market days.
                    </p>
                </div>
            )}

            {/* Signals table */}
            {!loading && !error && signals.length > 0 && (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1f2937' }}>
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ background: '#0d1117', borderBottom: '1px solid #1f2937' }}>
                                <th className="px-4 py-3 text-left font-medium text-gray-400 w-16">Rank</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-400">Ticker</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-400">P(&gt;6% / 3 days)</th>
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
                                        <span
                                            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
                                            style={{
                                                background: row.rank <= 3 ? `${GOLD}20` : '#1f2937',
                                                color: row.rank <= 3 ? GOLD : '#6b7280',
                                                border: row.rank <= 3 ? `1px solid ${GOLD}40` : '1px solid #374151',
                                            }}
                                        >
                                            {row.rank}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <span className="font-bold text-white tracking-wide">{row.stock_id}</span>
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <ScoreBadge score={row.score} />
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

export default LTRSignalsTab;
