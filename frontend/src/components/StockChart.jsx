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

    const traceConfidence = useMemo(() => ({
        x: [...forecast.map(d => d.Date), ...forecast.map(d => d.Date).reverse()],
        y: [...forecast.map(d => d.upper_bound), ...forecast.map(d => d.lower_bound).reverse()],
        fill: 'toself',
        fillcolor: 'rgba(255, 152, 0, 0.2)',
        line: { color: 'transparent' },
        name: 'Confidence (90%)',
        showlegend: false,
        hoverinfo: 'skip'
    }), [forecast]);

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

    const data = [traceHistory, traceConfidence, traceForecast];

    const [timeframe, setTimeframe] = React.useState('1D');
    const [activeTool, setActiveTool] = React.useState('cursor');

    const layout = {
        dragmode: 'pan', // Allow panning
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

    // Enable Scroll Zoom
    const config = {
        responsive: true,
        displayModeBar: false,
        scrollZoom: true,
    };

    return (
        <div className="flex h-full w-full bg-[#111213]">
            {/* Left Drawing Toolbar */}
            <div className="w-12 border-r border-[#2a2e39] flex flex-col items-center py-4 gap-4 bg-[#111213]">
                <button onClick={() => setActiveTool('cursor')} className={`p-2 rounded ${activeTool === 'cursor' ? 'text-blue-500 bg-[#1a1c1e]' : 'text-gray-400 hover:bg-[#1a1c1e]'}`}><MousePointer2 size={18} /></button>
                <button onClick={() => setActiveTool('line')} className={`p-2 rounded ${activeTool === 'line' ? 'text-blue-500 bg-[#1a1c1e]' : 'text-gray-400 hover:bg-[#1a1c1e]'}`}><Minus size={18} /></button>
                <button onClick={() => setActiveTool('trend')} className={`p-2 rounded ${activeTool === 'trend' ? 'text-blue-500 bg-[#1a1c1e]' : 'text-gray-400 hover:bg-[#1a1c1e]'}`}><TrendingUp size={18} /></button>
                <button onClick={() => setActiveTool('shape')} className={`p-2 rounded ${activeTool === 'shape' ? 'text-blue-500 bg-[#1a1c1e]' : 'text-gray-400 hover:bg-[#1a1c1e]'}`}><Square size={18} /></button>
                <button onClick={() => setActiveTool('text')} className={`p-2 rounded ${activeTool === 'text' ? 'text-blue-500 bg-[#1a1c1e]' : 'text-gray-400 hover:bg-[#1a1c1e]'}`}><Type size={18} /></button>
                <button onClick={() => setActiveTool('ruler')} className={`p-2 rounded ${activeTool === 'ruler' ? 'text-blue-500 bg-[#1a1c1e]' : 'text-gray-400 hover:bg-[#1a1c1e]'}`}><Ruler size={18} /></button>
            </div>

            {/* Main Chart Area */}
            <div className="flex-1 flex flex-col relative">
                {/* Top Control Bar */}
                <div className="h-10 border-b border-[#2a2e39] flex items-center px-4 gap-4 bg-[#111213]">
                    <span className="text-gray-200 font-bold text-sm">VNINDEX</span>
                    <div className="w-px h-4 bg-gray-700"></div>
                    <div className="flex gap-2">
                        {['1D', '1W', '1M', '3M', '1Y'].map(tf => (
                            <button
                                key={tf}
                                onClick={() => setTimeframe(tf)}
                                className={`text-xs font-medium px-2 py-1 rounded transition-colors ${timeframe === tf ? 'text-blue-500 bg-[#1a1c1e]' : 'text-gray-400 hover:bg-[#1a1c1e] hover:text-white'}`}
                            >
                                {tf}
                            </button>
                        ))}
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
                        config={config}
                        style={{ width: '100%', height: '100%' }}
                        useResizeHandler={true}
                    />
                </div>
            </div>
        </div>
    );
};

export default StockChart;
