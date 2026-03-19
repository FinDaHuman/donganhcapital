import React, { useEffect, useState, useRef } from 'react';
import Plot from 'react-plotly.js';
import { getMarketStatus, getLoadingProgress, getCachedMarketStatus, getSectors } from '../services/stock_api';

const MIN_STOCKS_TO_SHOW = 15;
const MIN_VOL_PCT_SECTOR = 0.015; // 1.5% minimum volume inside a sector to show individually

const Dashboard = ({ onSelectStock }) => {
    const [marketStocks, setMarketStocks] = useState([]);
    const [sectors, setSectors] = useState({});
    const [loading, setLoading] = useState(true);
    const [indices, setIndices] = useState([]);

    // Loading gate state
    const [gateOpen, setGateOpen] = useState(false);
    const [progress, setProgress] = useState({ loaded: 0, total: 0 });
    const gateCheckRef = useRef(null);

    // On mount: immediately show cached data if available, then start loading gate
    useEffect(() => {
        // Fetch static sector mapping from backend config
        const fetchSystemConfig = async () => {
            const fetchedSectors = await getSectors();
            setSectors(fetchedSectors);
        };
        fetchSystemConfig();

        // 1. Try to show cached data instantly (returning user experience)
        const cached = getCachedMarketStatus();
        if (cached && cached.length >= MIN_STOCKS_TO_SHOW) {
            processMarketData(cached);
            setGateOpen(true);
            setLoading(false);
        }

        // 2. Start checking loading progress
        const checkProgress = async () => {
            try {
                const prog = await getLoadingProgress();
                setProgress(prog);

                if (prog.loaded >= MIN_STOCKS_TO_SHOW) {
                    // Gate opens — fetch real data
                    clearInterval(gateCheckRef.current);
                    const data = await getMarketStatus();
                    if (data && Array.isArray(data) && data.length > 0) {
                        processMarketData(data);
                    }
                    setGateOpen(true);
                    setLoading(false);
                }
            } catch (err) {
                console.error("Progress check failed:", err);
            }
        };

        // Poll progress every 5 seconds until gate opens
        checkProgress();
        gateCheckRef.current = setInterval(checkProgress, 5000);

        return () => clearInterval(gateCheckRef.current);
    }, []);

    // After gate opens: refresh market data periodically
    useEffect(() => {
        if (!gateOpen) return;

        const fetchData = async () => {
            try {
                const data = await getMarketStatus();
                if (data && Array.isArray(data) && data.length > 0) {
                    processMarketData(data);
                }
            } catch (err) {
                console.error("Failed to refresh heatmap:", err);
            }
        };
        const interval = setInterval(fetchData, 120000);
        return () => clearInterval(interval);
    }, [gateOpen]);

    const processMarketData = (data) => {
        // Deduplicate data by ticker
        const uniqueDataMap = new Map();
        data.forEach(item => {
            uniqueDataMap.set(item.ticker, item);
        });
        const uniqueData = Array.from(uniqueDataMap.values());

        // Sort by volume DESC and get top ones for the heatmap
        let formatted = uniqueData.map(item => ({
            code: item.ticker,
            volume: item.size,
            change_pct: item.value,
            close: 0,
            open: 0
        })).sort((a, b) => b.volume - a.volume);

        // Calculate whole market stats before filtering for UI
        const avgChange = formatted.reduce((sum, s) => sum + s.change_pct, 0) / (formatted.length || 1);
        const top30 = formatted.slice(0, 30);
        const avg30 = top30.reduce((sum, s) => sum + s.change_pct, 0) / (top30.length || 1);
        const gainers = formatted.filter(s => s.change_pct > 0).length;
        const losers = formatted.filter(s => s.change_pct < 0).length;

        // Apply dashboard filtering logic (top 80-100 by volume to avoid clutter)
        formatted = formatted.slice(0, 100);

        setMarketStocks(formatted);

        if (formatted.length > 0) {
            setIndices([
                { name: 'AVG MARKET', val: `${uniqueData.length} Stocks`, chg: `${avgChange > 0 ? '+' : ''}${avgChange.toFixed(2)}%` },
                { name: 'TOP 30 VOL', val: 'Proxy VN30', chg: `${avg30 > 0 ? '+' : ''}${avg30.toFixed(2)}%` },
                { name: 'GAINERS', val: gainers.toString(), chg: 'Stocks' },
                { name: 'LOSERS', val: losers.toString(), chg: 'Stocks' },
            ]);
        }
    };

    const getSector = (code) => {
        if (!sectors || Object.keys(sectors).length === 0) return "Khác";
        for (const [sector, stocks] of Object.entries(sectors)) {
            if (stocks.includes(code)) return sector;
        }
        return "Khác";
    };

    const calculateColor = (pct) => {
        if (pct <= -6.8) return '#00e5ff'; // Floor
        if (pct < -0.05) return '#ef5350'; // Red
        if (pct <= 0.05) return '#ffb300'; // Yellow
        if (pct < 6.8) return '#00c853';   // Green
        return '#d500f9';                  // Ceiling (Purple)
    };

    const treemapData = () => {
        if (!marketStocks.length) return null;

        const ids = [];
        const labels = [];
        const parents = [];
        const values = [];
        const exactColors = [];
        const text = [];

        const presentSectors = new Set(marketStocks.map(s => getSector(s.code)));

        const sectorVolumes = {};
        marketStocks.forEach(s => {
            const sector = getSector(s.code);
            sectorVolumes[sector] = (sectorVolumes[sector] || 0) + (s.volume || 1);
        });

        const totalVolume = Object.values(sectorVolumes).reduce((a, b) => a + b, 0);

        // Single Root Node
        ids.push("Thị Trường");
        labels.push("Thị Trường");
        parents.push("");
        values.push(totalVolume);
        exactColors.push('#111213');
        text.push("<b>Thị Trường</b>");

        presentSectors.forEach(sector => {
            ids.push(sector);
            labels.push(sector);
            parents.push("Thị Trường");
            values.push(sectorVolumes[sector]);
            exactColors.push('#1a1c1e');
            text.push(`<b>${sector}</b>`);
        });

        presentSectors.forEach(sector => {
            const sectorStocks = marketStocks.filter(s => getSector(s.code) === sector);
            const secVol = sectorVolumes[sector];

            let othersVol = 0;
            let othersCount = 0;
            const visibleStocks = [];

            sectorStocks.forEach(s => {
                const vol = s.volume || 1;
                // Threshold implementation: below X% of sector volume goes to Others
                if (vol / secVol < MIN_VOL_PCT_SECTOR) {
                    othersVol += vol;
                    othersCount++;
                } else {
                    visibleStocks.push(s);
                }
            });

            // Add visible stocks normally
            visibleStocks.forEach(s => {
                ids.push(s.code);
                labels.push(s.code);
                parents.push(sector);
                values.push(s.volume || 1);

                const pct = s.change_pct || 0;
                let color = calculateColor(pct);
                exactColors.push(color);
                const sign = pct > 0 ? '+' : '';
                text.push(`<b>${s.code}</b><br>${sign}${pct.toFixed(2)}%`);
            });

            // Roll up small stocks into an "Others" category per sector
            if (othersCount > 0) {
                const otherId = `Khác (${sector})`;
                ids.push(otherId);
                labels.push(`+${othersCount} MÃ`);
                parents.push(sector);
                values.push(othersVol);
                exactColors.push('#25282c'); // Dark gray color for 'others' group
                text.push(`<b>Các mã tỷ trọng nhỏ (${othersCount} mã)</b>`);
            }
        });

        return [{
            type: "treemap",
            ids: ids,
            labels: labels,
            parents: parents,
            values: values,
            text: text,
            textinfo: "label+text",
            hoverinfo: "text",
            branchvalues: "total",
            pathbar: { visible: false },
            tiling: { pad: 3 },
            marker: {
                colors: exactColors,
                line: { width: 2, color: '#111213' }
            },
        }];
    };

    // --- Loading Gate UI ---
    if (!gateOpen) {
        const pct = progress.total > 0 ? Math.round((progress.loaded / Math.max(progress.total, MIN_STOCKS_TO_SHOW)) * 100) : 0;
        return (
            <div className="flex-1 w-full flex flex-col items-center justify-center bg-[#111213] gap-6 p-8">
                <div className="flex flex-col items-center gap-4 max-w-md w-full">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <h2 className="text-xl font-bold text-white tracking-wide">Loading Market Data</h2>
                    <p className="text-gray-500 text-sm text-center">
                        Fetching live data from VN stock exchange. This takes about a minute on cold start.
                    </p>
                    <div className="w-full bg-[#1a1c1e] rounded-full h-3 border border-[#2a2e39] overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                        ></div>
                    </div>
                    <div className="flex justify-between w-full text-xs text-gray-500">
                        <span>{progress.loaded} / {progress.total || '...'} stocks loaded</span>
                        <span className="text-blue-400 font-mono">{pct}%</span>
                    </div>
                </div>
            </div>
        );
    }

    // --- Normal Dashboard ---
    return (
        <div className="flex-1 w-full flex flex-col bg-[#111213] overflow-hidden p-2 gap-2">
            <div className="flex w-full shrink-0 gap-2">
                {indices.map(idx => (
                    <div key={idx.name} className="flex-1 bg-[#1a1c1e] border border-[#2a2e39] rounded-lg p-3 hover:bg-[#25282c] transition-colors cursor-pointer flex flex-col justify-center">
                        <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-sm text-gray-300">{idx.name}</span>
                            <span className={`text-xs font-bold ${idx.chg.includes('+') ? 'text-green-500' : idx.chg.includes('-') ? 'text-red-500' : 'text-yellow-500'}`}>{idx.chg}</span>
                        </div>
                        <div className="text-xl font-mono text-gray-200">{idx.val}</div>
                    </div>
                ))}
            </div>

            <div className="flex-1 bg-[#1a1c1e] rounded-sm relative shadow-lg min-h-[400px] overflow-hidden">
                <div className="absolute inset-0">
                    {!loading && marketStocks.length > 0 ? (
                        <Plot
                            data={treemapData()}
                            layout={{
                                autosize: true,
                                margin: { l: 0, r: 0, b: 0, t: 0, pad: 0 },
                                paper_bgcolor: '#1a1c1e',
                                font: { color: '#ffffff', family: 'sans-serif', size: 13 },
                                uniformtext: { minsize: 10, mode: 'hide' }
                            }}
                            config={{ displayModeBar: false, responsive: true }}
                            style={{ width: '100%', height: '100%', display: 'block' }}
                            useResizeHandler={true}
                            onClick={(data) => {
                                if (!data || !data.points || data.points.length === 0) return;
                                const point = data.points[0];
                                if (!point || !point.label) return;
                                const code = point.label;
                                // Ignore clicks on sectors or "Others" containers
                                if (!sectors || !sectors[code] && !code.startsWith("+") && !code.startsWith("Khác") && code !== "Thị Trường") {
                                    onSelectStock(code);
                                }
                            }}
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-[#1a1c1e]">
                            {loading ? "Loading Market Data..." : "No Data Available"}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
