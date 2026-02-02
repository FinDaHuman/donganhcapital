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

    // Combine dates for axis calculations
    const allDates = useMemo(() => {
        const histDates = history.map(d => d.Date);
        const foreDates = forecast.map(d => d.Date);
        return [...histDates, ...foreDates];
    }, [history, forecast]);

    // State to hold current tick logic based on zoom
    // We initialize with the default "Medium Zoom" logic (roughly what 190 days falls into)
    const [tickConfig, setTickConfig] = React.useState({ vals: [], text: [] });

    // Function to generate ticks based on range size
    const generateTicks = (startIndex, endIndex) => {
        if (startIndex < 0) startIndex = 0;
        if (endIndex >= allDates.length) endIndex = allDates.length - 1;

        const count = endIndex - startIndex;
        const vals = [];
        const text = [];

        let lastTracker = "";

        // MODE 1: High Zoom (< 4 Months / Approx 85 Days) -> DD/MM
        if (count <= 85) {
            allDates.forEach((dateStr, i) => {
                if (i < startIndex || i > endIndex) return;

                // Show every 5th day? Or just every specific gap?
                // Request says "Display Day".
                // Let's tick every 5 candles to avoid clutter, or check overlap.
                // Simple version: Every 5th candle.
                if (i % 5 === 0) {
                    vals.push(dateStr);
                    const date = new Date(dateStr);
                    const d = date.getDate().toString().padStart(2, '0');
                    const m = (date.getMonth() + 1).toString().padStart(2, '0');
                    text.push(`${d}/${m}`);
                }
            });
        }
        // MODE 2: Medium Zoom (> 4 Months && <= 20 Months / Approx 420 Days) -> MM/YYYY
        else if (count <= 420) {
            let lastMonth = -1;
            allDates.forEach((dateStr, i) => {
                if (i < startIndex || i > endIndex) return;

                const date = new Date(dateStr);
                const month = date.getMonth() + 1;
                const year = date.getFullYear();

                if (month !== lastMonth) {
                    vals.push(dateStr);
                    text.push(`${month.toString().padStart(2, '0')}/${year}`);
                    lastMonth = month;
                }
            });
        }
        // MODE 3: Low Zoom (> 20 Months) -> YYYY
        else {
            let lastYear = -1;
            allDates.forEach((dateStr, i) => {
                if (i < startIndex || i > endIndex) return;

                const date = new Date(dateStr);
                const year = date.getFullYear();

                if (year !== lastYear) {
                    vals.push(dateStr);
                    text.push(`${year}`);
                    lastYear = year;
                }
            });
        }
        return { vals, text };
    };

    // Calculate Default Zoom Range (Last 190 Candles)
    // And set initial Ticks
    const defaultRange = useMemo(() => {
        if (allDates.length === 0) return [0, 1];
        const end = allDates.length - 1;
        const start = Math.max(0, end - 190);
        return [start, end];
    }, [allDates]);

    // Initialize Ticks on Load
    React.useEffect(() => {
        if (allDates.length > 0) {
            const initialTicks = generateTicks(defaultRange[0], defaultRange[1]);
            setTickConfig(initialTicks);
        }
    }, [allDates, defaultRange]);


    const handleRelayout = (event) => {
        // Plotly emits specific keys for range changes
        // 'xaxis.range[0]' and 'xaxis.range[1]' are indices for Category axis
        if (event['xaxis.range[0]'] !== undefined && event['xaxis.range[1]'] !== undefined) {
            const startIdx = Math.floor(event['xaxis.range[0]']);
            const endIdx = Math.ceil(event['xaxis.range[1]']);
            const newTicks = generateTicks(startIdx, endIdx);

            // Only update if changed (Deep check optional, but array ref mismatch is fine)
            setTickConfig(newTicks);
        }
        // Handle "Autoscale" or double click reset
        else if (event['xaxis.autorange'] === true) {
            const newTicks = generateTicks(0, allDates.length - 1);
            setTickConfig(newTicks);
        }
    };

    const layout = {
        dragmode: 'pan',
        autosize: true,
        height: undefined,
        margin: { l: 50, r: 50, b: 30, t: 10, pad: 0 },
        paper_bgcolor: COLORS.bg,
        plot_bgcolor: COLORS.bg,
        font: { color: COLORS.text, family: 'Inter, sans-serif', size: 11 },
        xaxis: {
            rangeslider: { visible: false },
            type: 'category',
            gridcolor: COLORS.grid,
            tickmode: 'array',
            tickvals: tickConfig.vals,
            ticktext: tickConfig.text,
            range: defaultRange // Sets the default zoom
        },
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
            {/* Left Drawing Toolbar - Removed per user request */}

            {/* Main Chart Area */}
            <div className="flex-1 flex flex-col relative">
                {/* Top Control Bar - Removed per user request */}
                {/* Plot */}

                {/* Plot */}
                <div className="flex-1 relative">
                    <Plot
                        data={data}
                        layout={layout}
                        config={config}
                        style={{ width: '100%', height: '100%' }}
                        useResizeHandler={true}
                        onRelayout={handleRelayout}
                    />
                </div>
            </div>
        </div>
    );
};

export default StockChart;
