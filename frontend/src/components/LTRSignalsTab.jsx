import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { SkeletonCard } from './SkeletonLoader';
import { TrendingUp, BarChart2 } from 'lucide-react';

const GOLD = '#C9A96E';

const ScoreBadge = ({ score }) => {
    const display = (score * 100).toFixed(1);
    const hue = score > 0.6 ? '#4ade80' : score > 0.4 ? GOLD : '#94a3b8';
    return (
        <span
            className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums"
            style={{ background: `${hue}18`, color: hue, border: `1px solid ${hue}30` }}
        >
            {display}
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
        <div className="flex-1 w-full flex flex-col p-4 sm:p-6" style={{ background: '#000' }}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        LTR Signals
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Top 5 ranked stocks · Breakout Score (&gt;8% / 5 days) · Generated at 15:02 Vietnam time
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
                {/* The "~81% backtest win rate" that used to sit here had no reproducible
                    artifact in the repo — src/evaluation/ltr_eval.py gates on a win rate
                    above 43%, nowhere near it. Do not restore a figure without a
                    committed evaluation output behind it (Luật Quảng cáo 75/2025 requires
                    documentation substantiating any such claim). */}
                <span>
                    Ranked by a LightGBM classifier. <strong style={{ color: GOLD }}>Breakout Score</strong> = relative likelihood of a &gt;8% gain over 5 trading days, as scored by the model on historical data — it is a ranking score, not a calibrated probability, not a win rate, and not a forecast of return.
                    This is a <strong style={{ color: GOLD }}>ranked shortlist for research only</strong> — không phải khuyến nghị đầu tư.
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
                                <th className="px-4 py-3 text-left font-medium text-gray-400">Breakout Score</th>
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
