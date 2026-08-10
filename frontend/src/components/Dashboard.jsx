import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getMarketStatus, getLoadingProgress, getCachedMarketStatus, getSectors, getVnindex } from '../services/stock_api';
import { suppressWakeToast } from '../services/serverWake';
import { SkeletonDashboard } from './SkeletonLoader';
import Treemap from './dashboard/Treemap';
import { formatChange, changeColor, PANEL_LABEL_STYLE, MONO } from './dashboard/utils';

const MIN_STOCKS_TO_SHOW = 15;

// Cold start, measured: ~2 minutes. The backend sleeps after 15 minutes idle,
// and a wake runs container boot → heavy ML imports on 0.1 vCPU → model load →
// seven startup migrations before uvicorn serves anything (backend/main.py
// lifespan). Nothing here makes that faster; these constants only make the wait
// honest instead of looking like a broken page.
const WAKE_TIMEOUT = 150000;      // > the measured 2 min, so one request spans the whole boot
const COLD_START_HINT_MS = 8000;  // past this, say plainly that the server is waking
const EXPECTED_WAKE_MS = 120000;  // drives the estimated bar until real counts arrive

const Dashboard = ({ onSelectStock }) => {
    const [allStocks, setAllStocks] = useState([]);
    const [sectors, setSectors] = useState({});
    const [indices, setIndices] = useState([]);

    // Loading gate state
    const [gateOpen, setGateOpen] = useState(false);
    const [progress, setProgress] = useState({ loaded: 0, total: 0 });
    const [elapsed, setElapsed] = useState(0); // ms waiting, for the cold-start copy
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

        // 2. Loading gate: wait for the API until enough stocks are warm.
        // Self-scheduling timeout instead of setInterval so a slow request can
        // never stack overlapping polls.
        //
        // Each attempt gets WAKE_TIMEOUT, not the client's 15s default: on a
        // cold start Render holds the request open through the boot and answers
        // it as soon as uvicorn is up, so one long request resolves at the
        // earliest possible instant. The old 15s timeout was shorter than the
        // wake it was waiting for, and its backoff then doubled to 60s — so a
        // first-time visitor could sit through several aborted attempts and end
        // up waiting *longer* than the server actually took to boot. Retries
        // are now a fallback for real network failures, so the delay stays
        // short and the cap is 8s rather than 60s.
        let cancelled = false;
        let pollDelay = 3000;
        const checkProgress = async () => {
            try {
                const prog = await getLoadingProgress({ timeout: WAKE_TIMEOUT });
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
                pollDelay = 3000;
            } catch (err) {
                console.error("Progress check failed:", err);
                pollDelay = Math.min(pollDelay * 2, 8000);
            }
            if (!cancelled) gateCheckRef.current = setTimeout(checkProgress, pollDelay);
        };

        checkProgress();

        return () => {
            cancelled = true;
            clearTimeout(gateCheckRef.current);
        };
    }, [processMarketData]);

    // While this gate is up it already says everything the global cold-start
    // toast says, with a progress bar on top — so claim the job and let the
    // toast stand down rather than printing the same sentence twice.
    // Only reachable when signed in; a signed-out visitor never renders this
    // component, and for them the toast stays the only explanation.
    useEffect(() => {
        if (gateOpen) return;
        return suppressWakeToast();
    }, [gateOpen]);

    // Elapsed-time ticker behind the loading gate. Kept in its own effect so it
    // can never restart the poll above, and stopped as soon as the gate opens.
    // A visibly counting number is what tells a first-time visitor the page is
    // alive while the server boots — a bar that only moves on real data sits
    // frozen for the entire cold start and reads as a hang.
    useEffect(() => {
        if (gateOpen) return;
        const started = Date.now();
        const ticker = setInterval(() => setElapsed(Date.now() - started), 1000);
        return () => clearInterval(ticker);
    }, [gateOpen]);

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
        const hasRealCounts = progress.total > 0;
        // No real counts exist until the first response lands, which on a cold
        // start is the whole two-minute wait. Until then the bar advances on
        // elapsed time against the measured boot, capped at 90% — an estimate
        // must never show 100% for work that has not finished.
        const pct = hasRealCounts
            ? Math.round((progress.loaded / Math.max(progress.total, MIN_STOCKS_TO_SHOW)) * 100)
            : Math.min(Math.round((elapsed / EXPECTED_WAKE_MS) * 90), 90);
        const isColdStart = !hasRealCounts && elapsed >= COLD_START_HINT_MS;
        const seconds = Math.floor(elapsed / 1000);
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
                                {isColdStart ? 'Waking the Server' : 'Loading Market Data'}
                            </h2>
                            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                {isColdStart ? (
                                    <>
                                        This deployment runs on free-tier hosting that sleeps when idle.{' '}
                                        <br className="hidden sm:block" />
                                        The first visit has to start it again, which takes up to two minutes.
                                    </>
                                ) : (
                                    <>
                                        Fetching live data from VN stock exchange.{' '}
                                        <br className="hidden sm:block" />
                                        This takes a moment on first load.
                                    </>
                                )}
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
                                    {hasRealCounts
                                        ? `${progress.loaded} / ${progress.total} stocks`
                                        : `${seconds}s elapsed`}
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
