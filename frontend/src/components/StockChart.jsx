import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { MousePointer2, Minus, TrendingUp, Square, Type, Ruler, Settings } from 'lucide-react';

const StockChart = ({ history, forecast, showSMA, showRSI, lowerBound, upperBound }) => {

    // Deep Black Theme
    const COLORS = {
        bg: '#111213',
        grid: '#1f1f1f',
        text: '#757575',
        up: '#00c853',
        down: '#d50000',
        forecast: '#ff9800',
        sma5: '#aa00ff',
        sma20: '#2962ff'
    };

    const traceHistory = useMemo(() => ({
        x: history.map(d => d.Date),
        close: history.map(d => d.Close),
        high: history.map(d => d.High),
        low: history.map(d => d.Low),
        open: history.map(d => d.Open),
        decreasing: { line: { color: COLORS.down } },
        increasing: { line: { color: COLORS.up } },
        line: { color: '#000000' },
        type: 'candlestick',
        name: 'History'
    }), [history]);

    const traceForecast = useMemo(() => ({
        x: forecast.map(d => d.Date),
        close: forecast.map(d => d.Close),
        high: forecast.map(d => d.High),
        low: forecast.map(d => d.Low),
        open: forecast.map(d => d.Open),
        decreasing: { line: { color: COLORS.forecast } },
        increasing: { line: { color: COLORS.forecast } },
        line: { color: COLORS.forecast },
        type: 'candlestick',
        name: 'Forecast'
    }), [forecast]);

    const data = [traceHistory, traceForecast];

    const layout = {
        dragmode: 'pan',
        autosize: true,
        height: undefined,
        margin: { l: 50, r: 50, b: 30, t: 10, pad: 0 },
        paper_bgcolor: COLORS.bg,
        plot_bgcolor: COLORS.bg,
        font: { color: COLORS.text, family: 'Inter, sans-serif', size: 11 },
        xaxis: { rangeslider: { visible: false }, type: 'date', gridcolor: COLORS.grid },
        yaxis: { autorange: true, gridcolor: COLORS.grid, showgrid: true, side: 'right' },
        showlegend: false,
    };

    return (
        <div className="flex h-full w-full bg-[#111213]">
            {/* Left Drawing Toolbar */}
            <div className="w-12 border-r border-[#2a2e39] flex flex-col items-center py-4 gap-4 bg-[#111213]">
                <button className="p-2 text-blue-500 hover:bg-[#1a1c1e] rounded"><MousePointer2 size={18} /></button>
                <button className="p-2 text-gray-400 hover:bg-[#1a1c1e] rounded"><Minus size={18} /></button>
                <button className="p-2 text-gray-400 hover:bg-[#1a1c1e] rounded"><TrendingUp size={18} /></button>
                <button className="p-2 text-gray-400 hover:bg-[#1a1c1e] rounded"><Square size={18} /></button>
                <button className="p-2 text-gray-400 hover:bg-[#1a1c1e] rounded"><Type size={18} /></button>
                <button className="p-2 text-gray-400 hover:bg-[#1a1c1e] rounded"><Ruler size={18} /></button>
                <div className="mt-auto">
                    <button className="p-2 text-gray-400 hover:bg-[#1a1c1e] rounded"><Settings size={18} /></button>
                </div>
            </div>

            {/* Main Chart Area */}
            <div className="flex-1 flex flex-col relative">
                {/* Top Control Bar */}
                <div className="h-10 border-b border-[#2a2e39] flex items-center px-4 gap-4 bg-[#111213]">
                    <span className="text-gray-200 font-bold text-sm">VNINDEX</span>
                    <div className="w-px h-4 bg-gray-700"></div>
                    <div className="flex gap-2">
                        <button className="text-xs text-blue-500 font-medium hover:bg-[#1a1c1e] px-2 py-1 rounded">1D</button>
                        <button className="text-xs text-gray-400 hover:bg-[#1a1c1e] px-2 py-1 rounded">1W</button>
                        <button className="text-xs text-gray-400 hover:bg-[#1a1c1e] px-2 py-1 rounded">1M</button>
                    </div>
                    <div className="w-px h-4 bg-gray-700"></div>
                    <button className="flex items-center gap-1 text-xs text-gray-300 hover:bg-[#1a1c1e] px-2 py-1 rounded">
                        <span>Indicators</span>
                    </button>
                </div>

                {/* Plot */}
                <div className="flex-1 relative">
                    <Plot
                        data={data}
                        layout={layout}
                        config={{ responsive: true, displayModeBar: false }}
                        style={{ width: '100%', height: '100%' }}
                        useResizeHandler={true}
                    />
                </div>
            </div>
        </div>
    );
};

export default StockChart;
