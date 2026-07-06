import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { formatVolume, formatChange, PANEL_STYLE, PANEL_LABEL_STYLE, MONO } from './utils';

const OVERVIEW_STOCKS = 100;      // top N by weight shown in the all-sectors view
const MIN_VOL_PCT_SECTOR = 0.015; // below 1.5% of sector weight → rolled into "+N" tile
const SECTOR_HEADER = 16;
const GAP = 2;

// Vivid market palette for the heatmap surface (HOSE ceiling/floor bands at ±6.8%).
// The muted brand tokens read as pale across a full-screen color-coded surface.
const heatColor = (pct) => {
    if (pct <= -6.8) return 'var(--market-floor-vivid)';
    if (pct < -0.05) return 'var(--market-down-vivid)';
    if (pct <= 0.05) return 'var(--market-neutral-vivid)';
    if (pct < 6.8) return 'var(--market-up-vivid)';
    return 'var(--market-ceiling-vivid)';
};

const LEGEND = [
    { color: 'var(--market-floor-vivid)', label: '≤ -6.8%' },
    { color: 'var(--market-down-vivid)', label: 'Down' },
    { color: 'var(--market-neutral-vivid)', label: 'Flat' },
    { color: 'var(--market-up-vivid)', label: 'Up' },
    { color: 'var(--market-ceiling-vivid)', label: '≥ +6.8%' },
];

const SIZE_MODES = [
    { id: 'volume', label: 'Volume' },
    { id: 'value', label: 'Value' },
];

/**
 * Squarified treemap layout (Bruls et al.).
 * items: [{ weight, data }] sorted descending by weight.
 * Returns [{ x, y, w, h, data }].
 */
function squarify(items, x, y, w, h) {
    const total = items.reduce((s, it) => s + it.weight, 0);
    if (total <= 0 || w <= 4 || h <= 4) return [];
    const scale = (w * h) / total;
    const queue = items.map(it => ({ ...it, area: Math.max(it.weight * scale, 0.01) }));

    const results = [];
    let rx = x, ry = y, rw = w, rh = h;
    let row = [];

    const worstRatio = (r, side) => {
        const sum = r.reduce((s, t) => s + t.area, 0);
        let max = -Infinity, min = Infinity;
        r.forEach(t => { if (t.area > max) max = t.area; if (t.area < min) min = t.area; });
        const s2 = sum * sum;
        return Math.max((side * side * max) / s2, s2 / (side * side * min));
    };

    const layoutRow = (r) => {
        const sum = r.reduce((s, t) => s + t.area, 0);
        if (rw >= rh) {
            const stripW = sum / rh;
            let cy = ry;
            r.forEach(t => {
                const tileH = t.area / stripW;
                results.push({ x: rx, y: cy, w: stripW, h: tileH, data: t.data });
                cy += tileH;
            });
            rx += stripW; rw -= stripW;
        } else {
            const stripH = sum / rw;
            let cx = rx;
            r.forEach(t => {
                const tileW = t.area / stripH;
                results.push({ x: cx, y: ry, w: tileW, h: stripH, data: t.data });
                cx += tileW;
            });
            ry += stripH; rh -= stripH;
        }
    };

    let i = 0;
    while (i < queue.length) {
        const side = Math.min(rw, rh);
        if (row.length === 0) { row.push(queue[i++]); continue; }
        if (worstRatio(row, side) >= worstRatio([...row, queue[i]], side)) {
            row.push(queue[i++]);
        } else {
            layoutRow(row);
            row = [];
        }
    }
    if (row.length) layoutRow(row);
    return results;
}

// Dark text on the bright fills (gold flat, cyan floor, purple ceiling); white on up/down
const tileTextColor = (pct) =>
    (pct > -6.8 && pct < -0.05) || (pct > 0.05 && pct < 6.8)
        ? 'rgba(255,255,255,0.95)'
        : 'var(--bg-void)';

const Treemap = ({ stocks = [], getSector, onSelectStock }) => {
    const wrapRef = useRef(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [tooltip, setTooltip] = useState(null);     // { x, y, stock } | { x, y, others, sector }
    const [sizeBy, setSizeBy] = useState('volume');   // 'volume' | 'value'
    const [focusSector, setFocusSector] = useState(null);

    useEffect(() => {
        if (!wrapRef.current) return;
        const ro = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setSize({ w: Math.floor(width), h: Math.floor(height) });
        });
        ro.observe(wrapRef.current);
        return () => ro.disconnect();
    }, []);

    const weightOf = useCallback(
        (s) => (sizeBy === 'value' ? (s.trading_value || s.volume || 1) : (s.volume || 1)),
        [sizeBy]
    );

    const layout = useMemo(() => {
        if (!stocks.length || size.w < 50 || size.h < 50) return [];

        // Focused view: every stock of one sector, tiled flat (no header, no roll-up)
        if (focusSector) {
            const list = stocks.filter(s => getSector(s.code) === focusSector);
            const tileItems = list
                .map(s => ({ weight: weightOf(s), data: { stock: s } }))
                .sort((a, b) => b.weight - a.weight);
            const tiles = squarify(tileItems, 0, 0, size.w, size.h);
            return [{ name: focusSector, showHeader: false, tiles }];
        }

        // Overview: top N by weight, grouped by sector, small caps rolled into "+N"
        const universe = [...stocks].sort((a, b) => weightOf(b) - weightOf(a)).slice(0, OVERVIEW_STOCKS);

        const groups = new Map();
        universe.forEach(s => {
            const sector = getSector(s.code);
            if (!groups.has(sector)) groups.set(sector, []);
            groups.get(sector).push(s);
        });

        const sectorItems = Array.from(groups.entries())
            .map(([name, list]) => {
                const weight = list.reduce((sum, s) => sum + weightOf(s), 0);
                return { weight, data: { name, list, weight } };
            })
            .sort((a, b) => b.weight - a.weight);

        const sectorRects = squarify(sectorItems, 0, 0, size.w, size.h);

        return sectorRects.map(sr => {
            const { name, list, weight } = sr.data;
            const showHeader = sr.h > 44 && sr.w > 56;
            const innerY = sr.y + (showHeader ? SECTOR_HEADER : 0);
            const innerH = sr.h - (showHeader ? SECTOR_HEADER : 0);

            const small = [];
            const visible = [];
            list.forEach(s => {
                (weightOf(s) / weight < MIN_VOL_PCT_SECTOR ? small : visible).push(s);
            });
            if (small.length === 1) { visible.push(small[0]); small.length = 0; }

            const tileItems = visible
                .map(s => ({ weight: weightOf(s), data: { stock: s } }))
                .sort((a, b) => b.weight - a.weight);
            if (small.length > 0) {
                tileItems.push({
                    weight: small.reduce((sum, s) => sum + weightOf(s), 0),
                    data: { others: small },
                });
                tileItems.sort((a, b) => b.weight - a.weight);
            }

            const tiles = squarify(tileItems, sr.x, innerY, sr.w, innerH);
            return { ...sr, name, showHeader, tiles };
        });
    }, [stocks, getSector, size, focusSector, weightOf]);

    const handleMove = useCallback((e, data) => {
        const rect = wrapRef.current.getBoundingClientRect();
        setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, ...data });
    }, []);

    const enterSector = useCallback((name) => {
        setTooltip(null);
        setFocusSector(name);
    }, []);

    return (
        <div className="rounded-lg p-3 flex flex-col flex-1 min-h-0 w-full" style={PANEL_STYLE}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    {focusSector ? (
                        <>
                            <button
                                onClick={() => setFocusSector(null)}
                                className="flex items-center gap-1 rounded px-2 py-0.5 transition-colors hover:bg-[var(--bg-elevated)]"
                                style={{ ...PANEL_LABEL_STYLE, color: 'var(--gold-primary)', border: '1px solid rgba(201,169,110,0.2)', cursor: 'pointer' }}
                            >
                                <ArrowLeft size={11} />
                                All Sectors
                            </button>
                            <span className="truncate" style={PANEL_LABEL_STYLE}>{focusSector}</span>
                        </>
                    ) : (
                        <span style={PANEL_LABEL_STYLE}>Market Heatmap</span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* Color legend */}
                    <div className="hidden md:flex items-center gap-2">
                        {LEGEND.map(l => (
                            <span key={l.label} className="flex items-center gap-1">
                                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
                                <span style={{ fontFamily: MONO, fontSize: '10px', color: 'var(--text-muted)' }}>{l.label}</span>
                            </span>
                        ))}
                    </div>
                    {/* Size-by toggle */}
                    <div className="flex gap-1">
                        {SIZE_MODES.map(m => (
                            <button
                                key={m.id}
                                onClick={() => setSizeBy(m.id)}
                                className="px-2 py-0.5 rounded transition-colors"
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: sizeBy === m.id ? 'var(--text-inverse)' : 'var(--text-secondary)',
                                    background: sizeBy === m.id ? 'var(--gold-primary)' : 'transparent',
                                    border: '1px solid rgba(201,169,110,0.2)',
                                    cursor: 'pointer',
                                }}
                                title={m.id === 'volume' ? 'Tile size by traded volume' : 'Tile size by traded value'}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div ref={wrapRef} className="relative flex-1 min-h-[320px]" onMouseLeave={() => setTooltip(null)}>
                {size.w > 0 && (
                    <svg width={size.w} height={size.h} className="block">
                        {layout.map(sector => (
                            <g key={sector.name}>
                                {sector.tiles.map(t => {
                                    const isOthers = !!t.data.others;
                                    const s = t.data.stock;
                                    const pct = s ? (s.change_pct || 0) : 0;
                                    const fill = isOthers ? 'var(--bg-elevated)' : heatColor(pct);
                                    const showTicker = t.w >= 42 && t.h >= 24;
                                    const showPct = showTicker && t.h >= 40;
                                    const key = isOthers ? `others-${sector.name}` : s.code;
                                    return (
                                        <g
                                            key={key}
                                            onMouseMove={e => handleMove(e, isOthers ? { others: t.data.others, sector: sector.name } : { stock: s })}
                                            onMouseLeave={() => setTooltip(null)}
                                            onClick={() => (isOthers ? enterSector(sector.name) : onSelectStock && onSelectStock(s.code))}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <rect
                                                x={t.x + GAP / 2}
                                                y={t.y + GAP / 2}
                                                width={Math.max(t.w - GAP, 0)}
                                                height={Math.max(t.h - GAP, 0)}
                                                fill={fill}
                                                stroke="var(--bg-surface)"
                                                strokeWidth={1}
                                                rx={2}
                                                className="transition-[filter] duration-150 hover:brightness-125"
                                            />
                                            {showTicker && (
                                                <text
                                                    x={t.x + t.w / 2}
                                                    y={t.y + t.h / 2 + (showPct ? -4 : 4)}
                                                    textAnchor="middle"
                                                    style={{
                                                        fontFamily: MONO,
                                                        fontSize: Math.min(14, Math.max(10, t.w / 6)),
                                                        fontWeight: 600,
                                                        fill: isOthers ? 'var(--text-secondary)' : tileTextColor(pct),
                                                        pointerEvents: 'none',
                                                    }}
                                                >
                                                    {isOthers ? `+${t.data.others.length}` : s.code}
                                                </text>
                                            )}
                                            {showPct && !isOthers && (
                                                <text
                                                    x={t.x + t.w / 2}
                                                    y={t.y + t.h / 2 + 12}
                                                    textAnchor="middle"
                                                    style={{
                                                        fontFamily: MONO,
                                                        fontSize: 10,
                                                        fill: tileTextColor(pct),
                                                        fillOpacity: 0.9,
                                                        pointerEvents: 'none',
                                                    }}
                                                >
                                                    {formatChange(pct)}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                                {sector.showHeader && (
                                    <text
                                        x={sector.x + 5}
                                        y={sector.y + 12}
                                        onClick={() => enterSector(sector.name)}
                                        style={{
                                            fontFamily: "'Outfit', sans-serif",
                                            fontSize: 10,
                                            fontWeight: 600,
                                            letterSpacing: '0.08em',
                                            textTransform: 'uppercase',
                                            fill: 'var(--text-secondary)',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {sector.name} ›
                                    </text>
                                )}
                            </g>
                        ))}
                    </svg>
                )}

                {tooltip && (
                    <div
                        className="absolute z-20 pointer-events-none rounded-lg px-3 py-2 shadow-xl"
                        style={{
                            left: Math.min(tooltip.x + 12, Math.max(size.w - 170, 0)),
                            top: Math.min(tooltip.y + 12, Math.max(size.h - 110, 0)),
                            background: 'var(--bg-overlay)',
                            border: '1px solid rgba(201,169,110,0.25)',
                            minWidth: '150px',
                        }}
                    >
                        {tooltip.stock ? (
                            <>
                                <div className="flex items-baseline justify-between gap-3 mb-1">
                                    <span style={{ fontFamily: MONO, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {tooltip.stock.code}
                                    </span>
                                    <span style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 600, color: heatColor(tooltip.stock.change_pct || 0) }}>
                                        {formatChange(tooltip.stock.change_pct || 0)}
                                    </span>
                                </div>
                                {[
                                    ['Price', tooltip.stock.close ? tooltip.stock.close.toFixed(2) : 'N/A'],
                                    ['Volume', formatVolume(tooltip.stock.volume || 0)],
                                    ['Value', tooltip.stock.trading_value ? formatVolume(tooltip.stock.trading_value) : 'N/A'],
                                ].map(([label, val]) => (
                                    <div key={label} className="flex justify-between gap-4">
                                        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '11px', color: 'var(--text-muted)' }}>{label}</span>
                                        <span style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--text-secondary)' }}>{val}</span>
                                    </div>
                                ))}
                                <div className="mt-1" style={{ fontFamily: "'Outfit', sans-serif", fontSize: '10px', color: 'var(--text-muted)' }}>
                                    Click to open chart
                                </div>
                            </>
                        ) : (
                            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '11px', color: 'var(--text-secondary)' }}>
                                {tooltip.others.length} smaller stocks in {tooltip.sector}
                                <div className="mt-0.5" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                    Click to expand the sector
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Treemap;
