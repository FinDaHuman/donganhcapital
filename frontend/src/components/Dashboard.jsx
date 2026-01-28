import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Plot from 'react-plotly.js';
import { TrendingUp, TrendingDown, Clock, ChevronRight } from 'lucide-react';

const Dashboard = ({ onSelectStock }) => {
    const [marketStocks, setMarketStocks] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fake lists for Left/Right columns
    const indices = [
        { name: 'VNINDEX', val: '1,245.50', chg: '+12.4' },
        { name: 'VN30', val: '1,260.10', chg: '+15.2' },
        { name: 'HNX', val: '235.40', chg: '-1.2' },
        { name: 'UPCOM', val: '92.10', chg: '+0.5' },
        { name: 'DOW JONES', val: '33,200', chg: '+150' },
        { name: 'GOLD', val: '2,045', chg: '+12' },
    ];

    useEffect(() => {
        // Use static data directly to avoid API CORS/Rate-limit issues on Vercel
        // This ensures the Heatmap loads INSTANTLY.
        const demoData = [
            { code: 'VCB', close: 85.0, open: 84.0, volume: 1500000 },
            { code: 'VHM', close: 40.5, open: 41.2, volume: 1200000 },
            { code: 'VIC', close: 42.0, open: 41.5, volume: 900000 },
            { code: 'HPG', close: 28.5, open: 28.0, volume: 5000000 },
            { code: 'FPT', close: 102.0, open: 100.0, volume: 800000 },
            { code: 'MSN', close: 65.0, open: 66.0, volume: 600000 },
            { code: 'TCB', close: 32.0, open: 31.5, volume: 2000000 },
            { code: 'VPB', close: 19.5, open: 19.2, volume: 3000000 },
            { code: 'STB', close: 29.0, open: 28.5, volume: 4000000 },
            { code: 'MWG', close: 45.0, open: 44.0, volume: 1000000 },
            { code: 'ACB', close: 25.0, open: 24.8, volume: 1500000 },
            { code: 'MBB', close: 20.0, open: 19.8, volume: 2200000 },
            { code: 'NVL', close: 16.5, open: 16.8, volume: 3500000 },
            { code: 'PDR', close: 26.0, open: 25.5, volume: 1800000 },
            { code: 'POW', close: 11.0, open: 11.0, volume: 1200000 },
            { code: 'GVR', close: 22.0, open: 21.5, volume: 800000 },
            { code: 'PLX', close: 36.0, open: 36.5, volume: 600000 },
            { code: 'GAS', close: 78.0, open: 77.5, volume: 400000 },
            { code: 'SAB', close: 58.0, open: 58.5, volume: 200000 },
            { code: 'VRE', close: 24.0, open: 23.5, volume: 1100000 },
        ];
        // Simulate a tiny delay for realism, or set instantly
        setMarketStocks(demoData);
        setLoading(false);
    }, []);

    // Prepare Treemap Data
    const treemapData = () => {
        if (!marketStocks.length) return null;

        const labels = marketStocks.map(s => s.code);
        const parents = marketStocks.map(() => 'VN Market');
        const values = marketStocks.map(s => s.volume); // Size by Volume
        const changes = marketStocks.map(s => {
            const chg = (s.close - s.open) / s.open;
            return chg * 100;
        });

        const text = marketStocks.map((s, i) => {
            return `${s.code}<br>${changes[i].toFixed(2)}%<br>${s.close}`;
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
