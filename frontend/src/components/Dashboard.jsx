import React, { useEffect, useState, useRef } from 'react';
import Plot from 'react-plotly.js';
import { getMarketStatus, getLoadingProgress, getCachedMarketStatus } from '../services/stock_api';

const MIN_STOCKS_TO_SHOW = 15;

const Dashboard = ({ onSelectStock }) => {
    const [marketStocks, setMarketStocks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [indices, setIndices] = useState([]);

    // Loading gate state
    const [gateOpen, setGateOpen] = useState(false);
    const [progress, setProgress] = useState({ loaded: 0, total: 0 });
    const gateCheckRef = useRef(null);

    // On mount: immediately show cached data if available, then start loading gate
    useEffect(() => {
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

        const formatted = uniqueData.map(item => ({
            code: item.ticker,
            volume: item.size,
            change_pct: item.value,
            close: 0,
            open: 0
        }));

        setMarketStocks(formatted);

        if (formatted.length > 0) {
            const avgChange = formatted.reduce((sum, s) => sum + s.change_pct, 0) / formatted.length;
            const top30 = [...formatted].sort((a, b) => b.volume - a.volume).slice(0, 30);
            const avg30 = top30.reduce((sum, s) => sum + s.change_pct, 0) / top30.length;
            const gainers = formatted.filter(s => s.change_pct > 0).length;
            const losers = formatted.filter(s => s.change_pct < 0).length;

            setIndices([
                { name: 'AVG MARKET', val: `${formatted.length} Stocks`, chg: `${avgChange > 0 ? '+' : ''}${avgChange.toFixed(2)}%` },
                { name: 'TOP 30 VOL', val: 'Proxy VN30', chg: `${avg30 > 0 ? '+' : ''}${avg30.toFixed(2)}%` },
                { name: 'GAINERS', val: gainers.toString(), chg: 'Stocks' },
                { name: 'LOSERS', val: losers.toString(), chg: 'Stocks' },
            ]);
        }
    };

    // Sector Mapping
    const SECTORS = {
        "Ngân hàng": ["ABB", "ACB", "BID", "BVB", "CTG", "EIB", "HDB", "LPB", "MBB", "MSB", "OCB", "SHB", "SSB", "STB", "TCB", "TPB", "VCB", "VIB", "VPB"],
        "Bất động sản": ["CEO", "CII", "DIG", "DPG", "DXG", "GEX", "HAG", "HDC", "HDG", "KBC", "KDH", "NVL", "NWT", "PDR", "TCH", "VCG", "VHM", "VIC", "VRE"],
        "Chứng khoán": ["CTS", "FTS", "HCM", "MBS", "ORS", "SHS", "SSI", "VCI", "VIX", "VND"],
        "Dầu khí – Năng lượng": ["BSR", "GAS", "NT2", "OIL", "PLX", "POW", "PVD", "PVS", "PVT"],
        "Tiêu dùng": ["ANV", "DGW", "FRT", "MSN", "PAN", "PNJ", "VHC"],
        "Vật liệu": ["CTD", "HPG", "HSG", "NKG", "REE"],
        "Logistics": ["GMD", "HAH", "HVN", "VJC", "VTP"],
        "Công nghệ": ["CTR", "FPT", "VGI"]
    };

    const getSector = (code) => {
        for (const [sector, stocks] of Object.entries(SECTORS)) {
            if (stocks.includes(code)) return sector;
        }
        return "Khác";
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

        marketStocks.forEach(s => {
            ids.push(s.code);
            labels.push(s.code);
            parents.push(getSector(s.code));
            values.push(s.volume || 1);

            const pct = s.change_pct || 0;
            let color = '';
            if (pct <= -6.8) color = '#00e5ff';
            else if (pct < -0.05) color = '#ef5350';
            else if (pct <= 0.05) color = '#ffb300';
            else if (pct < 6.8) color = '#00c853';
            else color = '#d500f9';

            exactColors.push(color);
            const sign = pct > 0 ? '+' : '';
            text.push(`<b>${s.code}</b><br>${sign}${pct.toFixed(2)}%`);
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
                    {/* Spinner */}
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>

                    {/* Title */}
                    <h2 className="text-xl font-bold text-white tracking-wide">Loading Market Data</h2>
                    <p className="text-gray-500 text-sm text-center">
                        Fetching live data from VN stock exchange. This takes about a minute on cold start.
                    </p>

                    {/* Progress Bar */}
                    <div className="w-full bg-[#1a1c1e] rounded-full h-3 border border-[#2a2e39] overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                        ></div>
                    </div>

                    {/* Count */}
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

            {/* Top Row: Indices */}
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

            {/* Bottom Row: Heatmap */}
            <div className="flex-1 bg-[#1a1c1e] rounded-sm relative shadow-lg min-h-[400px] overflow-hidden">
                <div className="absolute inset-0">
                    {!loading && marketStocks.length > 0 ? (
                        <Plot
                            data={treemapData()}
                            layout={{
                                autosize: true,
                                margin: { l: 0, r: 0, b: 0, t: 0, pad: 0 },
                                paper_bgcolor: '#1a1c1e',
                                font: { color: '#ffffff', family: 'sans-serif', size: 13 }
                            }}
                            config={{ displayModeBar: false, responsive: true }}
                            style={{ width: '100%', height: '100%', display: 'block' }}
                            useResizeHandler={true}
                            onClick={(data) => {
                                if (!data || !data.points || data.points.length === 0) return;
                                const point = data.points[0];
                                if (!point || !point.label) return;
                                const code = point.label;
                                if (code && !SECTORS[code]) {
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

        </div >
    );
};

export default Dashboard;
