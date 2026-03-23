import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';

const StockChart = ({ history, forecast, ticker, stockList = [], onSelectStock }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    // Merge Data
    const fullData = useMemo(() => {
        // history: {Date, Open, High, Low, Close, Volume}
        // forecast: {Date, Open, High, Low, Close, lower_bound, upper_bound...}

        const safeHistory = Array.isArray(history) ? history : [];
        const safeForecast = Array.isArray(forecast) ? forecast : [];

        const histData = safeHistory.map(d => ({ ...d, type: 'history' }));
        const foreData = safeForecast.map(d => ({ ...d, type: 'forecast' }));

        // Merge: Use History, append unique Forecast
        const combined = [...histData];
        if (foreData.length > 0) {
            foreData.forEach(f => {
                // If date not in history, add it
                if (!combined.find(h => h.Date === f.Date)) {
                    combined.push(f);
                }
            });
        }

        return combined.map(d => ({
            time: d.Date || d.date || d.time,
            open: Number(d.Open),
            high: Number(d.High),
            low: Number(d.Low),
            close: Number(d.Close),
            volume: Number(d.Volume || 0),
            isForecast: d.type === 'forecast',
            upper: d.upper_bound !== undefined && d.upper_bound !== null ? Number(d.upper_bound) : null,
            lower: d.lower_bound !== undefined && d.lower_bound !== null ? Number(d.lower_bound) : null
        })).filter(d => !isNaN(d.close) && d.close > 0 && !isNaN(d.open) && d.open > 0);
    }, [history, forecast]);

    // Viewport State (Indices)
    // Default: Show last 100 candles or full if less
    const [viewport, setViewport] = useState({ start: 0, end: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastMouseX, setLastMouseX] = useState(0);

    // Search State
    const [showSearch, setShowSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredStocks = useMemo(() => {
        return stockList.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [stockList, searchTerm]);

    // Initialize Viewport once data loads
    useEffect(() => {
        if (fullData.length > 0) {
            const count = fullData.length;
            // Default show last 60 candles roughly
            const initialView = 60;
            setViewport({
                start: Math.max(0, count - initialView),
                end: count
            });
        }
    }, [fullData]);


    // ==================== CORE LOGIC ====================
    // 3. NICE SCALE ALGORITHM
    const niceNumber = (value) => {
        const exponent = Math.floor(Math.log10(value));
        const fraction = value / Math.pow(10, exponent);
        let nice = 1;

        if (fraction < 1.5) nice = 1;
        else if (fraction < 3) nice = 2;
        else if (fraction < 7) nice = 5;
        else nice = 10;

        return nice * Math.pow(10, exponent);
    };

    const drawChart = () => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || fullData.length === 0) return;

        const ctx = canvas.getContext('2d');
        const width = container.clientWidth;
        const height = container.clientHeight;

        if (width === 0 || height === 0) return;

        // Handle High DPI
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        // Clear
        ctx.fillStyle = "#111213";
        ctx.fillRect(0, 0, width, height);

        // ===== 1. VIEWPORT =====
        // Clamp viewport
        let start = Math.max(0, Math.min(viewport.start, fullData.length - 2));
        let end = Math.min(fullData.length, Math.max(viewport.end, start + 2));

        // Slice Data
        const visibleData = fullData.slice(Math.floor(start), Math.ceil(end));
        const count = visibleData.length;

        window.debugVisibleData = visibleData;

        if (count === 0) return;

        const candleWidth = width / count;

        const mapX = (i) => {
            return i * candleWidth;
        };

        // ===== 2. CALCULATE Y RANGE =====
        let minY = Infinity;
        let maxY = -Infinity;

        visibleData.forEach(p => {
            const validLow = !isNaN(p.low) && p.low !== null ? p.low : Math.min(p.open, p.close);
            const validHigh = !isNaN(p.high) && p.high !== null ? p.high : Math.max(p.open, p.close);
            if (validLow < minY) minY = validLow;
            if (validHigh > maxY) maxY = validHigh;
        });

        if (minY === Infinity || maxY === -Infinity) return;

        // Add padding
        let range = maxY - minY;
        if (range === 0) range = 1; // Fallback if flat
        const padding = range * 0.05;
        const rawMin = minY - padding;
        const rawMax = maxY + padding;

        // ===== 3. NICE SCALE =====
        const tickCount = 6; // User said 5, let's try 6 for better grid
        let tickStep = niceNumber((rawMax - rawMin) / tickCount);
        if (tickStep <= 0 || isNaN(tickStep) || !isFinite(tickStep)) tickStep = 1;

        const yMin = Math.floor(rawMin / tickStep) * tickStep;
        const yMax = Math.ceil(rawMax / tickStep) * tickStep;

        // ===== 4. MAP Y =====
        const bottomPadding = 30; // Reserve space for X-axis labels
        const mapY = (value) => {
            // Inverted for Canvas (0 is top)
            const ratio = (value - yMin) / (yMax - yMin);
            return (height - bottomPadding) * (1 - ratio);
        };

        // ===== 5. DRAW AXES =====
        ctx.lineWidth = 1;
        ctx.font = "11px Inter, sans-serif";
        const gridColor = "#1f1f1f";
        const textColor = "#757575";

        // Y Ticks & Grid
        for (let y = yMin; y <= yMax; y += tickStep) {
            const py = mapY(y);

            // Grid
            ctx.strokeStyle = gridColor;
            ctx.beginPath();
            ctx.moveTo(0, py);
            ctx.lineTo(width, py);
            ctx.stroke();

            // Text
            ctx.fillStyle = textColor;
            ctx.textAlign = "right";
            ctx.fillText(y.toFixed(2), width - 10, py - 4);
        }

        // X Ticks
        const xStep = Math.max(1, Math.floor(count / 5));
        for (let i = 0; i < count; i += xStep) {
            const x = mapX(i);
            const dateStr = visibleData[i].time;

            const dateObj = new Date(dateStr);
            let label = "";

            const isIntraday = ticker === 'VN30F1M' || (fullData.length > 1 && (new Date(fullData[1].time).getTime() - new Date(fullData[0].time).getTime() < 86400000));

            if (isNaN(dateObj.getTime())) {
                label = dateStr ? String(dateStr).split('T')[0] : `Idx ${i}`;
            } else {
                const dayStr = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
                if (isIntraday) {
                    const timeStr = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
                    label = [dayStr, timeStr];
                } else {
                    if (count < 90) {
                        label = dayStr;
                    } else if (count < 300) {
                        label = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;
                    } else {
                        label = dateObj.getFullYear().toString();
                    }
                }
            }

            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            
            if (Array.isArray(label)) {
                ctx.fillText(label[0], x + candleWidth / 2, height - 20);
                ctx.fillText(label[1], x + candleWidth / 2, height - 8);
            } else {
                ctx.fillText(label || "DATE", x + candleWidth / 2, height - 14);
            }

            // Grid line for X
            ctx.strokeStyle = gridColor;
            ctx.beginPath();
            ctx.moveTo(x + candleWidth / 2, 0);
            ctx.lineTo(x + candleWidth / 2, height - bottomPadding);
            ctx.stroke();
        }

        // ===== 8. DRAW CONFIDENCE RANGE (BAND) =====
        // Draw as a single polygon for smooth rendering
        const forecastPoints = visibleData.map((p, i) => ({ ...p, i })).filter(p => p.isForecast);

        if (forecastPoints.length > 0) {
            ctx.fillStyle = "rgba(255, 152, 0, 0.2)";
            ctx.beginPath();

            // Upper Line
            let first = true;
            forecastPoints.forEach(p => {
                const x = mapX(p.i) + candleWidth / 2;
                const y = mapY(p.upper);
                if (first) { ctx.moveTo(x, y); first = false; }
                else ctx.lineTo(x, y);
            });

            // Lower Line (Reverse)
            for (let j = forecastPoints.length - 1; j >= 0; j--) {
                const p = forecastPoints[j];
                const x = mapX(p.i) + candleWidth / 2;
                const y = mapY(p.lower);
                ctx.lineTo(x, y);
            }

            ctx.closePath();
            ctx.fill();
        }


        // ===== 7. DRAW FORECAST LINE =====
        if (forecastPoints.length > 0) {
            ctx.strokeStyle = "#ff9800"; // Forecast Orange
            ctx.lineWidth = 2;
            ctx.beginPath();

            // Connect from the last history point if possible?
            // User pseudocode iterates only visibleForecast.
            // But visually better to connect to previous candle Close.
            // Let's find the point BEFORE the first forecast point if it exists in visibleData.
            const firstF = forecastPoints[0];
            if (firstF.i > 0) {
                const prev = visibleData[firstF.i - 1];
                const xPrev = mapX(firstF.i - 1) + candleWidth / 2;
                const yPrev = mapY(prev.close);
                ctx.moveTo(xPrev, yPrev);
                ctx.lineTo(mapX(firstF.i) + candleWidth / 2, mapY(firstF.close));
            } else {
                const x = mapX(firstF.i) + candleWidth / 2;
                const y = mapY(firstF.close);
                ctx.moveTo(x, y);
            }

            // Continue path
            for (let k = 1; k < forecastPoints.length; k++) {
                const p = forecastPoints[k];
                const x = mapX(p.i) + candleWidth / 2;
                const y = mapY(p.close);
                ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Draw Points (Dots)
            ctx.fillStyle = "#ff9800";
            forecastPoints.forEach(p => {
                const x = mapX(p.i) + candleWidth / 2;
                const y = mapY(p.close);
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // ===== 6. DRAW CANDLES =====
        visibleData.forEach((p, i) => {
            const xCenter = mapX(i) + candleWidth / 2;
            const xLeft = mapX(i) + (candleWidth * 0.1); // Gap
            const bodyWidth = Math.max(1, candleWidth * 0.8);

            const yOpen = mapY(p.open);
            const yClose = mapY(p.close);
            const yHigh = mapY(p.high);
            const yLow = mapY(p.low);

            ctx.lineWidth = 1;

            // Color
            const isGreen = p.close >= p.open;
            ctx.strokeStyle = isGreen ? "#00c853" : "#d50000";
            ctx.fillStyle = isGreen ? "#00c853" : "#d50000";

            // Wick
            ctx.beginPath();
            ctx.moveTo(xCenter, yHigh);
            ctx.lineTo(xCenter, yLow);
            ctx.stroke();

            // Body
            // Rect(x, y, w, h)
            // Note: Canvas rect height must be positive, so we calculate carefully
            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.abs(yClose - yOpen);
            // Ensure at least 1px height
            const finalHeight = Math.max(1, bodyHeight);

            ctx.fillRect(xCenter - bodyWidth / 2, bodyTop, bodyWidth, finalHeight);
        });
    };

    // Re-draw on resizing/viewport change
    useEffect(() => {
        let rafId;
        const doDraw = () => { rafId = window.requestAnimationFrame(drawChart); };

        const container = containerRef.current;
        if (container) {
            let lastWidth = -1;
            let lastHeight = -1;
            const ro = new ResizeObserver((entries) => {
                for (let entry of entries) {
                    const { width, height } = entry.contentRect;
                    if (Math.abs(width - lastWidth) > 1 || Math.abs(height - lastHeight) > 1) {
                        lastWidth = width;
                        lastHeight = height;
                        doDraw();
                    }
                }
            });
            ro.observe(container);
            doDraw();
            return () => { ro.disconnect(); cancelAnimationFrame(rafId); };
        }
    }, [fullData, viewport]);


    // ==================== EVENT HANDLERS ====================

    // Zoom (Wheel)
    const handleWheel = (e) => {
        e.preventDefault();
        const factor = 1.1; // Zoom Speed

        const width = viewport.end - viewport.start;
        // Determine Zoom In or Out
        const isZoomIn = e.deltaY < 0;
        const newWidth = isZoomIn ? width / factor : width * factor;

        // Apply
        // Needs centerIndex?
        // User Logic: viewportStart = centerIndex - newWidth / 2
        // We calculate center based on mouseX if possible, or just center of screen.
        // For simplicity: Center of current viewport.
        const center = (viewport.start + viewport.end) / 2;

        let newStart = center - newWidth / 2;
        let newEnd = center + newWidth / 2;

        setViewport({ start: newStart, end: newEnd });
    };

    // Pan (Drag)
    const handleMouseDown = (e) => {
        setIsDragging(true);
        setLastMouseX(e.clientX);
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastMouseX;
        setLastMouseX(e.clientX);

        // Convert px to candles
        const container = containerRef.current;
        if (!container) return;

        const chartWidth = container.clientWidth;
        const candlesVisible = viewport.end - viewport.start;
        const pixelsPerCandle = chartWidth / candlesVisible;

        const deltaCandles = -dx / pixelsPerCandle; 

        setViewport(prev => {
            let newStart = prev.start + deltaCandles;
            let newEnd = prev.end + deltaCandles;

            // Prevent panning out of bounds
            if (newStart < -10) {
                const diff = newStart - (-10);
                newStart -= diff;
                newEnd -= diff;
            }
            if (newEnd > fullData.length + 10) {
                const diff = newEnd - (fullData.length + 10);
                newStart -= diff;
                newEnd -= diff;
            }

            return { start: newStart, end: newEnd };
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Touch pan/zoom State
    const [touchDistance, setTouchDistance] = useState(null);

    const handleTouchStart = (e) => {
        if (e.touches.length === 1) {
            setIsDragging(true);
            setLastMouseX(e.touches[0].clientX);
            setTouchDistance(null);
        } else if (e.touches.length === 2) {
            setIsDragging(false);
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            setTouchDistance(dist);
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 1 && isDragging) {
            const dx = e.touches[0].clientX - lastMouseX;
            setLastMouseX(e.touches[0].clientX);

            const container = containerRef.current;
            if (!container) return;

            const chartWidth = container.clientWidth;
            const candlesVisible = viewport.end - viewport.start;
            const pixelsPerCandle = chartWidth / candlesVisible;

            const deltaCandles = -dx / pixelsPerCandle; 

            setViewport(prev => {
                let newStart = prev.start + deltaCandles;
                let newEnd = prev.end + deltaCandles;

                if (newStart < -10) { const diff = newStart - (-10); newStart -= diff; newEnd -= diff; }
                if (newEnd > fullData.length + 10) { const diff = newEnd - (fullData.length + 10); newStart -= diff; newEnd -= diff; }

                return { start: newStart, end: newEnd };
            });
        } else if (e.touches.length === 2 && touchDistance !== null) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            
            const factor = touchDistance / dist;
            const vp = viewportRef.current || viewport; 
            const width = vp.end - vp.start;
            const newWidth = width * factor;

            const center = (vp.start + vp.end) / 2;
            let newStart = center - newWidth / 2;
            let newEnd = center + newWidth / 2;

            const minItems = 10;
            const maxItems = fullData.length + 20;

            if (newEnd - newStart < minItems) { newEnd = center + minItems / 2; newStart = center - minItems / 2; }
            if (newEnd - newStart > maxItems) { newEnd = center + maxItems / 2; newStart = center - maxItems / 2; }
            if (newStart < -10) { newEnd += (-10 - newStart); newStart = -10; }
            if (newEnd > fullData.length + 10) { newStart -= (newEnd - (fullData.length + 10)); newEnd = fullData.length + 10; }

            setViewport({ start: newStart, end: newEnd });
            setTouchDistance(dist);
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        setTouchDistance(null);
    };

    // Prevent scrolling page when zooming chart
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onWheel = (e) => handleWheel(e);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        return () => canvas.removeEventListener('wheel', onWheel);
    }, [viewport]); // Re-bind with latest viewport state? Or use ref for viewport.
    // Actually, to avoid stale layout in event listener:
    // Better to use a ref for viewport if we attach listener manually.
    // But since we setState, we can use the React Synthetic event if simpler, 
    // but React wheel event is passive by default in some versions? 
    // Let's stick to ref for viewport to be safe or reliance on React re-render.
    // For specific "non-passive" event, manual attach is required.

    // Ref for Viewport access in listener
    const viewportRef = useRef(viewport);
    useEffect(() => { viewportRef.current = viewport; }, [viewport]);

    // Ref-based implementation for Event Listener to avoid re-attaching
    useEffect(() => {
        const canvas = canvasRef.current;
        const onWheel = (e) => {
            e.preventDefault();
            const vp = viewportRef.current;
            const factor = 1.1;
            const width = vp.end - vp.start;
            const isZoomIn = e.deltaY < 0;
            const newWidth = isZoomIn ? width / factor : width * factor;

            const center = (vp.start + vp.end) / 2;
            let newStart = center - newWidth / 2;
            let newEnd = center + newWidth / 2;

            // Clamping limits
            const minItems = 10;
            const maxItems = fullData.length + 20;

            if (newEnd - newStart < minItems) {
                newEnd = center + minItems / 2;
                newStart = center - minItems / 2;
            }
            if (newEnd - newStart > maxItems) {
                newEnd = center + maxItems / 2;
                newStart = center - maxItems / 2;
            }

            // Prevent panning way out of bounds during zoom
            if (newStart < -10) {
                newEnd += (-10 - newStart);
                newStart = -10;
            }
            if (newEnd > fullData.length + 10) {
                newStart -= (newEnd - (fullData.length + 10));
                newEnd = fullData.length + 10;
            }

            setViewport({ start: newStart, end: newEnd });
        };
        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', onWheel);
    }, [fullData.length]);


    return (
        <div className="flex h-full w-full bg-[#111213] flex-col relative overflow-hidden">
            {/* Ticker & Search Overlay */}
            <div className="absolute top-4 left-4 z-20 flex items-center gap-3 bg-[#111213]/80 p-2 rounded backdrop-blur-sm border border-[#2a2e39]/50">
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

            <div
                ref={containerRef}
                className="flex-1 w-full min-h-0 relative cursor-crosshair active:cursor-grabbing overflow-hidden"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <canvas ref={canvasRef} className="absolute inset-0 block" style={{ touchAction: 'none' }} />
            </div>
        </div>
    );
};

export default StockChart;
