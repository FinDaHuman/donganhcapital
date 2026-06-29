import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSectors } from '../services/stock_api';
import { SkeletonCard } from './SkeletonLoader';
import { Lock, FileText, Download, Eye, Search } from 'lucide-react';

const GOLD = '#C9A96E';

// Tiers allowed during beta (pro + premium). Mirrors the backend
// REPORTS_ALLOWED_TIERS default — flip both to 'premium' only when the beta ends.
const ALLOWED_TIERS = ['pro', 'premium'];

const PLACEHOLDER_ROWS = Array.from({ length: 5 }, (_, i) => ({ id: i, stock_id: '•••' }));

const formatBytes = (b) => {
    if (!b && b !== 0) return '—';
    const mb = b / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
};

const UpgradeOverlay = ({ onTabChange }) => (
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
                    Premium Feature
                </span>
                <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    Premium Research Reports
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                    In-depth PDF research reports on individual stocks, hand-prepared by our
                    analysts. Available to Premium subscribers (and Pro members during the beta).
                </p>
            </div>
            <button
                onClick={() => onTabChange('checkout', { plan: 'premium', period: 'monthly' })}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer"
                style={{
                    background: `linear-gradient(135deg, ${GOLD}, #E8C97A)`,
                    color: '#0A1020',
                    border: 'none',
                    fontFamily: "'Outfit', sans-serif",
                }}
            >
                Upgrade to Premium
            </button>
        </div>
    </div>
);

const SignInPrompt = ({ onTabChange }) => (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}
        >
            <FileText size={28} style={{ color: GOLD }} />
        </div>
        <div>
            <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Sign In to Access Reports
            </h3>
            <p className="text-sm text-gray-400 max-w-sm">
                Premium research reports are exclusive to subscribers. Sign in to browse and
                download the latest analyst PDFs.
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

const ReportsTab = ({ onTabChange }) => {
    const { user, isAuthenticated, authApi, refreshUser } = useAuth();

    const [reports, setReports] = useState([]);
    const [sectors, setSectors] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(null);

    // Filters
    const [stock, setStock] = useState('');
    const [sector, setSector] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const eligible = ALLOWED_TIERS.includes(user?.subscription_tier);

    const fetchReports = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            if (stock.trim()) params.stock = stock.trim();
            if (sector) params.sector = sector;
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            const res = await authApi.get('/api/reports', { params });
            setReports(res.data.reports || []);
        } catch (err) {
            const status = err.response?.status;
            if (status === 403) {
                // Subscription may have expired mid-session — sync auth state.
                await refreshUser();
                setReports([]);
            } else if (status !== 401) {
                setError('Failed to load reports. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    }, [authApi, stock, sector, dateFrom, dateTo, refreshUser]);

    useEffect(() => {
        if (!isAuthenticated || !eligible) {
            setLoading(false);
            return;
        }
        getSectors().then(setSectors).catch(() => setSectors({}));
        fetchReports();
        // Initial load only; subsequent loads are triggered by the Apply button.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, eligible]);

    const openReport = async (report, disposition) => {
        setBusyId(report.id);
        // Open the tab synchronously (before await) so popup blockers don't fire
        // for the inline-view case.
        const newTab = disposition === 'inline' ? window.open('', '_blank') : null;
        try {
            const res = await authApi.get(`/api/reports/${report.id}/url`, {
                params: { disposition },
            });
            const url = res.data?.url;
            if (!url) throw new Error('No URL');
            if (disposition === 'inline') {
                if (newTab) newTab.location = url;
                else window.open(url, '_blank');
            } else {
                // Attachment: navigating downloads (content-disposition=attachment).
                const a = document.createElement('a');
                a.href = url;
                a.rel = 'noopener';
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
        } catch (err) {
            if (newTab) newTab.close();
            const status = err.response?.status;
            if (status === 403) await refreshUser();
            setError(
                status === 503
                    ? 'Report storage is temporarily unavailable. Please try again shortly.'
                    : 'Could not open the report. Please try again.'
            );
        } finally {
            setBusyId(null);
        }
    };

    // ── Not authenticated ────────────────────────────────────────────────────
    if (!isAuthenticated) {
        return (
            <div className="flex-1 w-full flex flex-col" style={{ background: '#000' }}>
                <SignInPrompt onTabChange={onTabChange} />
            </div>
        );
    }

    // ── Not eligible: blurred placeholder + upgrade overlay ───────────────────
    if (!eligible) {
        return (
            <div className="flex-1 w-full flex flex-col p-4 sm:p-6" style={{ background: '#000' }}>
                <div className="mb-6">
                    <h2 className="text-xl font-bold text-white mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        Research Reports
                        <span
                            className="ml-2 px-2 py-0.5 rounded text-xs font-bold tracking-wider uppercase align-middle"
                            style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}
                        >
                            Premium
                        </span>
                    </h2>
                    <p className="text-sm text-gray-500">Hand-prepared PDF research on individual stocks</p>
                </div>
                <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid #1f2937' }}>
                    <div style={{ filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none' }}>
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ background: '#0d1117', borderBottom: '1px solid #1f2937' }}>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Title</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Stock</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Sector</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {PLACEHOLDER_ROWS.map((row) => (
                                    <tr key={row.id} style={{ borderBottom: '1px solid #111827', background: '#0a0f1a' }}>
                                        <td className="px-4 py-3"><span className="inline-block w-40 h-4 rounded bg-gray-800" /></td>
                                        <td className="px-4 py-3 text-gray-600 font-bold">{row.stock_id}</td>
                                        <td className="px-4 py-3"><span className="inline-block w-24 h-4 rounded bg-gray-800" /></td>
                                        <td className="px-4 py-3"><span className="inline-block w-20 h-4 rounded bg-gray-800" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <UpgradeOverlay onTabChange={onTabChange} />
                </div>
            </div>
        );
    }

    // ── Eligible: filters + report list ───────────────────────────────────────
    const inputStyle = {
        background: '#0d1117',
        border: '1px solid #1f2937',
        color: '#e2e8f0',
        fontFamily: "'Outfit', sans-serif",
        outline: 'none',
    };

    return (
        <div className="flex-1 w-full flex flex-col p-4 sm:p-6 overflow-auto" style={{ background: '#000' }}>
            <div className="mb-5">
                <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    Research Reports
                    <span
                        className="ml-2 px-2 py-0.5 rounded text-xs font-bold tracking-wider uppercase align-middle"
                        style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}
                    >
                        Premium
                    </span>
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                    Hand-prepared PDF research on individual stocks. For research only — not financial advice.
                </p>
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap items-end gap-3 mb-5">
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">Stock</label>
                    <input
                        type="text"
                        value={stock}
                        onChange={(e) => setStock(e.target.value.toUpperCase())}
                        placeholder="e.g. FPT"
                        className="rounded-lg px-3 py-2 text-sm w-28"
                        style={inputStyle}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">Sector</label>
                    <select
                        value={sector}
                        onChange={(e) => setSector(e.target.value)}
                        className="rounded-lg px-3 py-2 text-sm cursor-pointer"
                        style={inputStyle}
                    >
                        <option value="">All sectors</option>
                        {Object.keys(sectors).map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">From</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                        className="rounded-lg px-3 py-2 text-sm" style={inputStyle} />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">To</label>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                        className="rounded-lg px-3 py-2 text-sm" style={inputStyle} />
                </div>
                <button
                    onClick={fetchReports}
                    className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer"
                    style={{ background: `linear-gradient(135deg, ${GOLD}, #E8C97A)`, color: '#0A1020', border: 'none', fontFamily: "'Outfit', sans-serif" }}
                >
                    <Search size={14} /> Apply
                </button>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    {error}
                </div>
            )}

            {loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
            )}

            {!loading && reports.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
                        <FileText size={24} className="text-gray-600" />
                    </div>
                    <p className="text-gray-400 text-sm max-w-xs">
                        No reports match your filters yet. Try widening the date range or clearing the stock filter.
                    </p>
                </div>
            )}

            {!loading && reports.length > 0 && (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1f2937' }}>
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ background: '#0d1117', borderBottom: '1px solid #1f2937' }}>
                                <th className="px-4 py-3 text-left font-medium text-gray-400">Title</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-400">Stock</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-400 hidden sm:table-cell">Sector</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-400">Date</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-400 hidden sm:table-cell">Size</th>
                                <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports.map((r, idx) => (
                                <tr key={r.id} style={{
                                    borderBottom: idx < reports.length - 1 ? '1px solid #111827' : 'none',
                                    background: idx % 2 === 0 ? '#0a0f1a' : '#060b14',
                                }}>
                                    <td className="px-4 py-3.5 text-gray-200">{r.title || `Báo cáo ${r.stock_id} ${r.report_date}`}</td>
                                    <td className="px-4 py-3.5"><span className="font-bold text-white tracking-wide">{r.stock_id}</span></td>
                                    <td className="px-4 py-3.5 text-gray-400 hidden sm:table-cell">{r.sector || '—'}</td>
                                    <td className="px-4 py-3.5 text-gray-400 tabular-nums">{r.report_date}</td>
                                    <td className="px-4 py-3.5 text-gray-500 tabular-nums hidden sm:table-cell">{formatBytes(r.file_size_bytes)}</td>
                                    <td className="px-4 py-3.5">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => openReport(r, 'inline')}
                                                disabled={busyId === r.id}
                                                title="View"
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
                                                style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)', opacity: busyId === r.id ? 0.6 : 1 }}
                                            >
                                                <Eye size={13} /> View
                                            </button>
                                            <button
                                                onClick={() => openReport(r, 'attachment')}
                                                disabled={busyId === r.id}
                                                title="Download"
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
                                                style={{ background: `${GOLD}15`, color: GOLD, border: `1px solid ${GOLD}30`, opacity: busyId === r.id ? 0.6 : 1 }}
                                            >
                                                <Download size={13} /> Download
                                            </button>
                                        </div>
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

export default ReportsTab;
