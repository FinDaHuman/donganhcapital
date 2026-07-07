import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getMarketStatus, getLoadingProgress, getCachedMarketStatus, getSectors, getVnindex } from '../services/stock_api';
import { SkeletonDashboard } from './SkeletonLoader';
import Treemap from './dashboard/Treemap';
import { formatChange, changeColor, PANEL_LABEL_STYLE, MONO } from './dashboard/utils';

const MIN_STOCKS_TO_SHOW = 15;

const Dashboard = ({ onSelectStock }) => {
    const [allStocks, setAllStocks] = useState([]);
    const [sectors, setSectors] = useState({});
    const [indices, setIndices] = useState([]);

    // Loading gate state
    const [gateOpen, setGateOpen] = useState(false);
    const [progress, setProgress] = useState({ loaded: 0, total: 0 });
    const gateCheckRef = useRef(null);

    const processMarketData = useCallback((data, vnindex) => {
        // Deduplicate by ticker
        const uniqueDataMap = new Map();
        data.forEach(item => uniqueDataMap.set(item.ticker, item));
        const uniqueData = Array.from(uniqueDataMap.values());

        const formatted = uniqueData.map(item => ({
            code: item.ticker,
            volume: item.size,
            change_pct: item.value,
            close: item.price || 0,
            trading_value: item.trading_value || 0,
        })).sort((a, b) => b.volume - a.volume);

        setAllStocks(formatted);

        // Whole-market stats
        const avgChange = formatted.reduce((sum, s) => sum + s.change_pct, 0) / (formatted.length || 1);
        const top30 = formatted.slice(0, 30);
        const avg30 = top30.reduce((sum, s) => sum + s.change_pct, 0) / (top30.length || 1);
        const gainers = formatted.filter(s => s.change_pct > 0).length;
        const losers = formatted.filter(s => s.change_pct < 0).length;

        // VNINDEX card from the daily series
        let vnCard = { name: 'VNINDEX', val: '—', chg: '', chgColor: 'var(--market-neutral)' };
        if (vnindex && vnindex.length >= 2) {
            const closes = vnindex
                .map(d => Number(d.Close ?? d.close))
                .filter(v => !isNaN(v));
            if (closes.length >= 2) {
                const last = closes[closes.length - 1];
                const prev = closes[closes.length - 2];
                const pct = prev ? ((last - prev) / prev) * 100 : 0;
                vnCard = { name: 'VNINDEX', val: last.toFixed(2), chg: formatChange(pct), chgColor: changeColor(pct) };
            }
        }

        setIndices([
            vnCard,
            {
                name: 'AVG MARKET',
                val: `${formatted.length} Stocks`,
                chg: formatChange(avgChange),
                chgColor: changeColor(avgChange),
            },
            {
                name: 'BREADTH',
                val: `${gainers} ▲ / ${losers} ▼`,
                chg: gainers >= losers ? `+${gainers - losers}` : `${gainers - losers}`,
                chgColor: changeColor(gainers - losers),
            },
            {
                name: 'TOP 30 VOL',
                val: 'Proxy VN30',
                chg: formatChange(avg30),
                chgColor: changeColor(avg30),
            },
        ]);
    }, []);

    // On mount: show cached data instantly if available, then run the loading gate
    useEffect(() => {
        const fetchSystemConfig = async () => {
            const fetchedSectors = await getSectors();
            setSectors(fetchedSectors);
        };
        fetchSystemConfig();

        // VNINDEX daily series feeds the index stat card (2 most recent closes)
        const fetchVnindex = async () => {
            const vn = await getVnindex(5);
            return Array.isArray(vn) ? vn : [];
        };

        // 1. Cached data for instant returning-user experience
        const cached = getCachedMarketStatus();
        if (cached && cached.length >= MIN_STOCKS_TO_SHOW) {
            processMarketData(cached, []);
            setGateOpen(true);
        }

        // 2. Loading gate: poll progress until enough stocks are warm.
        // Self-scheduling timeout instead of setInterval so a slow request
        // can never stack overlapping polls, with exponential backoff while
        // the API is unreachable (cold start, proxy mitigation, bad network).
        let cancelled = false;
        let pollDelay = 5000;
        const checkProgress = async () => {
            try {
                const prog = await getLoadingProgress();
                if (cancelled) return;
                setProgress(prog);

                if (prog.loaded >= MIN_STOCKS_TO_SHOW) {
                    const [data, vn] = await Promise.all([getMarketStatus(), fetchVnindex()]);
                    if (cancelled) return;
                    if (data && Array.isArray(data) && data.length > 0) {
                        processMarketData(data, vn);
                    }
                    setGateOpen(true);
                    return;
                }
                pollDelay = 5000;
            } catch (err) {
                console.error("Progress check failed:", err);
                pollDelay = Math.min(pollDelay * 2, 60000);
            }
            if (!cancelled) gateCheckRef.current = setTimeout(checkProgress, pollDelay);
        };

        checkProgress();

        return () => {
            cancelled = true;
            clearTimeout(gateCheckRef.current);
        };
    }, [processMarketData]);

    // After gate opens: refresh market data periodically
    useEffect(() => {
        if (!gateOpen) return;

        const fetchData = async () => {
            try {
                const [data, vn] = await Promise.all([getMarketStatus(), getVnindex(5)]);
                if (data && Array.isArray(data) && data.length > 0) {
                    processMarketData(data, Array.isArray(vn) ? vn : []);
                }
            } catch (err) {
                console.error("Failed to refresh market data:", err);
            }
        };
        const interval = setInterval(fetchData, 120000);
        return () => clearInterval(interval);
    }, [gateOpen, processMarketData]);

    const getSector = useCallback((code) => {
        if (!sectors || Object.keys(sectors).length === 0) return "Other";
        for (const [sector, stocks] of Object.entries(sectors)) {
            if (stocks.includes(code)) return sector;
        }
        return "Other";
    }, [sectors]);

    // --- Loading Gate UI ---
    if (!gateOpen) {
        const pct = progress.total > 0 ? Math.round((progress.loaded / Math.max(progress.total, MIN_STOCKS_TO_SHOW)) * 100) : 0;
        return (
            <div className="flex-1 w-full relative overflow-hidden" style={{ background: 'var(--bg-void)' }}>
                {/* Background Skeleton */}
                <div className="absolute inset-0 opacity-40 pointer-events-none">
                    <SkeletonDashboard className="h-full" />
                </div>

                {/* Foreground Overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 p-8 z-10 backdrop-blur-sm bg-black/20">
                    <div className="flex flex-col items-center gap-6 max-w-sm w-full">
                        <div className="text-center">
                            <h2
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    fontSize: '18px',
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                    letterSpacing: '0.02em',
                                    marginBottom: '8px',
                                }}
                            >
                                Loading Market Data
                            </h2>
                            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                Fetching live data from VN stock exchange.{' '}
                                <br className="hidden sm:block" />
                                This takes about a minute on cold start.
                            </p>
                        </div>

                        {/* Gold progress bar */}
                        <div className="w-full space-y-2">
                            <div
                                className="w-full rounded-full h-1.5 overflow-hidden"
                                style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(201,169,110,0.1)' }}
                            >
                                <div
                                    className="h-full rounded-full transition-all duration-700 ease-out"
                                    style={{
                                        width: `${Math.min(pct, 100)}%`,
                                        background: 'linear-gradient(90deg, var(--gold-muted), var(--gold-primary), var(--gold-bright))',
                                    }}
                                />
                            </div>
                            <div className="flex justify-between">
                                <span style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--text-muted)' }}>
                                    {progress.loaded} / {progress.total || '...'} stocks
                                </span>
                                <span style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--gold-muted)', fontWeight: 500 }}>
                                    {pct}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- Dashboard: minor stats on top, heatmap fills the rest ---
    return (
        <div className="flex-1 w-full flex flex-col overflow-hidden p-2 gap-2" style={{ background: 'var(--bg-void)' }}>
                {/* Stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 w-full shrink-0 gap-2">
                    {indices.map(idx => (
                        <div
                            key={idx.name}
                            className="rounded-lg p-3 flex flex-col justify-center"
                            style={{
                                background: 'var(--bg-surface)',
                                border: '1px solid rgba(201,169,110,0.1)',
                                transition: 'background-color 200ms ease, border-color 200ms ease',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                                e.currentTarget.style.borderColor = 'rgba(201,169,110,0.2)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                                e.currentTarget.style.borderColor = 'rgba(201,169,110,0.1)';
                            }}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span style={PANEL_LABEL_STYLE}>{idx.name}</span>
                                <span style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 600, color: idx.chgColor }}>
                                    {idx.chg}
                                </span>
                            </div>
                            <div style={{ fontFamily: MONO, fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                {idx.val}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Market heatmap — the main event */}
                {allStocks.length > 0 ? (
                    <Treemap stocks={allStocks} getSector={getSector} onSelectStock={onSelectStock} />
                ) : (
                    <div
                        className="flex-1 rounded-lg flex items-center justify-center min-h-[300px]"
                        style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid rgba(201,169,110,0.1)',
                            fontFamily: "'Outfit', sans-serif",
                            fontSize: '13px',
                            color: 'var(--text-muted)',
                        }}
                    >
                        No market data available
                    </div>
                )}
        </div>
    );
};

export default Dashboard;
