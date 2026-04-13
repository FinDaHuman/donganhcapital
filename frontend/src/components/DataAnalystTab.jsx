import React, { useEffect, useMemo, useRef, useState } from 'react';
import Plot from 'react-plotly.js';
import {
    Activity,
    AlertTriangle,
    BarChart3,
    Database,
    Filter,
    LineChart,
    RefreshCw,
    ShieldAlert,
    TrendingUp,
} from 'lucide-react';
import {
    getMarketIntelligenceBootstrap,
    getMarketIntelligenceMarket,
    getMarketIntelligenceOverview,
    getMarketIntelligencePipelineHealth,
    getMarketIntelligenceSignals,
    getMarketIntelligenceTrades,
    getSectors,
    readCachedAnalytics,
} from '../services/stock_api';

const SECTION_TABS = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'signals', label: 'Model Activity', icon: TrendingUp },
    { id: 'trades', label: 'Performance Analyst', icon: BarChart3 },
    { id: 'market', label: 'Market Analyst', icon: LineChart },
    { id: 'health', label: 'Data Health', icon: ShieldAlert },
];

const CARD_CLASS = 'bg-[#111213] border border-[#2a2e39] rounded-2xl p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]';

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

const KpiCard = ({ label, value, tone = 'text-white', subtitle }) => (
    <div className={`${CARD_CLASS} min-h-[126px]`}>
        <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500 mb-3">{label}</div>
        <div className={`text-3xl font-semibold ${tone}`}>{value}</div>
        {subtitle && <div className="text-sm text-gray-500 mt-3">{subtitle}</div>}
    </div>
);

const SimpleTable = ({ columns, rows, onTickerClick }) => (
    <div className="overflow-x-auto overflow-y-hidden">
        <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-gray-500 border-b border-[#2a2e39]">
                <tr>{columns.map((column) => <th key={column.key} className="py-3 pr-4 font-medium">{column.label}</th>)}</tr>
            </thead>
            <tbody>
                {rows.map((row, index) => (
                    <tr key={`${row.stock_id || row.sector || index}`} className="border-b border-[#1c2028] last:border-b-0">
                        {columns.map((column) => (
                            <td key={column.key} className="py-3 pr-4 text-gray-300">
                                {column.key === 'stock_id' && row[column.key] ? (
                                    <button onClick={() => onTickerClick?.(row[column.key])} className="text-blue-400 hover:text-blue-300 font-semibold">
                                        {row[column.key]}
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
        {rows.length === 0 && <div className="py-6 text-sm text-gray-500">No rows available for the current filters.</div>}
    </div>
);

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

        const payload = await getMarketIntelligenceBootstrap(bootstrapFilters);
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
        if (section === 'signals') payload = await getMarketIntelligenceSignals(sectionFilter);
        if (section === 'trades') payload = await getMarketIntelligenceTrades(sectionFilter);
        if (section === 'market') payload = await getMarketIntelligenceMarket(sectionFilter);
        if (section === 'overview') payload = await getMarketIntelligenceOverview(sectionFilter);
        if (section === 'health') payload = await getMarketIntelligencePipelineHealth();

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

    const sectionButton = (section) => {
        const Icon = section.icon;
        return (
            <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all whitespace-nowrap shrink-0 ${
                    activeSection === section.id
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-[#111213] border-[#2a2e39] text-gray-400 hover:text-white'
                }`}
            >
                <Icon size={16} />
                <span>{section.label}</span>
            </button>
        );
    };

    const basePlotLayout = (overrides = {}) => ({
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#cbd5e1', size: isMobile ? 10 : 12 },
        autosize: true,
        margin: {
            l: isMobile ? 22 : 30,
            r: isMobile ? 8 : 12,
            t: 10,
            b: isMobile ? 72 : 52,
        },
        legend: isMobile
            ? { orientation: 'h', y: -0.38, x: 0, font: { size: 10 } }
            : { orientation: 'h', y: -0.24, x: 0 },
        xaxis: {
            automargin: true,
            tickfont: { size: isMobile ? 9 : 11 },
            tickangle: isMobile ? -35 : 0,
        },
        yaxis: {
            automargin: true,
            tickfont: { size: isMobile ? 9 : 11 },
        },
        ...overrides,
    });

    const plotStyle = {
        width: '100%',
        height: isMobile ? 220 : 260,
    };

    return (
        <div className="flex-1 overflow-y-auto bg-[#050607]">
            <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 overflow-x-hidden">
                <div className={`${CARD_CLASS} sticky top-0 z-20 backdrop-blur-xl bg-[#0b0d10]/95 overflow-x-hidden`}>
                    <div className="flex flex-col xl:flex-row xl:items-end gap-4">
                        <div className="min-w-0 xl:min-w-[240px]">
                            <div className="text-xs uppercase tracking-[0.28em] text-blue-400 mb-2">Market Intelligence</div>
                            <div className="text-xl sm:text-3xl font-semibold text-white leading-tight">Research and operations dashboard</div>
                            <div className="text-sm text-gray-400 mt-2">Separate from AI Analyst. Built from live backend analytics payloads.</div>
                        </div>
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                            <label className="text-xs text-gray-500">
                                Start Date
                                <input type="date" value={filters.start_date} onChange={(e) => setFilters((prev) => ({ ...prev, start_date: e.target.value }))} className="mt-1 w-full bg-[#15191f] border border-[#2a2e39] rounded-xl px-3 py-2 text-gray-200" />
                            </label>
                            <label className="text-xs text-gray-500">
                                End Date
                                <input type="date" value={filters.end_date} onChange={(e) => setFilters((prev) => ({ ...prev, end_date: e.target.value }))} className="mt-1 w-full bg-[#15191f] border border-[#2a2e39] rounded-xl px-3 py-2 text-gray-200" />
                            </label>
                            <label className="text-xs text-gray-500">
                                Sector
                                <select value={filters.sector} onChange={(e) => setFilters((prev) => ({ ...prev, sector: e.target.value }))} className="mt-1 w-full bg-[#15191f] border border-[#2a2e39] rounded-xl px-3 py-2 text-gray-200">
                                    <option value="ALL">All sectors</option>
                                    {sectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
                                </select>
                            </label>
                            <label className="text-xs text-gray-500">
                                Ticker
                                <select value={filters.ticker} onChange={(e) => setFilters((prev) => ({ ...prev, ticker: e.target.value }))} className="mt-1 w-full bg-[#15191f] border border-[#2a2e39] rounded-xl px-3 py-2 text-gray-200">
                                    <option value="ALL">All tickers</option>
                                    {availableTickers.map((ticker) => <option key={ticker} value={ticker}>{ticker}</option>)}
                                </select>
                            </label>
                            <label className="text-xs text-gray-500">
                                Trade Status
                                <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="mt-1 w-full bg-[#15191f] border border-[#2a2e39] rounded-xl px-3 py-2 text-gray-200">
                                    {['ALL', 'TP', 'SL', 'TIMEOUT', 'HOLD'].map((status) => <option key={status} value={status}>{status}</option>)}
                                </select>
                            </label>
                            <label className="text-xs text-gray-500">
                                Probability Bucket
                                <select value={filters.probability_bucket} onChange={(e) => setFilters((prev) => ({ ...prev, probability_bucket: e.target.value }))} className="mt-1 w-full bg-[#15191f] border border-[#2a2e39] rounded-xl px-3 py-2 text-gray-200">
                                    {['ALL', '<60%', '60-70%', '70-80%', '80-90%', '90%+'].map((bucket) => <option key={bucket} value={bucket}>{bucket}</option>)}
                                </select>
                            </label>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-5 min-w-0">
                        {isMobile ? (
                            <label className="text-xs text-gray-500 min-w-0">
                                Section
                                <select
                                    value={activeSection}
                                    onChange={(e) => setActiveSection(e.target.value)}
                                    className="mt-1 w-full bg-[#15191f] border border-[#2a2e39] rounded-xl px-3 py-2 text-gray-200"
                                >
                                    {SECTION_TABS.map((section) => (
                                        <option key={section.id} value={section.id}>{section.label}</option>
                                    ))}
                                </select>
                            </label>
                        ) : (
                            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-w-0">
                                {SECTION_TABS.map(sectionButton)}
                            </div>
                        )}
                        <button
                            onClick={() => {
                                requestSequenceRef.current += 1;
                                setLoadedSections(createLoadedSectionsState());
                                setSectionLoading(createSectionLoadingState());
                                setData(defaultSectionState);
                                loadBootstrap({ isRefresh: true });
                                if (!['overview', 'health'].includes(activeSection)) {
                                    loadSection(activeSection, { isRefresh: true });
                                }
                            }}
                            className="sm:ml-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#2a2e39] text-gray-300 hover:text-white hover:border-blue-500"
                        >
                            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className={`${CARD_CLASS} flex items-center justify-center min-h-[320px] text-gray-400 text-center`}>
                        <div className="flex flex-col items-center gap-3 max-w-md">
                            <div className="flex items-center gap-3">
                                <RefreshCw size={18} className="animate-spin text-blue-400" />
                                <span>Loading Data Analyst...</span>
                            </div>
                            <div className="text-sm text-gray-500">
                                First load may take a few seconds because this dashboard pulls multiple analytics datasets from the backend.
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {!loading && sectionLoading[activeSection] && !loadedSections[activeSection] && (
                            <div className={`${CARD_CLASS} flex items-center justify-center min-h-[180px] text-gray-400 text-center`}>
                                <div className="flex flex-col items-center gap-3 max-w-md">
                                    <div className="flex items-center gap-3">
                                        <RefreshCw size={18} className="animate-spin text-blue-400" />
                                        <span>Loading {SECTION_TABS.find((item) => item.id === activeSection)?.label}...</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <section className={`space-y-4 ${activeSection !== 'overview' ? 'hidden' : ''}`}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                                <KpiCard label="Tracked Tickers" value={formatNumber(data.overview.summary.total_tickers || 0, 0)} />
                                <KpiCard label="Total Breakouts" value={formatNumber(data.overview.summary.total_signals || 0, 0)} tone="text-blue-400" />
                                <KpiCard label="Win Rate" value={formatPercent(data.overview.summary.win_rate || 0)} tone="text-green-400" />
                                <KpiCard label="Avg Return" value={formatPercent(data.overview.summary.avg_return || 0)} tone={(data.overview.summary.avg_return || 0) >= 0 ? 'text-green-400' : 'text-red-400'} />
                                <KpiCard label="Max Drawdown" value={formatPercent(data.overview.summary.max_drawdown || 0)} tone="text-red-400" subtitle={`Avg hold ${formatNumber(data.overview.summary.avg_holding_days || 0, 1)}d`} />
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                <div className={`${CARD_CLASS} xl:col-span-2`}>
                                    <div className="flex items-center gap-2 text-white font-semibold mb-4"><TrendingUp size={16} className="text-blue-400" /> Signal trend and closes</div>
                                    <div className="w-full min-w-0 overflow-hidden">
                                    <Plot data={[
                                        { x: data.overview.series.signal_trend_30d.map((item) => item.signal_date), y: data.overview.series.signal_trend_30d.map((item) => item.signal_count), type: 'scatter', mode: 'lines+markers', name: 'Signals', line: { color: '#3b82f6' } },
                                        { x: data.overview.series.trade_close_trend_30d.map((item) => item.exit_date), y: data.overview.series.trade_close_trend_30d.map((item) => item.closed_trade_count), type: 'bar', name: 'Closed trades', marker: { color: '#10b981', opacity: 0.5 } },
                                    ]} layout={basePlotLayout()} config={{ displayModeBar: false, responsive: true }} style={plotStyle} useResizeHandler />
                                    </div>
                                </div>
                                <div className={`${CARD_CLASS} space-y-4`}>
                                    <div>
                                        <div className="text-white font-semibold mb-3">Freshness</div>
                                        <div className="space-y-2">
                                            {data.overview.freshness.slice(0, 5).map((item) => (
                                                <div key={item.table} className="flex items-center justify-between text-sm">
                                                    <span className="text-gray-400">{item.table}</span>
                                                    <span className={item.status === 'healthy' ? 'text-green-400' : item.status === 'warning' ? 'text-yellow-400' : 'text-red-400'}>{item.status}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-white font-semibold mb-3">Alerts</div>
                                        <div className="space-y-2">
                                            {(data.overview.alerts.length ? data.overview.alerts : [{ level: 'healthy', message: 'No active issues detected in current analytics scope.' }]).map((alert, index) => (
                                                <div key={`${alert.message}-${index}`} className="p-3 rounded-xl bg-[#15191f] border border-[#222833] text-sm text-gray-300 flex gap-3">
                                                    <AlertTriangle size={16} className={alert.level === 'warning' ? 'text-yellow-400 shrink-0 mt-0.5' : alert.level === 'healthy' ? 'text-green-400 shrink-0 mt-0.5' : 'text-blue-400 shrink-0 mt-0.5'} />
                                                    <span>{alert.message}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className={`space-y-4 ${activeSection !== 'signals' ? 'hidden' : ''}`}>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className={CARD_CLASS}>
                                    <div className="text-white font-semibold mb-4">Signal count trend</div>
                                    <div className="w-full min-w-0 overflow-hidden">
                                        <Plot data={[{ x: data.signals.series.signal_trend.map((item) => item.signal_date), y: data.signals.series.signal_trend.map((item) => item.signal_count), type: 'scatter', mode: 'lines+markers', line: { color: '#38bdf8' } }]} layout={basePlotLayout()} config={{ displayModeBar: false, responsive: true }} style={plotStyle} useResizeHandler />
                                    </div>
                                </div>
                                <div className={CARD_CLASS}>
                                    <div className="text-white font-semibold mb-4">Probability buckets</div>
                                    <div className="w-full min-w-0 overflow-hidden">
                                        <Plot data={[{ x: data.signals.series.probability_buckets.map((item) => item.probability_bucket), y: data.signals.series.probability_buckets.map((item) => item.signal_count), type: 'bar', marker: { color: '#22c55e' } }]} layout={basePlotLayout()} config={{ displayModeBar: false, responsive: true }} style={plotStyle} useResizeHandler />
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                <div className={`${CARD_CLASS} xl:col-span-2`}>
                                    <div className="text-white font-semibold mb-4">Recent signals</div>
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
                                </div>
                                <div className={CARD_CLASS}>
                                    <div className="text-white font-semibold mb-4">Top tickers</div>
                                    <SimpleTable
                                        columns={[
                                            { key: 'stock_id', label: 'Ticker' },
                                            { key: 'signal_count', label: 'Signals' },
                                            { key: 'avg_prob', label: 'Avg Prob', render: (value) => formatPercent((value || 0) * 100, 1) },
                                        ]}
                                        rows={data.signals.series.top_tickers}
                                        onTickerClick={onSelectStock}
                                    />
                                </div>
                            </div>
                        </section>

                        <section className={`space-y-4 ${activeSection !== 'trades' ? 'hidden' : ''}`}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                                <KpiCard label="Total Trades" value={formatNumber(data.trades.summary.total_trades || 0, 0)} />
                                <KpiCard label="Open Trades" value={formatNumber(data.trades.summary.open_trades || 0, 0)} tone="text-blue-400" />
                                <KpiCard label="Closed Trades" value={formatNumber(data.trades.summary.closed_trades || 0, 0)} />
                                <KpiCard label="Profit Factor" value={formatNumber(data.trades.summary.profit_factor || 0, 2)} tone="text-green-400" />
                                <KpiCard label="Best / Worst" value={`${formatPercent(data.trades.summary.best_trade || 0)} / ${formatPercent(data.trades.summary.worst_trade || 0)}`} />
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className={CARD_CLASS}>
                                    <div className="text-white font-semibold mb-4">Equity curve</div>
                                    <div className="w-full min-w-0 overflow-hidden">
                                        <Plot data={[{ x: data.trades.series.equity_curve.map((item) => item.date), y: data.trades.series.equity_curve.map((item) => item.cumulative_return_pct), type: 'scatter', mode: 'lines', line: { color: '#22c55e' } }]} layout={basePlotLayout()} config={{ displayModeBar: false, responsive: true }} style={plotStyle} useResizeHandler />
                                    </div>
                                </div>
                                <div className={CARD_CLASS}>
                                    <div className="text-white font-semibold mb-4">Outcome breakdown</div>
                                    <div className="w-full min-w-0 overflow-hidden">
                                        <Plot data={[{ x: data.trades.series.outcome_breakdown.map((item) => item.status), y: data.trades.series.outcome_breakdown.map((item) => item.trade_count), type: 'bar', marker: { color: ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6'] } }]} layout={basePlotLayout()} config={{ displayModeBar: false, responsive: true }} style={plotStyle} useResizeHandler />
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className={CARD_CLASS}>
                                    <div className="text-white font-semibold mb-4">Ticker leaderboard</div>
                                    <SimpleTable columns={[{ key: 'stock_id', label: 'Ticker' }, { key: 'sector', label: 'Sector' }, { key: 'trades', label: 'Trades' }, { key: 'avg_return', label: 'Avg Return', render: (value) => formatPercent(value, 1) }]} rows={data.trades.tables.ticker_leaderboard} onTickerClick={onSelectStock} />
                                </div>
                                <div className={CARD_CLASS}>
                                    <div className="text-white font-semibold mb-4">Open trades</div>
                                    <SimpleTable columns={[{ key: 'stock_id', label: 'Ticker' }, { key: 'sector', label: 'Sector' }, { key: 'age_days', label: 'Age' }, { key: 'prob', label: 'Prob', render: (value) => formatPercent((value || 0) * 100, 1) }]} rows={data.trades.tables.open_trades} onTickerClick={onSelectStock} />
                                </div>
                            </div>
                        </section>

                        <section className={`space-y-4 ${activeSection !== 'market' ? 'hidden' : ''}`}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-4">
                                <KpiCard 
                                    label="Market Regime" 
                                    value={
                                        (data.overview.summary.win_rate || 0) >= 55 ? 'Risk-On' : 
                                        (data.overview.summary.win_rate || 0) <= 45 ? 'Risk-Off' : 'Neutral'
                                    } 
                                    tone={(data.overview.summary.win_rate || 0) >= 55 ? 'text-green-400' : (data.overview.summary.win_rate || 0) <= 45 ? 'text-red-400' : 'text-yellow-400'} 
                                />
                                <KpiCard label="Advancers" value={formatNumber(data.market.summary.breadth?.advancers || 0, 0)} tone="text-green-400" />
                                <KpiCard label="Decliners" value={formatNumber(data.market.summary.breadth?.decliners || 0, 0)} tone="text-red-400" />
                                <KpiCard label="Above MA5" value={formatPercent(data.market.summary.breadth?.above_ma5_pct || 0)} />
                                <KpiCard label="Above MA20" value={formatPercent(data.market.summary.breadth?.above_ma20_pct || 0)} />
                                <KpiCard label="New 20D Highs" value={formatNumber(data.market.summary.breadth?.new_20d_highs || 0, 0)} />
                                <KpiCard label="New 20D Lows" value={formatNumber(data.market.summary.breadth?.new_20d_lows || 0, 0)} />
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className={CARD_CLASS}>
                                    <div className="text-white font-semibold mb-4">Sector performance</div>
                                    <div className="w-full min-w-0 overflow-hidden">
                                        <Plot data={[{ x: data.market.series.sector_performance.map((item) => item.sector), y: data.market.series.sector_performance.map((item) => item.avg_return), type: 'bar', marker: { color: data.market.series.sector_performance.map((item) => (item.avg_return || 0) >= 0 ? '#22c55e' : '#ef4444') } }]} layout={basePlotLayout()} config={{ displayModeBar: false, responsive: true }} style={{ width: '100%', height: isMobile ? 240 : 260 }} useResizeHandler />
                                    </div>
                                </div>
                                <div className={CARD_CLASS}>
                                    <div className="text-white font-semibold mb-4">VNINDEX diagnostics</div>
                                    <div className="w-full min-w-0 overflow-hidden">
                                        <Plot data={[{ x: data.market.series.vnindex.map((item) => item.trade_date), y: data.market.series.vnindex.map((item) => item.close), type: 'scatter', mode: 'lines', line: { color: '#f59e0b' }, name: 'Close' }, { x: data.market.series.vnindex.map((item) => item.trade_date), y: data.market.series.vnindex.map((item) => item.drawdown_pct), type: 'scatter', mode: 'lines', yaxis: 'y2', line: { color: '#ef4444' }, name: 'Drawdown %' }]} layout={basePlotLayout({ margin: { l: isMobile ? 22 : 30, r: isMobile ? 26 : 40, t: 10, b: isMobile ? 78 : 55 }, yaxis2: { overlaying: 'y', side: 'right', automargin: true, tickfont: { size: isMobile ? 9 : 11 } } })} config={{ displayModeBar: false, responsive: true }} style={{ width: '100%', height: isMobile ? 240 : 260 }} useResizeHandler />
                                    </div>
                                </div>
                            </div>
                            <div className={CARD_CLASS}>
                                <div className="text-white font-semibold mb-4">Liquidity leaders</div>
                                <SimpleTable columns={[{ key: 'stock_id', label: 'Ticker' }, { key: 'sector', label: 'Sector' }, { key: 'close', label: 'Close', render: (value) => formatNumber(value, 2) }, { key: 'traded_value', label: 'Traded Value', render: (value) => formatNumber(value, 0) }, { key: 'daily_return', label: 'Return', render: (value) => formatPercent((value || 0) * 100, 1) }]} rows={data.market.series.liquidity_leaders} onTickerClick={onSelectStock} />
                            </div>
                        </section>

                        <section className={`space-y-4 ${activeSection !== 'health' ? 'hidden' : ''}`}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                                <KpiCard label="Latest Coverage" value={formatPercent(data.health.summary.coverage_pct || 0)} tone="text-blue-400" />
                                <KpiCard label="Tracked Tickers" value={formatNumber(data.health.summary.total_tickers || 0, 0)} />
                                <KpiCard label="Latest-Day Tickers" value={formatNumber(data.health.summary.tickers_present_latest_day || 0, 0)} />
                                <KpiCard label="Unmapped Tickers" value={formatNumber(data.health.summary.unmapped_ticker_count || 0, 0)} tone="text-yellow-400" />
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className={CARD_CLASS}>
                                    <div className="flex items-center gap-2 text-white font-semibold mb-4"><Database size={16} className="text-blue-400" /> Freshness matrix</div>
                                    <SimpleTable columns={[{ key: 'table', label: 'Table' }, { key: 'latest_value', label: 'Latest Value' }, { key: 'lag_days', label: 'Lag Days' }, { key: 'status', label: 'Status', render: (value) => <span className={value === 'healthy' ? 'text-green-400' : value === 'warning' ? 'text-yellow-400' : 'text-red-400'}>{value}</span> }]} rows={data.health.freshness} />
                                </div>
                                <div className={CARD_CLASS}>
                                    <div className="flex items-center gap-2 text-white font-semibold mb-4"><Filter size={16} className="text-blue-400" /> Coverage and anomalies</div>
                                    <div className="space-y-3">
                                        {(data.health.anomalies.length ? data.health.anomalies : [{ level: 'healthy', message: 'No material coverage anomalies detected.' }]).map((item, index) => (
                                            <div key={`${item.message}-${index}`} className="p-3 rounded-xl bg-[#15191f] border border-[#222833] text-sm text-gray-300">{item.message}</div>
                                        ))}
                                        {data.health.coverage.unmapped_tickers?.length > 0 && (
                                            <div className="p-3 rounded-xl bg-[#15191f] border border-[#222833] text-sm text-gray-300">
                                                Unmapped tickers: {data.health.coverage.unmapped_tickers.join(', ')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
};

export default DataAnalystTab;

