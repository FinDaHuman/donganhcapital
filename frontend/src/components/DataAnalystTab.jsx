import React, { useEffect, useMemo, useRef, useState } from 'react';
import Plot from 'react-plotly.js';
import {
    Activity,
    AlertTriangle,
    BarChart3,
    ChevronDown,
    ChevronUp,
    Database,
    Filter,
    LineChart,
    RefreshCw,
    ShieldAlert,
    TrendingUp,
    Zap,
    Target,
    Award,
    ArrowDownRight,
    Clock,
    PieChart,
    BarChart2,
    Layers,
    Gauge,
    Users,
    TrendingDown,
    ArrowUpRight,
    ArrowDown,
    CheckCircle,
    XCircle,
} from 'lucide-react';
import {
    getDataAnalystBootstrap,
    getDataAnalystMarket,
    getDataAnalystOverview,
    getDataAnalystPipelineHealth,
    getDataAnalystSignals,
    getDataAnalystTrades,
    getSectors,
    readCachedAnalytics,
} from '../services/stock_api';

const SECTION_TABS = [
    { id: 'overview', label: 'Overview', icon: Activity, description: 'Key metrics at a glance' },
    { id: 'signals', label: 'Model Activity', icon: Zap, description: 'Signal generation analytics' },
    { id: 'trades', label: 'Performance', icon: BarChart3, description: 'Trade performance analysis' },
    { id: 'market', label: 'Market', icon: LineChart, description: 'Market breadth & sectors' },
    { id: 'health', label: 'Data Health', icon: ShieldAlert, description: 'Pipeline & data integrity' },
];

const defaultSectionState = {
    overview: { summary: {}, daily_activity: {}, series: { signal_trend_30d: [], trade_close_trend_30d: [], equity_curve: [] }, freshness: [], alerts: [] },
    signals: { summary: {}, series: { signal_trend: [], probability_buckets: [], sector_distribution: [], top_tickers: [] }, tables: { recent_signals: [] } },
    trades: { summary: {}, series: { outcome_breakdown: [], return_distribution: [], equity_curve: [] }, tables: { ticker_leaderboard: [], sector_leaderboard: [], open_trades: [], recent_trades: [] } },
    market: { summary: { breadth: {} }, series: { sector_performance: [], liquidity_leaders: [], return_distribution: [], vnindex: [] } },
    health: { summary: {}, freshness: [], coverage: { unmapped_tickers: [] }, anomalies: [] },
};

const toIsoDate = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = new Date();
const startDefault = new Date();
startDefault.setDate(today.getDate() - 180);

const formatNumber = (value, digits = 2, suffix = '') => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return `${num.toLocaleString(undefined, { minimumFractionDigits: digits === 0 ? 0 : 0, maximumFractionDigits: digits })}${suffix}`;
};

const formatPercent = (value, digits = 1) => formatNumber(value, digits, '%');

const getIsMobileViewport = () => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 640;
};

const sectionDefaults = {
    overview: defaultSectionState.overview,
    signals: defaultSectionState.signals,
    trades: defaultSectionState.trades,
    market: defaultSectionState.market,
    health: defaultSectionState.health,
};

const createLoadedSectionsState = () => ({
    overview: false,
    signals: false,
    trades: false,
    market: false,
    health: false,
});

const createSectionLoadingState = () => ({
    overview: false,
    signals: false,
    trades: false,
    market: false,
    health: false,
});

/* ─── Skeleton shimmer block ─── */
const SkeletonBlock = ({ className = '' }) => (
    <div className={`relative overflow-hidden rounded-xl bg-[#1a1d22] ${className}`}>
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
);

const SkeletonCard = () => (
    <div className="rounded-2xl border border-[#1e2128] bg-[#0e1015] p-5 space-y-3">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-8 w-20" />
        <SkeletonBlock className="h-3 w-32" />
    </div>
);

const SkeletonChart = () => (
    <div className="rounded-2xl border border-[#1e2128] bg-[#0e1015] p-5 space-y-4">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-[200px] w-full" />
    </div>
);

/* ─── Enhanced KPI Card ─── */
const KpiCard = ({ label, value, tone = 'text-white', subtitle, icon: Icon, accentColor = '#3b82f6' }) => (
    <div className="group relative rounded-2xl border border-[#1e2128] bg-[#0e1015] p-5 transition-all duration-300 hover:border-[#2a3040] hover:bg-[#111419] hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden">
        {/* Subtle gradient accent on top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] opacity-40 group-hover:opacity-70 transition-opacity" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />
        <div className="flex items-start justify-between mb-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-gray-500 font-medium">{label}</div>
            {Icon && (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.03] group-hover:bg-white/[0.06] transition-colors">
                    <Icon size={15} style={{ color: accentColor }} className="opacity-60 group-hover:opacity-100 transition-opacity" />
                </div>
            )}
        </div>
        <div className={`text-2xl sm:text-3xl font-semibold tracking-tight ${tone} transition-transform duration-300 group-hover:translate-x-0.5`}>{value}</div>
        {subtitle && <div className="text-xs text-gray-500 mt-2.5 font-medium">{subtitle}</div>}
    </div>
);

/* ─── Enhanced Table ─── */
const SimpleTable = ({ columns, rows, onTickerClick, title, compact = false }) => (
    <div className="overflow-x-auto overflow-y-hidden rounded-xl">
        <table className={`w-full text-sm ${compact ? '' : 'min-w-[520px]'}`}>
            <thead>
                <tr className="border-b border-[#1e2128]">
                    {columns.map((column) => (
                        <th key={column.key} className="py-3 pr-4 text-left text-[11px] uppercase tracking-[0.18em] text-gray-500 font-semibold">
                            {column.label}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, index) => (
                    <tr
                        key={`${row.stock_id || row.sector || index}`}
                        className="border-b border-[#141720] last:border-b-0 transition-colors hover:bg-white/[0.02] group/row"
                    >
                        {columns.map((column) => (
                            <td key={column.key} className="py-3 pr-4 text-gray-300 text-[13px]">
                                {column.key === 'stock_id' && row[column.key] ? (
                                    <button
                                        onClick={() => onTickerClick?.(row[column.key])}
                                        className="text-blue-400 hover:text-blue-300 font-semibold tracking-wide transition-colors inline-flex items-center gap-1.5 group/ticker"
                                    >
                                        <span>{row[column.key]}</span>
                                        <ArrowUpRight size={12} className="opacity-0 group-hover/ticker:opacity-100 transition-opacity -translate-y-px" />
                                    </button>
                                ) : (
                                    column.render ? column.render(row[column.key], row) : (row[column.key] ?? '--')
                                )}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
        {rows.length === 0 && (
            <div className="py-10 text-sm text-gray-600 text-center flex flex-col items-center gap-2">
                <Database size={20} className="opacity-40" />
                <span>No data available for current filters</span>
            </div>
        )}
    </div>
);

/* ─── Card wrapper ─── */
const Card = ({ children, className = '', noPadding = false }) => (
    <div className={`rounded-2xl border border-[#1e2128] bg-[#0e1015] ${noPadding ? '' : 'p-5'} transition-colors hover:border-[#252a34] ${className}`}>
        {children}
    </div>
);

/* ─── Chart card with header ─── */
const ChartCard = ({ title, icon: Icon, description, children, className = '' }) => (
    <Card className={className}>
        <div className="flex items-center gap-2.5 mb-4">
            {Icon && <Icon size={16} className="text-blue-400 opacity-70" />}
            <div>
                <div className="text-white font-semibold text-sm">{title}</div>
                {description && <div className="text-[11px] text-gray-500 mt-0.5">{description}</div>}
            </div>
        </div>
        <div className="w-full min-w-0 overflow-hidden">
            {children}
        </div>
    </Card>
);

/* ─── Status badge ─── */
const StatusBadge = ({ status }) => {
    const config = {
        healthy: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', icon: CheckCircle },
        warning: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', icon: AlertTriangle },
        stale: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', icon: XCircle },
    };
    const c = config[status] || config.warning;
    const Icon = c.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${c.bg} ${c.text} border ${c.border}`}>
            <Icon size={12} />
            {status}
        </span>
    );
};


const DataAnalystTab = ({ onSelectStock, stockList = [] }) => {
    const [activeSection, setActiveSection] = useState('overview');
    const [filters, setFilters] = useState({
        start_date: toIsoDate(startDefault),
        end_date: toIsoDate(today),
        sector: 'ALL',
        ticker: 'ALL',
        status: 'ALL',
        probability_bucket: 'ALL',
    });
    const [sectors, setSectors] = useState([]);
    const [sectorMap, setSectorMap] = useState({});
    const [data, setData] = useState(defaultSectionState);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isMobile, setIsMobile] = useState(getIsMobileViewport);
    const [sectionLoading, setSectionLoading] = useState(createSectionLoadingState);
    const [loadedSections, setLoadedSections] = useState(createLoadedSectionsState);
    const [debouncedFilters, setDebouncedFilters] = useState(filters);
    const [showFilters, setShowFilters] = useState(false);
    const requestSequenceRef = useRef(0);

    useEffect(() => {
        const loadFilters = async () => {
            const sectorMap = await getSectors();
            setSectorMap(sectorMap);
            setSectors(Object.keys(sectorMap).sort());
        };
        loadFilters();
    }, []);

    useEffect(() => {
        const handleResize = () => setIsMobile(getIsMobileViewport());
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedFilters(filters);
        }, 350);
        return () => window.clearTimeout(timeoutId);
    }, [filters]);

    const commonFilters = useMemo(() => ({
        start_date: debouncedFilters.start_date,
        end_date: debouncedFilters.end_date,
        sector: debouncedFilters.sector,
        ticker: debouncedFilters.ticker,
    }), [debouncedFilters.end_date, debouncedFilters.sector, debouncedFilters.start_date, debouncedFilters.ticker]);

    const bootstrapFilters = useMemo(() => ({
        ...commonFilters,
        status: debouncedFilters.status,
    }), [commonFilters, debouncedFilters.status]);

    const sectionFilters = useMemo(() => ({
        overview: bootstrapFilters,
        signals: { ...commonFilters, probability_bucket: debouncedFilters.probability_bucket },
        trades: { ...commonFilters, status: debouncedFilters.status },
        market: commonFilters,
        health: {},
    }), [bootstrapFilters, commonFilters, debouncedFilters.probability_bucket, debouncedFilters.status]);
    const filtersSignature = useMemo(() => JSON.stringify(debouncedFilters), [debouncedFilters]);

    const updateSectionData = (section, payload) => {
        setData((prev) => ({ ...prev, [section]: payload }));
    };

    const markSectionLoading = (section, value) => {
        setSectionLoading((prev) => ({ ...prev, [section]: value }));
    };

    const markSectionLoaded = (section, value) => {
        setLoadedSections((prev) => ({ ...prev, [section]: value }));
    };

    const loadBootstrap = async ({ isRefresh = false } = {}) => {
        const requestId = requestSequenceRef.current;
        if (isRefresh) setRefreshing(true);

        const cachedBootstrap = !isRefresh ? readCachedAnalytics('/analytics/bootstrap', bootstrapFilters) : null;
        if (cachedBootstrap) {
            updateSectionData('overview', cachedBootstrap.overview || defaultSectionState.overview);
            updateSectionData('health', cachedBootstrap.health || defaultSectionState.health);
            markSectionLoaded('overview', true);
            markSectionLoaded('health', true);
            setLoading(false);
        } else if (!isRefresh) {
            setLoading(true);
        }

        markSectionLoading('overview', true);
        markSectionLoading('health', true);

        const payload = await getDataAnalystBootstrap(bootstrapFilters);
        if (requestId !== requestSequenceRef.current) return;

        updateSectionData('overview', payload.overview || defaultSectionState.overview);
        updateSectionData('health', payload.health || defaultSectionState.health);
        markSectionLoaded('overview', true);
        markSectionLoaded('health', true);
        markSectionLoading('overview', false);
        markSectionLoading('health', false);
        setLoading(false);
        setRefreshing(false);
    };

    const loadSection = async (section, { isRefresh = false } = {}) => {
        const requestId = requestSequenceRef.current;
        const sectionFilter = sectionFilters[section] || {};
        const cachedPayload = !isRefresh ? readCachedAnalytics(`/analytics/${section === 'health' ? 'pipeline-health' : section}`, sectionFilter) : null;

        if (cachedPayload) {
            updateSectionData(section, cachedPayload);
            markSectionLoaded(section, true);
        }

        markSectionLoading(section, true);

        let payload = sectionDefaults[section];
        if (section === 'signals') payload = await getDataAnalystSignals(sectionFilter);
        if (section === 'trades') payload = await getDataAnalystTrades(sectionFilter);
        if (section === 'market') payload = await getDataAnalystMarket(sectionFilter);
        if (section === 'overview') payload = await getDataAnalystOverview(sectionFilter);
        if (section === 'health') payload = await getDataAnalystPipelineHealth();

        if (requestId !== requestSequenceRef.current) return;

        updateSectionData(section, payload || sectionDefaults[section]);
        markSectionLoaded(section, true);
        markSectionLoading(section, false);
        if (section === 'overview' || section === 'health') {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        requestSequenceRef.current += 1;
        setLoadedSections(createLoadedSectionsState());
        setSectionLoading(createSectionLoadingState());
        setData(defaultSectionState);
        loadBootstrap();
    }, [filtersSignature]);

    useEffect(() => {
        if (activeSection === 'overview' || activeSection === 'health') return;
        if (loadedSections[activeSection] || sectionLoading[activeSection]) return;
        loadSection(activeSection);
    }, [activeSection, loadedSections, sectionLoading, sectionFilters]);

    const availableTickers = useMemo(() => {
        if (filters.sector === 'ALL') return stockList;
        return sectorMap[filters.sector] || stockList;
    }, [filters.sector, sectorMap, stockList]);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filters.sector !== 'ALL') count++;
        if (filters.ticker !== 'ALL') count++;
        if (filters.status !== 'ALL') count++;
        if (filters.probability_bucket !== 'ALL') count++;
        return count;
    }, [filters]);

    const basePlotLayout = (overrides = {}) => ({
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#94a3b8', size: isMobile ? 10 : 12, family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
        autosize: true,
        margin: {
            l: isMobile ? 22 : 30,
            r: isMobile ? 8 : 12,
            t: 10,
            b: isMobile ? 72 : 52,
        },
        legend: isMobile
            ? { orientation: 'h', y: -0.38, x: 0, font: { size: 10, color: '#64748b' } }
            : { orientation: 'h', y: -0.24, x: 0, font: { color: '#64748b' } },
        xaxis: {
            automargin: true,
            tickfont: { size: isMobile ? 9 : 11, color: '#64748b' },
            tickangle: isMobile ? -35 : 0,
            gridcolor: '#1e2128',
            zerolinecolor: '#1e2128',
        },
        yaxis: {
            automargin: true,
            tickfont: { size: isMobile ? 9 : 11, color: '#64748b' },
            gridcolor: '#1e2128',
            zerolinecolor: '#1e2128',
        },
        ...overrides,
    });

    const plotStyle = {
        width: '100%',
        height: isMobile ? 220 : 280,
    };

    /* ─── Filter input component ─── */
    const FilterInput = ({ label, children }) => (
        <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500 font-medium">{label}</span>
            {children}
        </label>
    );

    const selectClass = "w-full bg-[#0e1015] border border-[#1e2128] rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all appearance-none cursor-pointer hover:border-[#2a3040]";
    const inputClass = "w-full bg-[#0e1015] border border-[#1e2128] rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all hover:border-[#2a3040]";

    const handleRefresh = () => {
        requestSequenceRef.current += 1;
        setLoadedSections(createLoadedSectionsState());
        setSectionLoading(createSectionLoadingState());
        setData(defaultSectionState);
        loadBootstrap({ isRefresh: true });
        if (!['overview', 'health'].includes(activeSection)) {
            loadSection(activeSection, { isRefresh: true });
        }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-[#060709]">
            {/* Shimmer keyframe */}
            <style>{`@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`}</style>

            <div className="max-w-[1600px] mx-auto px-3 sm:px-5 py-4 sm:py-6 space-y-4 sm:space-y-5 overflow-x-hidden">

                {/* ─── Sticky Header ─── */}
                <div className="sticky top-0 z-20 rounded-2xl border border-[#1e2128] bg-[#0a0c10]/95 backdrop-blur-xl overflow-hidden">
                    <div className="p-4 sm:p-5">
                        {/* Title row + actions */}
                        <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2.5 mb-1">
                                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                    <span className="text-[11px] uppercase tracking-[0.28em] text-blue-400 font-semibold">Data Analyst</span>
                                </div>
                                <h1 className="text-lg sm:text-2xl font-semibold text-white leading-tight">Research & Operations</h1>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Filter toggle */}
                                <button
                                    onClick={() => setShowFilters(!showFilters)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                                        showFilters
                                            ? 'bg-blue-600/10 border-blue-500/30 text-blue-400'
                                            : 'bg-transparent border-[#1e2128] text-gray-400 hover:text-white hover:border-[#2a3040]'
                                    }`}
                                >
                                    <Filter size={15} />
                                    <span className="hidden sm:inline">Filters</span>
                                    {activeFilterCount > 0 && (
                                        <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold px-1.5">
                                            {activeFilterCount}
                                        </span>
                                    )}
                                    {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                {/* Refresh */}
                                <button
                                    onClick={handleRefresh}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#1e2128] text-gray-400 hover:text-white hover:border-blue-500/40 transition-all text-sm font-medium"
                                >
                                    <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
                                    <span className="hidden sm:inline">Refresh</span>
                                </button>
                            </div>
                        </div>

                        {/* Collapsible filter panel */}
                        <div className={`grid transition-all duration-300 ease-in-out ${showFilters ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
                            <div className="overflow-hidden">
                                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 pt-4 border-t border-[#1e2128]">
                                    <FilterInput label="Start Date">
                                        <input type="date" value={filters.start_date} onChange={(e) => setFilters((prev) => ({ ...prev, start_date: e.target.value }))} className={inputClass} />
                                    </FilterInput>
                                    <FilterInput label="End Date">
                                        <input type="date" value={filters.end_date} onChange={(e) => setFilters((prev) => ({ ...prev, end_date: e.target.value }))} className={inputClass} />
                                    </FilterInput>
                                    <FilterInput label="Sector">
                                        <select value={filters.sector} onChange={(e) => setFilters((prev) => ({ ...prev, sector: e.target.value }))} className={selectClass}>
                                            <option value="ALL">All sectors</option>
                                            {sectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
                                        </select>
                                    </FilterInput>
                                    <FilterInput label="Ticker">
                                        <select value={filters.ticker} onChange={(e) => setFilters((prev) => ({ ...prev, ticker: e.target.value }))} className={selectClass}>
                                            <option value="ALL">All tickers</option>
                                            {availableTickers.map((ticker) => <option key={ticker} value={ticker}>{ticker}</option>)}
                                        </select>
                                    </FilterInput>
                                    <FilterInput label="Trade Status">
                                        <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className={selectClass}>
                                            {['ALL', 'TP', 'SL', 'TIMEOUT', 'HOLD'].map((status) => <option key={status} value={status}>{status}</option>)}
                                        </select>
                                    </FilterInput>
                                    <FilterInput label="Probability">
                                        <select value={filters.probability_bucket} onChange={(e) => setFilters((prev) => ({ ...prev, probability_bucket: e.target.value }))} className={selectClass}>
                                            {['ALL', '<60%', '60-70%', '70-80%', '80-90%', '90%+'].map((bucket) => <option key={bucket} value={bucket}>{bucket}</option>)}
                                        </select>
                                    </FilterInput>
                                </div>
                            </div>
                        </div>

                        {/* Section tabs */}
                        <div className="mt-4 -mx-4 sm:-mx-5 px-4 sm:px-5 border-t border-[#1e2128] pt-3">
                            {isMobile ? (
                                <select
                                    value={activeSection}
                                    onChange={(e) => setActiveSection(e.target.value)}
                                    className={selectClass}
                                >
                                    {SECTION_TABS.map((section) => (
                                        <option key={section.id} value={section.id}>{section.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    {SECTION_TABS.map((section) => {
                                        const Icon = section.icon;
                                        const isActive = activeSection === section.id;
                                        return (
                                            <button
                                                key={section.id}
                                                onClick={() => setActiveSection(section.id)}
                                                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                                                    isActive
                                                        ? 'text-white bg-white/[0.06]'
                                                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]'
                                                }`}
                                            >
                                                <Icon size={15} className={isActive ? 'text-blue-400' : ''} />
                                                <span>{section.label}</span>
                                                {isActive && (
                                                    <div className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-blue-500" />
                                                )}
                                                {sectionLoading[section.id] && (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ─── Content area ─── */}
                {loading ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
                            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
                        </div>
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                            <div className="xl:col-span-2"><SkeletonChart /></div>
                            <SkeletonChart />
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Section-level loading */}
                        {!loading && sectionLoading[activeSection] && !loadedSections[activeSection] && (
                            <div className="space-y-4 animate-pulse">
                                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
                                    {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                                </div>
                                <SkeletonChart />
                            </div>
                        )}

                        {/* ═══ OVERVIEW ═══ */}
                        <section className={`space-y-4 transition-opacity duration-200 ${activeSection !== 'overview' ? 'hidden' : ''}`}>
                            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
                                <KpiCard label="Tracked Tickers" value={formatNumber(data.overview.summary.total_tickers || 0, 0)} icon={Layers} accentColor="#6366f1" />
                                <KpiCard label="Total Breakouts" value={formatNumber(data.overview.summary.total_signals || 0, 0)} tone="text-blue-400" icon={Zap} accentColor="#3b82f6" />
                                <KpiCard label="Win Rate" value={formatPercent(data.overview.summary.win_rate || 0)} tone="text-emerald-400" icon={Target} accentColor="#10b981" />
                                <KpiCard label="Avg Return" value={formatPercent(data.overview.summary.avg_return || 0)} tone={(data.overview.summary.avg_return || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} icon={TrendingUp} accentColor={(data.overview.summary.avg_return || 0) >= 0 ? '#10b981' : '#ef4444'} />
                                <KpiCard label="Max Drawdown" value={formatPercent(data.overview.summary.max_drawdown || 0)} tone="text-red-400" icon={ArrowDownRight} accentColor="#ef4444" subtitle={`Avg hold ${formatNumber(data.overview.summary.avg_holding_days || 0, 1)}d`} />
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                <ChartCard title="Signal Trend & Closes" icon={TrendingUp} description="30-day signal count with closed trade overlay" className="xl:col-span-2">
                                    <Plot data={[
                                        { x: data.overview.series.signal_trend_30d.map((item) => item.signal_date), y: data.overview.series.signal_trend_30d.map((item) => item.signal_count), type: 'scatter', mode: 'lines+markers', name: 'Signals', line: { color: '#3b82f6', width: 2 }, marker: { size: 4 } },
                                        { x: data.overview.series.trade_close_trend_30d.map((item) => item.exit_date), y: data.overview.series.trade_close_trend_30d.map((item) => item.closed_trade_count), type: 'bar', name: 'Closed trades', marker: { color: '#10b981', opacity: 0.4 } },
                                    ]} layout={basePlotLayout()} config={{ displayModeBar: false, responsive: true }} style={plotStyle} useResizeHandler />
                                </ChartCard>
                                <Card className="space-y-5">
                                    <div>
                                        <div className="flex items-center gap-2 text-white font-semibold text-sm mb-3">
                                            <Database size={15} className="text-blue-400 opacity-70" />
                                            Freshness
                                        </div>
                                        <div className="space-y-2">
                                            {data.overview.freshness.slice(0, 5).map((item) => (
                                                <div key={item.table} className="flex items-center justify-between text-sm py-1.5 px-3 rounded-lg hover:bg-white/[0.02] transition-colors">
                                                    <span className="text-gray-400 text-[13px]">{item.table}</span>
                                                    <StatusBadge status={item.status} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="border-t border-[#1e2128] pt-4">
                                        <div className="flex items-center gap-2 text-white font-semibold text-sm mb-3">
                                            <AlertTriangle size={15} className="text-amber-400 opacity-70" />
                                            Alerts
                                        </div>
                                        <div className="space-y-2">
                                            {(data.overview.alerts.length ? data.overview.alerts : [{ level: 'healthy', message: 'No active issues detected.' }]).map((alert, index) => (
                                                <div key={`${alert.message}-${index}`} className={`p-3 rounded-xl text-sm text-gray-300 flex gap-3 border ${
                                                    alert.level === 'warning' ? 'bg-amber-500/5 border-amber-500/10' :
                                                    alert.level === 'healthy' ? 'bg-emerald-500/5 border-emerald-500/10' :
                                                    'bg-blue-500/5 border-blue-500/10'
                                                }`}>
                                                    <AlertTriangle size={15} className={`shrink-0 mt-0.5 ${
                                                        alert.level === 'warning' ? 'text-amber-400' :
                                                        alert.level === 'healthy' ? 'text-emerald-400' : 'text-blue-400'
                                                    }`} />
                                                    <span className="text-[13px] leading-relaxed">{alert.message}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </section>

                        {/* ═══ SIGNALS ═══ */}
                        <section className={`space-y-4 transition-opacity duration-200 ${activeSection !== 'signals' ? 'hidden' : ''}`}>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <ChartCard title="Signal Count Trend" icon={TrendingUp} description="Daily signal generation over time">
                                    <Plot data={[{ x: data.signals.series.signal_trend.map((item) => item.signal_date), y: data.signals.series.signal_trend.map((item) => item.signal_count), type: 'scatter', mode: 'lines+markers', line: { color: '#38bdf8', width: 2 }, marker: { size: 4 } }]} layout={basePlotLayout()} config={{ displayModeBar: false, responsive: true }} style={plotStyle} useResizeHandler />
                                </ChartCard>
                                <ChartCard title="Probability Buckets" icon={PieChart} description="Signal distribution by confidence level">
                                    <Plot data={[{ x: data.signals.series.probability_buckets.map((item) => item.probability_bucket), y: data.signals.series.probability_buckets.map((item) => item.signal_count), type: 'bar', marker: { color: '#22c55e', opacity: 0.7 } }]} layout={basePlotLayout()} config={{ displayModeBar: false, responsive: true }} style={plotStyle} useResizeHandler />
                                </ChartCard>
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                <ChartCard title="Recent Signals" icon={Zap} description="Latest model-generated signals" className="xl:col-span-2">
                                    <SimpleTable
                                        columns={[
                                            { key: 'stock_id', label: 'Ticker' },
                                            { key: 'sector', label: 'Sector' },
                                            { key: 'probability_bucket', label: 'Bucket' },
                                            { key: 'prob', label: 'Prob', render: (value) => formatPercent((value || 0) * 100, 1) },
                                            { key: 'reward_risk', label: 'R/R', render: (value) => formatNumber(value, 2) },
                                        ]}
                                        rows={data.signals.tables.recent_signals}
                                        onTickerClick={onSelectStock}
                                    />
                                </ChartCard>
                                <ChartCard title="Top Tickers" icon={Award} description="Most frequently signaled stocks">
                                    <SimpleTable
                                        compact
                                        columns={[
                                            { key: 'stock_id', label: 'Ticker' },
                                            { key: 'signal_count', label: 'Signals' },
                                            { key: 'avg_prob', label: 'Avg Prob', render: (value) => formatPercent((value || 0) * 100, 1) },
                                        ]}
                                        rows={data.signals.series.top_tickers}
                                        onTickerClick={onSelectStock}
                                    />
                                </ChartCard>
                            </div>
                        </section>

                        {/* ═══ TRADES ═══ */}
                        <section className={`space-y-4 transition-opacity duration-200 ${activeSection !== 'trades' ? 'hidden' : ''}`}>
                            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
                                <KpiCard label="Total Trades" value={formatNumber(data.trades.summary.total_trades || 0, 0)} icon={BarChart2} accentColor="#6366f1" />
                                <KpiCard label="Open Trades" value={formatNumber(data.trades.summary.open_trades || 0, 0)} tone="text-blue-400" icon={Clock} accentColor="#3b82f6" />
                                <KpiCard label="Closed Trades" value={formatNumber(data.trades.summary.closed_trades || 0, 0)} icon={CheckCircle} accentColor="#64748b" />
                                <KpiCard label="Profit Factor" value={formatNumber(data.trades.summary.profit_factor || 0, 2)} tone="text-emerald-400" icon={TrendingUp} accentColor="#10b981" />
                                <KpiCard label="Best / Worst" value={`${formatPercent(data.trades.summary.best_trade || 0)} / ${formatPercent(data.trades.summary.worst_trade || 0)}`} icon={Activity} accentColor="#f59e0b" />
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <ChartCard title="Equity Curve" icon={TrendingUp} description="Cumulative portfolio performance">
                                    <Plot data={[{ x: data.trades.series.equity_curve.map((item) => item.date), y: data.trades.series.equity_curve.map((item) => item.cumulative_return_pct), type: 'scatter', mode: 'lines', line: { color: '#22c55e', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(34,197,94,0.05)' }]} layout={basePlotLayout()} config={{ displayModeBar: false, responsive: true }} style={plotStyle} useResizeHandler />
                                </ChartCard>
                                <ChartCard title="Outcome Breakdown" icon={PieChart} description="Trade results by exit type">
                                    <Plot data={[{ x: data.trades.series.outcome_breakdown.map((item) => item.status), y: data.trades.series.outcome_breakdown.map((item) => item.trade_count), type: 'bar', marker: { color: ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6'], opacity: 0.8 } }]} layout={basePlotLayout()} config={{ displayModeBar: false, responsive: true }} style={plotStyle} useResizeHandler />
                                </ChartCard>
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <ChartCard title="Ticker Leaderboard" icon={Award} description="Top performing tickers by average return">
                                    <SimpleTable columns={[{ key: 'stock_id', label: 'Ticker' }, { key: 'sector', label: 'Sector' }, { key: 'trades', label: 'Trades' }, { key: 'avg_return', label: 'Avg Return', render: (value) => formatPercent(value, 1) }]} rows={data.trades.tables.ticker_leaderboard} onTickerClick={onSelectStock} />
                                </ChartCard>
                                <ChartCard title="Open Trades" icon={Clock} description="Currently held positions">
                                    <SimpleTable columns={[{ key: 'stock_id', label: 'Ticker' }, { key: 'sector', label: 'Sector' }, { key: 'age_days', label: 'Age' }, { key: 'prob', label: 'Prob', render: (value) => formatPercent((value || 0) * 100, 1) }]} rows={data.trades.tables.open_trades} onTickerClick={onSelectStock} />
                                </ChartCard>
                            </div>
                        </section>

                        {/* ═══ MARKET ═══ */}
                        <section className={`space-y-4 transition-opacity duration-200 ${activeSection !== 'market' ? 'hidden' : ''}`}>
                            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                                <KpiCard
                                    label="Market Regime"
                                    value={
                                        (data.overview.summary.win_rate || 0) >= 55 ? 'Risk-On' :
                                        (data.overview.summary.win_rate || 0) <= 45 ? 'Risk-Off' : 'Neutral'
                                    }
                                    tone={(data.overview.summary.win_rate || 0) >= 55 ? 'text-emerald-400' : (data.overview.summary.win_rate || 0) <= 45 ? 'text-red-400' : 'text-amber-400'}
                                    icon={Gauge}
                                    accentColor={(data.overview.summary.win_rate || 0) >= 55 ? '#10b981' : (data.overview.summary.win_rate || 0) <= 45 ? '#ef4444' : '#f59e0b'}
                                />
                                <KpiCard label="Advancers" value={formatNumber(data.market.summary.breadth?.advancers || 0, 0)} tone="text-emerald-400" icon={ArrowUpRight} accentColor="#10b981" />
                                <KpiCard label="Decliners" value={formatNumber(data.market.summary.breadth?.decliners || 0, 0)} tone="text-red-400" icon={TrendingDown} accentColor="#ef4444" />
                                <KpiCard label="Above MA20" value={formatPercent(data.market.summary.breadth?.above_ma20_pct || 0)} icon={BarChart2} accentColor="#6366f1" />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                                <KpiCard label="Above MA5" value={formatPercent(data.market.summary.breadth?.above_ma5_pct || 0)} icon={Activity} accentColor="#8b5cf6" />
                                <KpiCard label="New 20D Highs" value={formatNumber(data.market.summary.breadth?.new_20d_highs || 0, 0)} icon={ArrowUpRight} accentColor="#10b981" />
                                <KpiCard label="New 20D Lows" value={formatNumber(data.market.summary.breadth?.new_20d_lows || 0, 0)} icon={ArrowDown} accentColor="#ef4444" />
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <ChartCard title="Sector Performance" icon={BarChart3} description="Average returns by sector">
                                    <Plot data={[{ y: data.market.series.sector_performance.map((item) => item.sector), x: data.market.series.sector_performance.map((item) => item.avg_return), type: 'bar', orientation: 'h', marker: { color: data.market.series.sector_performance.map((item) => (item.avg_return || 0) >= 0 ? '#22c55e' : '#ef4444'), opacity: 0.7 } }]} layout={basePlotLayout({ margin: { l: isMobile ? 100 : 140, r: isMobile ? 12 : 20, t: 10, b: 30 }, yaxis: { automargin: true, tickfont: { size: isMobile ? 9 : 11, color: '#94a3b8' }, gridcolor: '#1e2128' }, xaxis: { automargin: true, tickfont: { size: isMobile ? 9 : 11, color: '#64748b' }, gridcolor: '#1e2128', ticksuffix: '%' } })} config={{ displayModeBar: false, responsive: true }} style={{ width: '100%', height: Math.max(isMobile ? 300 : 360, (data.market.series.sector_performance.length || 1) * 28) }} useResizeHandler />
                                </ChartCard>
                                <ChartCard title="VNINDEX Diagnostics" icon={LineChart} description="Index price with drawdown overlay">
                                    <Plot data={[{ x: data.market.series.vnindex.map((item) => item.trade_date), y: data.market.series.vnindex.map((item) => item.close), type: 'scatter', mode: 'lines', line: { color: '#f59e0b', width: 2 }, name: 'Close' }, { x: data.market.series.vnindex.map((item) => item.trade_date), y: data.market.series.vnindex.map((item) => item.drawdown_pct), type: 'scatter', mode: 'lines', yaxis: 'y2', line: { color: '#ef4444', width: 1.5 }, name: 'Drawdown %' }]} layout={basePlotLayout({ margin: { l: isMobile ? 22 : 30, r: isMobile ? 26 : 40, t: 10, b: isMobile ? 78 : 55 }, yaxis2: { overlaying: 'y', side: 'right', automargin: true, tickfont: { size: isMobile ? 9 : 11, color: '#64748b' }, gridcolor: 'transparent' } })} config={{ displayModeBar: false, responsive: true }} style={{ width: '100%', height: isMobile ? 240 : 280 }} useResizeHandler />
                                </ChartCard>
                            </div>
                            <ChartCard title="Liquidity Leaders" icon={Users} description="Top stocks by traded value">
                                <SimpleTable columns={[{ key: 'stock_id', label: 'Ticker' }, { key: 'sector', label: 'Sector' }, { key: 'close', label: 'Close', render: (value) => formatNumber(value, 2) }, { key: 'traded_value', label: 'Traded Value', render: (value) => formatNumber(value, 0) }, { key: 'daily_return', label: 'Return', render: (value) => formatPercent((value || 0) * 100, 1) }]} rows={data.market.series.liquidity_leaders} onTickerClick={onSelectStock} />
                            </ChartCard>
                        </section>

                        {/* ═══ HEALTH ═══ */}
                        <section className={`space-y-4 transition-opacity duration-200 ${activeSection !== 'health' ? 'hidden' : ''}`}>
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                                <KpiCard label="Latest Coverage" value={formatPercent(data.health.summary.coverage_pct || 0)} tone="text-blue-400" icon={Target} accentColor="#3b82f6" />
                                <KpiCard label="Tracked Tickers" value={formatNumber(data.health.summary.total_tickers || 0, 0)} icon={Layers} accentColor="#6366f1" />
                                <KpiCard label="Latest-Day Tickers" value={formatNumber(data.health.summary.tickers_present_latest_day || 0, 0)} icon={CheckCircle} accentColor="#10b981" />
                                <KpiCard label="Unmapped Tickers" value={formatNumber(data.health.summary.unmapped_ticker_count || 0, 0)} tone="text-amber-400" icon={AlertTriangle} accentColor="#f59e0b" />
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <ChartCard title="Freshness Matrix" icon={Database} description="Data recency for each pipeline table">
                                    <SimpleTable columns={[
                                        { key: 'table', label: 'Table' },
                                        { key: 'latest_value', label: 'Latest Value' },
                                        { key: 'lag_days', label: 'Lag Days' },
                                        { key: 'status', label: 'Status', render: (value) => <StatusBadge status={value} /> },
                                    ]} rows={data.health.freshness} />
                                </ChartCard>
                                <ChartCard title="Coverage & Anomalies" icon={Filter} description="Data quality issues and unmapped symbols">
                                    <div className="space-y-2.5">
                                        {(data.health.anomalies.length ? data.health.anomalies : [{ level: 'healthy', message: 'No material coverage anomalies detected.' }]).map((item, index) => (
                                            <div key={`${item.message}-${index}`} className={`p-3 rounded-xl text-[13px] text-gray-300 border leading-relaxed ${
                                                item.level === 'healthy' ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-amber-500/5 border-amber-500/10'
                                            }`}>
                                                {item.message}
                                            </div>
                                        ))}
                                        {data.health.coverage.unmapped_tickers?.length > 0 && (
                                            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 text-[13px] text-gray-300 leading-relaxed">
                                                <span className="font-medium text-amber-400">Unmapped: </span>
                                                {data.health.coverage.unmapped_tickers.join(', ')}
                                            </div>
                                        )}
                                    </div>
                                </ChartCard>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
};

export default DataAnalystTab;
