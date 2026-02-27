import React, { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import { getMarketStatus } from '../services/stock_api';

const Dashboard = ({ onSelectStock }) => {
    const [marketStocks, setMarketStocks] = useState([]);
    const [loading, setLoading] = useState(true);

    const [indices, setIndices] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await getMarketStatus();
                // Map API data to component format
                const formatted = data.map(item => ({
                    code: item.ticker,
                    volume: item.size,
                    change_pct: item.value,
                    close: 0,
                    open: 0
                }));

                setMarketStocks(formatted);

                // Calculate Indices from "Data We Have"
                if (formatted.length > 0) {
                    // 1. Market Average
                    const avgChange = formatted.reduce((sum, s) => sum + s.change_pct, 0) / formatted.length;

                    // 2. Top 30 by Volume (Proxy for VN30)
                    const top30 = [...formatted].sort((a, b) => b.volume - a.volume).slice(0, 30);
                    const avg30 = top30.reduce((sum, s) => sum + s.change_pct, 0) / top30.length;

                    // 3. Gainers vs Losers
                    const gainers = formatted.filter(s => s.change_pct > 0).length;
                    const losers = formatted.filter(s => s.change_pct < 0).length;

                    setIndices([
                        { name: 'AVG MARKET', val: `${formatted.length} Stocks`, chg: `${avgChange > 0 ? '+' : ''}${avgChange.toFixed(2)}%` },
                        { name: 'TOP 30 VOL', val: 'Proxy VN30', chg: `${avg30 > 0 ? '+' : ''}${avg30.toFixed(2)}%` },
                        { name: 'GAINERS', val: gainers.toString(), chg: 'Stocks' },
                        { name: 'LOSERS', val: losers.toString(), chg: 'Stocks' },
                    ]);
                }

            } catch (err) {
                console.error("Failed to load heatmap:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, []);

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

    // Helper to get sector for a stock
    const getSector = (code) => {
        for (const [sector, stocks] of Object.entries(SECTORS)) {
            if (stocks.includes(code)) return sector;
        }
        return "Khác"; // Others
    };

    // Prepare Treemap Data
    const treemapData = () => {
        if (!marketStocks.length) return null;

        const labels = [];
        const parents = [];
        const values = [];
        const exactColors = [];
        const text = [];

        // 1. Add Sector Nodes
        const presentSectors = new Set(marketStocks.map(s => getSector(s.code)));
        presentSectors.forEach(sector => {
            labels.push(sector);
            parents.push(""); // No root node, sectors are top-level
            values.push(0); // Plotly derives sector value from leaves

            exactColors.push('#111213'); // Pitch black header & border background for Sectors
            text.push(`<b>${sector}</b>`);
        });

        // 2. Add Stock Nodes (Leaves)
        marketStocks.forEach(s => {
            labels.push(s.code);
            parents.push(getSector(s.code));
            values.push(s.volume || 1);

            const pct = s.change_pct || 0;
            let color = '';
            // Discrete colors based on HoSE standard thresholds (+/- 7%)
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
            labels: labels,
            parents: parents,
            values: values,
            text: text,
            textinfo: "label+text",
            hoverinfo: "text",
            pathbar: { visible: false }, // Hide the top breadcrumb bar
            tiling: { pad: 3 }, // Show 3px of the parent's black background as a border
            marker: {
                colors: exactColors,
                line: { width: 1.5, color: '#1a1c1e' } // Dark border between individual boxes
            },
        }];
    };


    return (
        <div className="h-full w-full flex flex-col bg-[#111213] overflow-hidden p-2 gap-2">

            {/* Top Row: Indices */}
            <div className="flex w-full gap-2 shrink-0">
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
            <div className="flex-1 bg-[#1a1c1e] rounded-lg border border-[#2a2e39] overflow-hidden relative shadow-lg">
                {!loading && marketStocks.length > 0 ? (
                    <Plot
                        data={treemapData()}
                        layout={{
                            autosize: true,
                            margin: { l: 0, r: 0, b: 0, t: 0 },
                            paper_bgcolor: '#111213',
                            font: { color: '#ffffff', family: 'sans-serif', size: 13 }
                        }}
                        style={{ width: '100%', height: '100%' }}
                        useResizeHandler={true}
                        onClick={(data) => {
                            if (!data.points || data.points.length === 0) return;
                            const code = data.points[0].label;
                            // Only trigger selection if the clicked item is a stock (not a sector)
                            if (code && !SECTORS[code]) {
                                onSelectStock(code);
                            }
                        }}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                        {loading ? "Loading Market Data..." : "No Data Available"}
                    </div>
                )}
            </div>

        </div>
    );
};

export default Dashboard;
