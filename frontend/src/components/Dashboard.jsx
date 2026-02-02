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

    // Prepare Treemap Data
    const treemapData = () => {
        if (!marketStocks.length) return null;

        const labels = marketStocks.map(s => s.code);
        const parents = marketStocks.map(() => 'VN Market');
        const values = marketStocks.map(s => s.volume); // Size by Volume
        const changes = marketStocks.map(s => s.change_pct || 0);

        const text = marketStocks.map((s, i) => {
            return `${s.code}<br>${changes[i].toFixed(2)}%`;
        });

        return [{
            type: "treemap",
            labels: labels,
            parents: parents,
            values: values,
            text: text,
            textinfo: "label+text",
            hoverinfo: "text",
            marker: {
                colors: changes,
                colorscale: [
                    [0, '#d50000'],
                    [0.49, '#ef5350'],
                    [0.5, '#424242'],
                    [0.51, '#26a69a'],
                    [1, '#00c853']
                ],
                cmin: -5,
                cmax: 5,
                line: { width: 1, color: '#1a1c1e' }
            },
        }];
    };

    return (
        <div className="h-full w-full flex bg-[#111213] overflow-hidden">

            {/* Left Col: Indices */}
            <div className="w-[20%] min-w-[220px] bg-[#1a1c1e] border-r border-[#2a2e39] flex flex-col">
                <div className="p-3 border-b border-[#2a2e39] font-bold text-gray-300 text-sm">Key Indices</div>
                <div className="overflow-y-auto flex-1">
                    {indices.map(idx => (
                        <div key={idx.name} className="p-3 border-b border-[#2a2e39] hover:bg-[#25282c] cursor-pointer">
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-bold text-sm text-gray-300">{idx.name}</span>
                                <span className={`text-xs ${idx.chg.includes('+') ? 'text-green-500' : 'text-red-500'}`}>{idx.chg}</span>
                            </div>
                            <div className="text-lg font-mono text-gray-200">{idx.val}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Center: Heatmap */}
            <div className="flex-1 flex flex-col p-4 w-full">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                        <span className="w-1.5 h-5 bg-blue-600 rounded-sm"></span>
                        Market Heatmap
                    </h2>
                    <div className="flex gap-2">
                        <button className="text-xs bg-[#2a2e39] px-2 py-1 rounded text-white">All</button>
                        <button className="text-xs text-gray-400 hover:text-white px-2 py-1">VN30</button>
                        <button className="text-xs text-gray-400 hover:text-white px-2 py-1">HOSE</button>
                    </div>
                </div>

                <div className="flex-1 bg-[#1a1c1e] rounded-xl border border-[#2a2e39] overflow-hidden relative shadow-lg h-full">
                    {!loading && marketStocks.length > 0 ? (
                        <Plot
                            data={treemapData()}
                            layout={{
                                autosize: true,
                                margin: { l: 0, r: 0, b: 0, t: 0 },
                                paper_bgcolor: '#1a1c1e',
                                font: { color: '#e5e7eb', family: 'sans-serif' }
                            }}
                            style={{ width: '100%', height: '100%' }}
                            useResizeHandler={true}
                            onClick={(data) => {
                                const code = data.points[0].label;
                                if (code && code !== 'VN Market') onSelectStock(code);
                            }}
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                            {loading ? "Loading Market Data..." : "No Data Available"}
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default Dashboard;
