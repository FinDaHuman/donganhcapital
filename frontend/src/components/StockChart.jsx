import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';

const StockChart = ({ history, forecast, showSMA, showRSI, lowerBound, upperBound }) => {

    // Theme Colors
    const COLORS = {
        bg: '#151924',
        grid: '#2a2e39',
        text: '#8791a8',
        up: '#26a69a',
        down: '#ef5350',
        forecast: '#ff9800',
        sma5: '#9c27b0',
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
        line: { color: 'rgba(31,119,180,1)' },
        type: 'candlestick',
        xaxis: 'x',
        yaxis: 'y',
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
        xaxis: 'x',
        yaxis: 'y',
        name: 'Forecast (10 Days)'
    }), [forecast]);

    const traceSMA5 = useMemo(() => {
        if (!showSMA) return null;
        return {
            x: history.map(d => d.Date),
            y: history.map(d => d.SMA_5),
            type: 'scatter',
            mode: 'lines',
            line: { color: COLORS.sma5, width: 1.5 },
            name: 'SMA 5'
        };
    }, [history, showSMA]);

    const traceSMA20 = useMemo(() => {
        if (!showSMA) return null;
        return {
            x: history.map(d => d.Date),
            y: history.map(d => d.SMA_20),
            type: 'scatter',
            mode: 'lines',
            line: { color: COLORS.sma20, width: 1.5 },
            name: 'SMA 20'
        };
    }, [history, showSMA]);

    const traceRSI = useMemo(() => {
        if (!showRSI) return null;
        return {
            x: history.map(d => d.Date),
            y: history.map(d => d.RSI),
            type: 'scatter',
            mode: 'lines',
            line: { color: '#e91e63' },
            name: 'RSI',
            xaxis: 'x',
            yaxis: 'y2'
        };
    }, [history, showRSI]);

    const traceLower = useMemo(() => {
        if (!lowerBound || lowerBound.length === 0) return null;
        return {
            x: forecast.map(d => d.Date),
            y: lowerBound,
            type: 'scatter',
            mode: 'lines',
            line: { width: 0 },
            marker: { color: "444" },
            name: 'Lower Bound',
            showlegend: false
        };
    }, [forecast, lowerBound]);

    const traceUpper = useMemo(() => {
        if (!upperBound || upperBound.length === 0) return null;
        return {
            x: forecast.map(d => d.Date),
            y: upperBound,
            type: 'scatter',
            mode: 'lines',
            line: { width: 0 },
            marker: { color: "444" },
            fill: 'tonexty',
            fillcolor: 'rgba(255, 152, 0, 0.1)',
            name: 'Confidence Range',
            showlegend: true
        };
    }, [forecast, upperBound]);

    const data = [
        traceHistory,
        traceForecast,
        traceSMA5,
        traceSMA20,
        traceRSI,
        traceLower,
        traceUpper
    ].filter(Boolean);

    const layout = {
        dragmode: 'pan',
        autosize: true,
        height: 650,
        margin: { l: 50, r: 50, b: 40, t: 40, pad: 4 },
        paper_bgcolor: COLORS.bg,
        plot_bgcolor: COLORS.bg,
        font: { color: COLORS.text, family: 'sans-serif' },

        xaxis: {
            rangeslider: { visible: false },
            type: 'date',
            gridcolor: COLORS.grid,
            zerolinecolor: COLORS.grid,
        },
        yaxis: {
            autorange: true,
            domain: showRSI ? [0.3, 1] : [0, 1],
            gridcolor: COLORS.grid,
            zerolinecolor: COLORS.grid,
        },
        yaxis2: {
            domain: [0, 0.2],
            autorange: true,
            title: 'RSI',
            showgrid: true,
            gridcolor: COLORS.grid,
            zeroline: false,
            visible: showRSI
        },
        showlegend: true,
        legend: { orientation: 'h', x: 0, y: 1.05 }
    };

    // Config to hide annoying Plotly buttons
    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toggleSpikelines', 'hoverCompareCartesian']
    };

    return (
        <div className="w-full bg-[#151924] shadow-xl rounded-xl border border-[#2a2e39] overflow-hidden p-1">
            <Plot
                data={data}
                layout={layout}
                config={config}
                style={{ width: '100%', height: '100%' }}
                useResizeHandler={true}
            />
        </div>
    );
};

export default StockChart;
