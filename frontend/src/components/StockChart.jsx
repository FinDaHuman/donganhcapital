import React, { useRef, useEffect, useState, useMemo } from 'react';

const StockChart = ({ history, forecast, ticker }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    // Merge Data
    const fullData = useMemo(() => {
        // history: {Date, Open, High, Low, Close, Volume}
        // forecast: {Date, Open, High, Low, Close, lower_bound, upper_bound...}
        // distinct by Date to avoid overlap if any
        const combined = [...history];
        if (forecast && forecast.length > 0) {
            forecast.forEach(f => {
                if (!combined.find(h => h.Date === f.Date)) {
                    combined.push(f);
                }
            });
        }
        return combined.map(d => ({
            time: d.Date,
            open: d.Open,
            high: d.High,
            low: d.Low,
            close: d.Close,
            volume: d.Volume || 0
        }));
    }, [history, forecast]);

    // Viewport State (Indices)
    // Default: Show last 100 candles or full if less
    const [viewport, setViewport] = useState({ start: 0, end: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastMouseX, setLastMouseX] = useState(0);

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
        // We use Math.floor/ceil to handle fractional indices during smooth zoom/pan? 
        // Pseudocode implies indices. Let's stick to integer slicing for data access, 
        // but math can use floats for smooth scroll if needed.
        const iStart = Math.floor(start);
        const iEnd = Math.ceil(end);
        const visibleData = fullData.slice(iStart, iEnd);
        const count = visibleData.length;

        if (count === 0) return;

        const candleWidth = width / count;

        const mapX = (i) => {
            return i * candleWidth;
        };

        // ===== 2. CALCULATE Y RANGE =====
        let minY = Infinity;
        let maxY = -Infinity;

        visibleData.forEach(p => {
            if (p.low < minY) minY = p.low;
            if (p.high > maxY) maxY = p.high;
        });

        // Add padding
        const range = maxY - minY;
        const padding = range * 0.05 || 1; // Fallback if flat
        const rawMin = minY - padding;
        const rawMax = maxY + padding;

        // ===== 3. NICE SCALE =====
        const tickCount = 6; // User said 5, let's try 6 for better grid
        const tickStep = niceNumber((rawMax - rawMin) / tickCount);

        const yMin = Math.floor(rawMin / tickStep) * tickStep;
        const yMax = Math.ceil(rawMax / tickStep) * tickStep;

        // ===== 4. MAP Y =====
        const mapY = (value) => {
            // Inverted for Canvas (0 is top)
            // canvasHeight * (1 - (value - yMin) / (yMax - yMin))
            const ratio = (value - yMin) / (yMax - yMin);
            return height * (1 - ratio);
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

            // Format Date based on Zoom (Simple logic from previous step, or standard)
            // User script: `drawXTick(x, visibleData[i].time)`
            // We'll parse it for better looking label
            const dateObj = new Date(dateStr);
            let label = "";

            if (count < 60) {
                // DD/MM
                label = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
            } else if (count < 300) {
                // MM/YYYY
                label = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;
            } else {
                // YYYY
                label = dateObj.getFullYear().toString();
            }

            ctx.fillStyle = textColor;
            ctx.textAlign = "center";
            ctx.fillText(label, x + candleWidth / 2, height - 10);

            // Grid line for X
            ctx.strokeStyle = gridColor;
            ctx.beginPath();
            ctx.moveTo(x + candleWidth / 2, 0);
            ctx.lineTo(x + candleWidth / 2, height);
            ctx.stroke();
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
        window.requestAnimationFrame(drawChart);
    }, [fullData, viewport]);

    // Handle Resize
    useEffect(() => {
        const handleResize = () => requestAnimationFrame(drawChart);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);


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
        // We need 'pixels per candle' to know how many candles we shifted
        const container = containerRef.current;
        if (!container) return;

        const chartWidth = container.clientWidth;
        const candlesVisible = viewport.end - viewport.start;
        const pixelsPerCandle = chartWidth / candlesVisible;

        const deltaCandles = -dx / pixelsPerCandle; // Invert (drag left -> moves view right -> start increases?)
        // If I drag mouse LEFT (negative dx), I want to see future (move right).
        // visible range shifts RIGHT. So start increases.
        // -(-10) = +10. Correct.

        setViewport(prev => ({
            start: prev.start + deltaCandles,
            end: prev.end + deltaCandles
        }));
    };

    const handleMouseUp = () => {
        setIsDragging(false);
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

            // Mouse focus zoom could be better, but centering is safer for now.
            const center = (vp.start + vp.end) / 2;
            let newStart = center - newWidth / 2;
            let newEnd = center + newWidth / 2;

            setViewport({ start: newStart, end: newEnd });
        };
        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', onWheel);
    }, []);


    return (
        <div className="flex h-full w-full bg-[#111213] flex-col relative">
            {/* Ticker Overlay */}
            <div className="absolute top-4 left-4 z-10 pointer-events-none select-none">
                <h1 className="text-2xl font-bold text-white tracking-wider opacity-80">{ticker}</h1>
            </div>

            <div
                ref={containerRef}
                className="flex-1 w-full h-full relative cursor-crosshair active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <canvas ref={canvasRef} className="w-full h-full block" />
            </div>
        </div>
    );
};

export default StockChart;
