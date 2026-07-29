import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSectors } from '../services/stock_api';
import { SkeletonBlock } from './SkeletonLoader';
import { FileText, Download, Eye, Search, X } from 'lucide-react';

const GOLD = '#C9A96E';

// Reports were Premium-only. There are no paid tiers any more, so the backend
// gate is simply "signed in with a verified email" and App.jsx has already
// applied it before this component renders.

const formatBytes = (b) => {
    if (!b && b !== 0) return '—';
    const mb = b / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
};

// The backend caps /api/reports at 200 rows and there is no pagination, so the
// list silently stops there. Surface it rather than letting older notes vanish.
const LIST_LIMIT = 200;

const EMPTY_FILTERS = { stock: '', sector: '', dateFrom: '', dateTo: '' };

const ReportsTab = ({ onTabChange }) => {
    const { authApi, refreshUser } = useAuth();

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

    const hasFilters = Boolean(stock || sector || dateFrom || dateTo);

    // Takes the filters explicitly instead of closing over state: "Clear" resets
    // the four inputs and refetches in the same tick, and a state-closed callback
    // would still be holding the pre-clear values at that point.
    const runFetch = useCallback(async (f) => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            if (f.stock.trim()) params.stock = f.stock.trim();
            if (f.sector) params.sector = f.sector;
            if (f.dateFrom) params.date_from = f.dateFrom;
            if (f.dateTo) params.date_to = f.dateTo;
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
    }, [authApi, refreshUser]);

    const applyFilters = () => runFetch({ stock, sector, dateFrom, dateTo });

    const clearFilters = () => {
        setStock('');
        setSector('');
        setDateFrom('');
        setDateTo('');
        runFetch(EMPTY_FILTERS);
    };

    useEffect(() => {
        getSectors().then(setSectors).catch(() => setSectors({}));
        runFetch(EMPTY_FILTERS);
        // Initial load only; subsequent loads are triggered by the Apply button.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const inputStyle = {
        background: '#0d1117',
        border: '1px solid #1f2937',
        color: '#e2e8f0',
        fontFamily: "'Outfit', sans-serif",
        outline: 'none',
    };

    const viewStyle = (busy) => ({
        background: 'rgba(59,130,246,0.1)',
        color: '#60a5fa',
        border: '1px solid rgba(59,130,246,0.2)',
        opacity: busy ? 0.6 : 1,
    });

    const downloadStyle = (busy) => ({
        background: `${GOLD}15`,
        color: GOLD,
        border: `1px solid ${GOLD}30`,
        opacity: busy ? 0.6 : 1,
    });

    const titleOf = (r) => r.title || `Báo cáo ${r.stock_id} ${r.report_date}`;

    return (
        <div className="flex-1 w-full flex flex-col p-4 sm:p-6 overflow-auto" style={{ background: '#000' }}>
            <div className="mb-5">
                <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    Research Notes
                </h2>
                {/* Was "Hand-prepared", which was simply untrue — these are produced
                    by an automated AI pipeline. Saying a human wrote them would
                    overstate their authority, and AI-generated equity commentary needs
                    MORE disclosure than hand-written, not less: the reader has to know
                    no analyst reviewed it before deciding how much weight to give it.
                    Stays fully visible on every screen size — this is legal copy, not
                    a subtitle to collapse when space is tight. */}
                <p className="text-xs sm:text-sm text-gray-500 mt-1 leading-relaxed">
                    PDF notes on individual stocks, <span className="text-gray-400">generated automatically by an AI pipeline</span> and
                    published for research and educational purposes. Not reviewed by a licensed analyst; may contain errors.
                    Không phải khuyến nghị đầu tư — not investment advice.
                </p>
            </div>

            {/* Filter bar — 2-col grid on phones, inline row from sm up. */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-3 mb-5">
                <div className="flex flex-col gap-1 min-w-0">
                    <label className="text-xs text-gray-500">Stock</label>
                    <input
                        type="text"
                        value={stock}
                        onChange={(e) => setStock(e.target.value.toUpperCase())}
                        placeholder="e.g. FPT"
                        className="rounded-lg px-3 py-2 text-sm w-full sm:w-28"
                        style={inputStyle}
                    />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                    <label className="text-xs text-gray-500">Sector</label>
                    <select
                        value={sector}
                        onChange={(e) => setSector(e.target.value)}
                        className="rounded-lg px-3 py-2 text-sm cursor-pointer w-full sm:w-auto"
                        style={inputStyle}
                    >
                        <option value="">All sectors</option>
                        {Object.keys(sectors).map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                    <label className="text-xs text-gray-500">From</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                        className="rounded-lg px-3 py-2 text-sm w-full sm:w-auto" style={inputStyle} />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                    <label className="text-xs text-gray-500">To</label>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                        className="rounded-lg px-3 py-2 text-sm w-full sm:w-auto" style={inputStyle} />
                </div>
                <button
                    onClick={applyFilters}
                    className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 min-h-[44px] sm:min-h-0 text-sm font-semibold cursor-pointer"
                    style={{ background: `linear-gradient(135deg, ${GOLD}, #E8C97A)`, color: '#0A1020', border: 'none', fontFamily: "'Outfit', sans-serif" }}
                >
                    <Search size={14} /> Apply
                </button>
                {/* Clearing four fields by hand is tedious on a phone; only offered
                    once there is something to clear. */}
                {hasFilters && (
                    <button
                        onClick={clearFilters}
                        className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 min-h-[44px] sm:min-h-0 text-sm font-medium cursor-pointer active:opacity-80 transition-opacity"
                        style={{ background: '#0d1117', border: '1px solid #1f2937', color: '#94a3b8', fontFamily: "'Outfit', sans-serif" }}
                    >
                        <X size={14} /> Clear
                    </button>
                )}
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    {error}
                </div>
            )}

            {loading && (
                <>
                    {/* Skeletons mirror the layout they stand in for, so nothing
                        jumps around when the data lands. */}
                    <div className="md:hidden space-y-2.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <SkeletonBlock key={i} className="h-[132px] w-full rounded-xl" />
                        ))}
                    </div>
                    <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: '1px solid #1f2937' }}>
                        <SkeletonBlock className="h-[46px] w-full !rounded-none" />
                        {Array.from({ length: 6 }).map((_, i) => (
                            <SkeletonBlock key={i} className="h-[56px] w-full !rounded-none border-t border-[#111827]" />
                        ))}
                    </div>
                </>
            )}

            {!loading && reports.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
                        <FileText size={24} className="text-gray-600" />
                    </div>
                    {/* Distinguish "your filter excluded everything" from "nothing has
                        been published yet" — telling someone to widen a filter they
                        never set sends them looking for a problem that isn't theirs. */}
                    <p className="text-gray-400 text-sm max-w-xs">
                        {hasFilters
                            ? 'No notes match your filters. Try widening the date range or clearing the stock filter.'
                            : 'No notes published yet. New notes appear here as they are generated.'}
                    </p>
                </div>
            )}

            {!loading && reports.length > 0 && (
                <>
                    <div className="text-xs text-gray-500 mb-2 tabular-nums">
                        {reports.length} note{reports.length === 1 ? '' : 's'}
                        {reports.length >= LIST_LIMIT && ` · showing the ${LIST_LIMIT} most recent`}
                    </div>

                    {/* ── Mobile card list (< md) ── */}
                    <div className="md:hidden space-y-2.5">
                        {reports.map((r) => (
                            <div key={r.id} className="rounded-xl p-3.5" style={{ background: '#0a0f1a', border: '1px solid #1f2937' }}>
                                <div className="flex items-start gap-3 mb-3">
                                    <div
                                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                                        style={{ background: `${GOLD}18`, color: GOLD }}
                                    >
                                        <FileText size={16} />
                                    </div>
                                    {/* min-w-0 is what lets truncate/line-clamp actually
                                        clamp inside a flex row. */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-2">
                                            <span className="font-bold text-white tracking-wide">{r.stock_id}</span>
                                            <span className="text-xs text-gray-500 truncate">{r.sector || '—'}</span>
                                        </div>
                                        <div className="text-sm text-gray-300 leading-snug line-clamp-2 break-words mt-0.5">
                                            {titleOf(r)}
                                        </div>
                                        <div className="text-xs text-gray-500 tabular-nums mt-1">
                                            {r.report_date} · {formatBytes(r.file_size_bytes)}
                                        </div>
                                    </div>
                                </div>
                                {/* Two explicit buttons rather than a tappable card: View
                                    and Download do different things, so a whole-card tap
                                    would have to guess. Both are >=44px for thumbs. */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => openReport(r, 'inline')}
                                        disabled={busyId === r.id}
                                        className="flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg text-sm font-medium cursor-pointer active:opacity-80 transition-opacity"
                                        style={viewStyle(busyId === r.id)}
                                    >
                                        <Eye size={15} /> View
                                    </button>
                                    <button
                                        onClick={() => openReport(r, 'attachment')}
                                        disabled={busyId === r.id}
                                        className="flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg text-sm font-medium cursor-pointer active:opacity-80 transition-opacity"
                                        style={downloadStyle(busyId === r.id)}
                                    >
                                        <Download size={15} /> Download
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── Desktop table (>= md) ── */}
                    <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: '1px solid #1f2937' }}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ background: '#0d1117', borderBottom: '1px solid #1f2937' }}>
                                        <th className="px-4 py-3 text-left font-medium text-gray-400">Title</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-400">Stock</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-400">Sector</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-400">Date</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-400">Size</th>
                                        <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reports.map((r, idx) => (
                                        <tr key={r.id} style={{
                                            borderBottom: idx < reports.length - 1 ? '1px solid #111827' : 'none',
                                            background: idx % 2 === 0 ? '#0a0f1a' : '#060b14',
                                        }}>
                                            <td className="px-4 py-3.5 text-gray-200">{titleOf(r)}</td>
                                            <td className="px-4 py-3.5"><span className="font-bold text-white tracking-wide">{r.stock_id}</span></td>
                                            <td className="px-4 py-3.5 text-gray-400">{r.sector || '—'}</td>
                                            <td className="px-4 py-3.5 text-gray-400 tabular-nums whitespace-nowrap">{r.report_date}</td>
                                            <td className="px-4 py-3.5 text-gray-500 tabular-nums whitespace-nowrap">{formatBytes(r.file_size_bytes)}</td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => openReport(r, 'inline')}
                                                        disabled={busyId === r.id}
                                                        title="View"
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all whitespace-nowrap"
                                                        style={viewStyle(busyId === r.id)}
                                                    >
                                                        <Eye size={13} /> View
                                                    </button>
                                                    <button
                                                        onClick={() => openReport(r, 'attachment')}
                                                        disabled={busyId === r.id}
                                                        title="Download"
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all whitespace-nowrap"
                                                        style={downloadStyle(busyId === r.id)}
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
                    </div>
                </>
            )}
        </div>
    );
};

export default ReportsTab;
