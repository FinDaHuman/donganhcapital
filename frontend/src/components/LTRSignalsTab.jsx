import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { SkeletonBlock } from './SkeletonLoader';
import { TrendingUp, BarChart2, ChevronDown, ChevronRight } from 'lucide-react';

const GOLD = '#C9A96E';

/* The score is a 0–1 model output. `hue` is shared by the badge, the bar and
   the mobile card so a given score always reads the same colour wherever it
   appears. Deliberately no "%" suffix anywhere — see the notice below. */
const scoreHue = (score) => (score > 0.6 ? '#4ade80' : score > 0.4 ? GOLD : '#94a3b8');
const scoreText = (score) => (score * 100).toFixed(1);

const ScoreBadge = ({ score }) => {
    const hue = scoreHue(score);
    return (
        <span
            className="type-number-sm inline-block px-2.5 py-0.5 rounded-full font-bold"
            style={{ background: `${hue}18`, color: hue, border: `1px solid ${hue}30` }}
        >
            {scoreText(score)}
        </span>
    );
};

/* Rank chip — gold for the top 3, muted below. Shared by both breakpoints. */
const RankChip = ({ rank }) => {
    const top = rank <= 3;
    return (
        <span
            className="type-number-sm inline-flex items-center justify-center w-7 h-7 rounded-full font-bold shrink-0"
            style={{
                background: top ? `${GOLD}20` : '#1f2937',
                color: top ? GOLD : '#6b7280',
                border: top ? `1px solid ${GOLD}40` : '1px solid #374151',
            }}
        >
            {rank}
        </span>
    );
};

const LTRSignalsTab = ({ onSelectStock, onTabChange }) => {
    const { authApi, refreshUser } = useAuth();
    // App.jsx has already established a signed-in, verified session, and there
    // is no paid tier above it — so there is nothing further to gate on here.

    const [signals, setSignals] = useState([]);
    const [date, setDate] = useState('');
    const [dates, setDates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // The methodology paragraph is long enough to bury the data on a phone, so
    // it starts collapsed there and open on desktop. Read once — this only sets
    // the initial state, and re-reading on resize would fight the user's toggle.
    const [methodOpen, setMethodOpen] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
    );

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
        const init = async () => {
            setLoading(true);
            const [fetchedDates] = await Promise.all([fetchDates()]);
            setDates(fetchedDates);
            // Default to latest
            await fetchSignals(null);
        };
        init();
    }, [fetchDates, fetchSignals]);

    const handleDateChange = async (e) => {
        const d = e.target.value;
        setDate(d);
        await fetchSignals(d);
    };

    return (
        <div
            className="flex-1 w-full flex flex-col p-4 sm:p-6 overflow-y-auto"
            style={{ background: 'var(--bg-base)' }}
        >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                <div className="min-w-0">
                    <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        LTR Signals
                    </h2>
                    {/* Split across two lines rather than one long one: on a 412px
                        screen the single-line version wrapped to three ragged rows. */}
                    <p className="text-sm text-gray-500 mt-0.5">
                        Top 5 ranked stocks · Breakout Score (&gt;8% / 5 days)
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Generated at 15:02 Vietnam time
                    </p>
                </div>

                {/* Date selector */}
                <div className="flex items-center gap-2 shrink-0">
                    <select
                        value={date}
                        onChange={handleDateChange}
                        aria-label="Signal date"
                        className="type-number-sm w-full sm:w-auto min-h-[44px] rounded-lg px-3.5 cursor-pointer"
                        style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-default)',
                            color: 'var(--text-primary)',
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

            {/* Model notice. The non-advice sentence is never collapsed — only the
                methodology detail below it is, and only on small screens. */}
            <div
                className="rounded-xl mb-5 text-xs text-gray-400 leading-relaxed"
                style={{ background: `${GOLD}08`, border: `1px solid ${GOLD}20` }}
            >
                <div className="flex items-start gap-3 p-3">
                    <BarChart2 size={14} style={{ color: GOLD, marginTop: 1, flexShrink: 0 }} />
                    <span>
                        This is a <strong style={{ color: GOLD }}>ranked shortlist for research only</strong> — không phải khuyến nghị đầu tư.
                        Past performance does not guarantee future results.
                    </span>
                </div>

                <button
                    type="button"
                    onClick={() => setMethodOpen((v) => !v)}
                    aria-expanded={methodOpen}
                    className="w-full min-h-[44px] flex items-center gap-1.5 px-3 pb-1 text-xs font-medium cursor-pointer"
                    style={{ background: 'transparent', border: 'none', color: GOLD }}
                >
                    {methodOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    How this is scored
                </button>

                {/* The "~81% backtest win rate" that used to sit here had no reproducible
                    artifact in the repo — src/evaluation/ltr_eval.py gates on a win rate
                    above 43%, nowhere near it. Do not restore a figure without a
                    committed evaluation output behind it (Luật Quảng cáo 75/2025 requires
                    documentation substantiating any such claim). */}
                {methodOpen && (
                    <p className="px-3 pb-3 pl-[38px]">
                        Ranked by a LightGBM classifier. <strong style={{ color: GOLD }}>Breakout Score</strong> = relative likelihood of a &gt;8% gain over 5 trading days, as scored by the model on historical data — it is a ranking score, not a calibrated probability, not a win rate, and not a forecast of return.
                    </p>
                )}
            </div>

            {/* Loading — skeletons mirror the layout they stand in for, per breakpoint,
                so nothing reflows when the real rows land. */}
            {loading && (
                <>
                    <div className="md:hidden space-y-2.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <SkeletonBlock key={i} className="h-[86px] w-full" />
                        ))}
                    </div>
                    <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: '1px solid #1f2937' }}>
                        <div className="h-[45px]" style={{ background: '#0d1117', borderBottom: '1px solid #1f2937' }} />
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-[53px] flex items-center px-4"
                                style={{ background: i % 2 === 0 ? '#0a0f1a' : '#060b14' }}
                            >
                                <SkeletonBlock className="h-4 w-40" />
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Error */}
            {!loading && error && (
                <div
                    className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                >
                    <p className="text-red-400 text-sm">{error}</p>
                    <button
                        onClick={() => fetchSignals(date || null)}
                        className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium cursor-pointer"
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

            {!loading && !error && signals.length > 0 && (
                <>
                    {/* ── Mobile card list (< md) ──
                        The table used to hide its only action below sm, which left
                        phone users with a read-only grid. The whole card is the
                        tap target now, so the chart is reachable by thumb. */}
                    <div className="md:hidden space-y-2.5">
                        {signals.map((row) => {
                            const hue = scoreHue(row.score);
                            return (
                                <button
                                    key={row.stock_id}
                                    type="button"
                                    onClick={() => onSelectStock(row.stock_id)}
                                    className="w-full text-left rounded-xl p-3.5 cursor-pointer transition-colors active:opacity-80"
                                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
                                >
                                    <div className="flex items-center gap-3">
                                        <RankChip rank={row.rank} />
                                        <span className="type-ticker font-bold text-white flex-1 min-w-0 truncate">
                                            {row.stock_id}
                                        </span>
                                        <ChevronRight size={16} className="text-gray-600 shrink-0" />
                                    </div>

                                    <div className="flex items-baseline justify-between gap-2 mt-3">
                                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                            Breakout Score
                                        </span>
                                        <span className="type-number font-medium" style={{ color: hue }}>
                                            {scoreText(row.score)}
                                        </span>
                                    </div>

                                    {/* score is 0–1, so the fill is a direct read of it */}
                                    <div
                                        className="h-1.5 rounded-full overflow-hidden mt-1.5"
                                        style={{ background: 'var(--border-subtle)' }}
                                    >
                                        <div
                                            className="h-full rounded-full"
                                            style={{ width: `${Math.max(0, Math.min(1, row.score)) * 100}%`, background: hue }}
                                        />
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* ── Desktop table (>= md) ── */}
                    <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: '1px solid #1f2937' }}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ background: '#0d1117', borderBottom: '1px solid #1f2937' }}>
                                        <th className="px-4 py-3 text-left font-medium text-gray-400 w-16">Rank</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-400">Ticker</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-400 whitespace-nowrap">Breakout Score</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-400">Chart</th>
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
                                                <RankChip rank={row.rank} />
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className="type-ticker font-bold text-white">{row.stock_id}</span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <ScoreBadge score={row.score} />
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <button
                                                    onClick={() => onSelectStock(row.stock_id)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all whitespace-nowrap"
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
                    </div>
                </>
            )}
        </div>
    );
};

export default LTRSignalsTab;
