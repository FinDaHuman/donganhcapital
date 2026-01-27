import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';

const StockChart = ({ history, forecast, showSMA, showRSI, lowerBound, upperBound }) => {
    // Combine data for plotting
    // Separate History vs Forecast for visual distinction

    const traceHistory = useMemo(() => ({
        x: history.map(d => d.Date),
        close: history.map(d => d.Close),
        high: history.map(d => d.High),
        low: history.map(d => d.Low),
        open: history.map(d => d.Open),
        decreasing: { line: { color: '#ef5350' } },
        increasing: { line: { color: '#26a69a' } },
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
        decreasing: { line: { color: '#ff9800' } }, // Orange for forecast
        increasing: { line: { color: '#ff9800' } },
        line: { color: '#ff9800' },
        type: 'candlestick',
        xaxis: 'x',
        yaxis: 'y',
        name: 'Forecast (14 Days)'
    }), [forecast]);

    // Technical Indicators
    const traceSMA5 = useMemo(() => {
        if (!showSMA) return null;
        return {
            x: history.map(d => d.Date),
            y: history.map(d => d.SMA_5),
            type: 'scatter',
            mode: 'lines',
            line: { color: '#9c27b0', width: 1 },
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
            line: { color: '#2196f3', width: 1 },
            name: 'SMA 20'
        };
    }, [history, showSMA]);

    // RSI Subplot
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

    // Confidence Bounds
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
            fillcolor: 'rgba(255, 152, 0, 0.2)',
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
        dragmode: 'zoom',
        title: 'Stock Price Prediction & Technical Analysis',
        xaxis: {
            rangeslider: { visible: false },
            type: 'date',
            title: 'Date'
        },
        yaxis: {
            autorange: true,
            domain: showRSI ? [0.3, 1] : [0, 1],
            title: 'Price (VND)',
            type: 'linear'
        },
        yaxis2: {
            domain: [0, 0.2],
            autorange: true,
            title: 'RSI (14)',
            showgrid: true,
            zeroline: false,
            showline: false,
            visible: showRSI
        },
        showlegend: true,
        height: 600,
        margin: {
            l: 50,
            r: 50,
            b: 50,
            t: 80,
            pad: 4
        }
    };

    return (
        <div className="w-full bg-white shadow-lg rounded-lg p-4">
            <Plot
                data={data}
                layout={layout}
                style={{ width: '100%', height: '100%' }}
                useResizeHandler={true}
                config={{ responsive: true }}
            />
        </div>
    );
};

export default StockChart;
