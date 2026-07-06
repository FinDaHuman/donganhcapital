import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Search, X, ArrowLeft } from 'lucide-react';
import { createChart, CrosshairMode, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import { cssVar, withAlpha } from './dashboard/utils';

// Market colors from the design tokens (lightweight-charts renders to canvas,
// so var() strings can't be used directly — resolve them once at module scope)
const MARKET_UP = () => cssVar('--market-up', '#4DB882');
const MARKET_DOWN = () => cssVar('--market-down', '#E05555');

const StockChart = ({ history, forecast, ticker, livePrice, liveChangePct, stockList = [], onSelectStock, onBack, backLabel }) => {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef({});
    const priceLineRef = useRef(null);

    // Search & Display State
    const [showSearch, setShowSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showPrediction, setShowPrediction] = useState(false);

    const filteredStocks = useMemo(() => {
        return stockList.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [stockList, searchTerm]);

    // Initialize chart ONCE
    useEffect(() => {
        if (!containerRef.current) return;

        const chart = createChart(containerRef.current, {
            layout: {
                background: { type: 'solid', color: '#111213' },
                textColor: '#757575',
            },
            grid: {
                vertLines: { color: '#1f1f1f' },
                horzLines: { color: '#1f1f1f' },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    labelBackgroundColor: '#2a2e39',
                },
                horzLine: {
                    labelBackgroundColor: '#2a2e39',
                },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#1f1f1f',
            },
            rightPriceScale: {
                borderColor: '#1f1f1f',
            },
            autoSize: true, 
            localization: {
                timeFormatter: (time) => {
                    const d = new Date(time * 1000);
                    const year = d.getUTCFullYear();
                    const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
                    const day = d.getUTCDate().toString().padStart(2, '0');
                    const hours = d.getUTCHours();
                    const minutes = d.getUTCMinutes().toString().padStart(2, '0');
                    
                    if (hours === 0 && minutes === '00') {
                        return `${year}-${month}-${day}`;
                    }
                    return `${year}-${month}-${day} ${hours.toString().padStart(2, '0')}:${minutes}`;
                }
            }
        });

        const upColor = MARKET_UP();
        const downColor = MARKET_DOWN();
        const mainSeries = chart.addSeries(CandlestickSeries, {
            upColor,
            downColor,
            borderVisible: false,
            wickUpColor: upColor,
            wickDownColor: downColor,
        });

        const forecastLineSeries = chart.addSeries(LineSeries, {
            color: '#ff9800',
            lineWidth: 2,
            crosshairMarkerVisible: true,
        });

        const upperSeries = chart.addSeries(LineSeries, {
            color: 'rgba(255, 152, 0, 0.5)',
            lineWidth: 1,
            lineStyle: 1, // Dotted
            crosshairMarkerVisible: false,
        });

        const lowerSeries = chart.addSeries(LineSeries, {
            color: 'rgba(255, 152, 0, 0.5)',
            lineWidth: 1,
            lineStyle: 1, // Dotted
            crosshairMarkerVisible: false,
        });

        const volumeSeries = chart.addSeries(HistogramSeries, {
            color: '#26a69a',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: '', // Overlay over everything but fixed to bottom
            lastValueVisible: false,
        });

        // Apply margins to the overlay price scale
        chart.priceScale('').applyOptions({
            scaleMargins: {
                top: 0.8, // leave top 80% for price
                bottom: 0,
            },
        });

        chartRef.current = chart;
        seriesRef.current = {
            mainSeries,
            forecastLineSeries,
            upperSeries,
            lowerSeries,
            volumeSeries
        };

        return () => {
            chart.remove();
            chartRef.current = null;
        };
    }, []);

    // Update data when props change
    useEffect(() => {
        if (!chartRef.current || !seriesRef.current.mainSeries) return;

        const safeHistory = Array.isArray(history) ? history : [];
        const safeForecast = Array.isArray(forecast) ? forecast : [];

        const timeMap = new Map();

        const addPoint = (d, type) => {
            const dateStr = d.Date || d.date || d.time;
            if (!dateStr) return;

            let time;
            if (typeof dateStr === 'string') {
                const cleanStr = dateStr.replace('Z', '').replace(/\+\d{2}:\d{2}$/, '');
                const parts = cleanStr.split(/[-T: ]/);
                if (parts.length >= 3) {
                    const year = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    const day = parseInt(parts[2], 10);
                    const hours = parts.length > 3 ? parseInt(parts[3], 10) : 0;
                    const minutes = parts.length > 4 ? parseInt(parts[4], 10) : 0;
                    const seconds = parts.length > 5 ? parseInt(parts[5], 10) : 0;
                    time = Math.floor(Date.UTC(year, month, day, hours, minutes, seconds) / 1000);
                }
            }
            if (time === undefined) {
                const dateObj = new Date(dateStr);
                if (isNaN(dateObj.getTime())) return;
                time = Math.floor(dateObj.getTime() / 1000) - (dateObj.getTimezoneOffset() * 60);
            }
            
            if (!timeMap.has(time)) {
                timeMap.set(time, { time });
            }
            const pt = timeMap.get(time);
            
            if (type === 'history') {
                pt.isHistory = true;
                pt.open = Number(d.Open);
                pt.high = Number(d.High);
                pt.low = Number(d.Low);
                pt.close = Number(d.Close);
                pt.volume = Number(d.Volume || 0);
                pt.isGreen = pt.close >= pt.open;
            } else if (type === 'forecast') {
                pt.forecastClose = Number(d.Close);
                
                pt.open = pt.open ?? Number(d.Open);
                pt.high = pt.high ?? Number(d.High);
                pt.low = pt.low ?? Number(d.Low);
                pt.close = pt.close ?? Number(d.Close);
                pt.isGreen = pt.close >= pt.open;

                if (d.upper_bound !== undefined && d.upper_bound !== null) {
                    pt.upper = Number(d.upper_bound);
                }
                if (d.lower_bound !== undefined && d.lower_bound !== null) {
                    pt.lower = Number(d.lower_bound);
                }
            }
        };

        safeHistory.forEach(d => addPoint(d, 'history'));
        safeForecast.forEach(d => addPoint(d, 'forecast'));

        // Sort Map strictly chronologically
        const sortedTimes = Array.from(timeMap.keys()).sort((a, b) => a - b);

        const candleData = [];
        const volumeData = [];
        const forecastLineData = [];
        const upperData = [];
        const lowerData = [];

        let previousHistoryPt = null;

        for (const t of sortedTimes) {
            const pt = timeMap.get(t);
            
            // Track if it's purely a forecast point
            const isPureForecast = !pt.isHistory && pt.forecastClose !== undefined;

            // Build Candles
            if (!isNaN(pt.open) && !isNaN(pt.high) && !isNaN(pt.low) && !isNaN(pt.close)) {
                // Only push if it's history OR we are showing predictions
                if (pt.isHistory || (isPureForecast && showPrediction)) {
                    candleData.push({
                        time: pt.time,
                        open: pt.open,
                        high: pt.high,
                        low: pt.low,
                        close: pt.close,
                    });
                }
                
                // Volume typically only matters for history, but let's leave it attached to all rendering
                if (pt.volume > 0 && (pt.isHistory || showPrediction)) {
                    volumeData.push({
                        time: pt.time,
                        value: pt.volume,
                        color: pt.isGreen ? withAlpha(MARKET_UP(), 0.3) : withAlpha(MARKET_DOWN(), 0.3)
                    });
                }
            }

            if (pt.isHistory) {
                previousHistoryPt = pt;
            }

            // Build Forecast Lines
            if (showPrediction) {
                if (pt.forecastClose !== undefined) {
                    if (forecastLineData.length === 0 && previousHistoryPt && previousHistoryPt.close !== undefined) {
                        forecastLineData.push({ time: previousHistoryPt.time, value: previousHistoryPt.close });
                    }
                    forecastLineData.push({ time: pt.time, value: pt.forecastClose });
                }
                
                // Build Band Lines
                if (pt.upper !== undefined && !isNaN(pt.upper)) upperData.push({ time: pt.time, value: pt.upper });
                if (pt.lower !== undefined && !isNaN(pt.lower)) lowerData.push({ time: pt.time, value: pt.lower });
            }
        }

        // Apply to series
        const { mainSeries, forecastLineSeries, upperSeries, lowerSeries, volumeSeries } = seriesRef.current;
        
        mainSeries.setData(candleData);
        forecastLineSeries.setData(forecastLineData);
        upperSeries.setData(upperData);
        lowerSeries.setData(lowerData);
        volumeSeries.setData(volumeData);

        // Auto-fit bounds ONLY the VERY FIRST time data loads
        if (candleData.length > 0 && !chartRef.current.hasFittedOnce) {
            const timeScale = chartRef.current.timeScale();
            const totalItems = candleData.length;
            if (totalItems > 200) {
                timeScale.setVisibleLogicalRange({
                    from: totalItems - 200,
                    to: totalItems - 1,
                });
            } else {
                timeScale.fitContent();
            }
            chartRef.current.hasFittedOnce = true;
        }

    }, [history, forecast, showPrediction]);

    // Live price line — a horizontal marker at the current intraday price.
    // Additive: does nothing when livePrice is absent (off-hours / provider down).
    useEffect(() => {
        const mainSeries = seriesRef.current.mainSeries;
        if (!mainSeries) return;

        if (priceLineRef.current) {
            try { mainSeries.removePriceLine(priceLineRef.current); } catch { /* stale handle after remount */ }
            priceLineRef.current = null;
        }

        const price = Number(livePrice);
        if (!livePrice || isNaN(price) || price <= 0) return;

        const up = liveChangePct == null || liveChangePct >= 0;
        priceLineRef.current = mainSeries.createPriceLine({
            price,
            color: up ? MARKET_UP() : MARKET_DOWN(),
            lineWidth: 1,
            lineStyle: 2, // Dashed
            axisLabelVisible: true,
            title: liveChangePct != null
                ? `LIVE ${liveChangePct >= 0 ? '+' : ''}${Number(liveChangePct).toFixed(2)}%`
                : 'LIVE',
        });
    }, [livePrice, liveChangePct, history]);

    return (
        <div className="flex h-full w-full bg-[#111213] flex-col relative overflow-hidden">
            {/* Ticker & Search Overlay */}
            <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 sm:gap-3 bg-[#111213]/80 p-2 rounded backdrop-blur-sm border border-[#2a2e39]/50 max-w-[calc(100vw-2rem)]">
                {onBack && (
                    <>
                        <button
                            onClick={onBack}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-gray-300 hover:text-white hover:bg-[#25282c] rounded transition-colors"
                            title={`Back to ${backLabel}`}
                        >
                            <ArrowLeft size={16} />
                            <span className="hidden sm:inline">Back to {backLabel}</span>
                        </button>
                        <div className="w-[1px] h-6 bg-[#2a2e39] mx-0.5 hidden sm:block" />
                    </>
                )}
                <h1
                    className="text-2xl font-black text-white tracking-wider max-w-[150px] truncate drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                    style={{ WebkitTextStroke: '1px rgba(0,0,0,0.8)' }}
                >
                    {ticker}
                </h1>
                <button
                    onClick={() => setShowSearch(true)}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-[#25282c] rounded transition-colors"
                >
                    <Search size={20} />
                </button>
                <div className="w-[1px] h-6 bg-[#2a2e39] mx-1 hidden sm:block" />
                <button
                    onClick={() => setShowPrediction(!showPrediction)}
                    className={`px-3 py-1 text-xs font-semibold rounded border transition-colors ${
                        showPrediction 
                        ? 'bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20' 
                        : 'bg-transparent text-gray-500 border-gray-700 hover:text-gray-300'
                    }`}
                >
                    {showPrediction ? 'Hide Pred' : 'Show Pred'}
                </button>
            </div>

            {/* Search Dropdown Modal */}
            {showSearch && (
                <div className="absolute top-16 left-4 z-30 w-[min(288px,calc(100vw-2rem))] bg-[#1a1c1e] border border-[#2a2e39] rounded-lg shadow-2xl flex flex-col max-h-[400px]">
                    <div className="p-3 border-b border-[#2a2e39] flex items-center gap-2">
                        <Search size={16} className="text-gray-500" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search stock ticker..."
                            className="flex-1 bg-transparent border-none text-white text-sm focus:outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <button onClick={() => setShowSearch(false)} className="text-gray-500 hover:text-white p-1">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800 p-2">
                        {filteredStocks.map(s => (
                            <div
                                key={s}
                                onClick={() => {
                                    onSelectStock(s);
                                    setShowSearch(false);
                                    setSearchTerm('');
                                }}
                                className={`px-4 py-2 text-sm cursor-pointer rounded hover:bg-[#25282c] ${s === ticker ? 'text-blue-500 font-bold bg-[#1e2228]' : 'text-gray-300'}`}
                            >
                                {s}
                            </div>
                        ))}
                        {filteredStocks.length === 0 && (
                            <div className="p-4 text-center text-gray-500 text-xs text-center">No stocks found</div>
                        )}
                    </div>
                </div>
            )}

            {/* TradingView Chart Container */}
            <div
                ref={containerRef}
                className="flex-1 w-full min-h-0 relative"
            />
        </div>
    );
};

export default StockChart;
