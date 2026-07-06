// Shared helpers for dashboard panels

export const formatVolume = (vol) => {
    if (vol >= 1000000000) return (vol / 1000000000).toFixed(2) + 'B';
    if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
    if (vol >= 1000) return (vol / 1000).toFixed(2) + 'K';
    return String(vol);
};

export const formatChange = (pct, digits = 2) =>
    `${pct > 0 ? '+' : ''}${pct.toFixed(digits)}%`;

export const changeColor = (pct) =>
    pct > 0.05 ? 'var(--market-up)' : pct < -0.05 ? 'var(--market-down)' : 'var(--market-neutral)';

// Resolve a CSS custom property to its concrete value (for canvas-based libs
// like lightweight-charts that can't consume var() strings)
export const cssVar = (name, fallback) => {
    if (typeof window === 'undefined') return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
};

// Hex → rgba string, for canvas-based libs that need alpha variants of tokens
export const withAlpha = (hex, alpha) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

export const PANEL_STYLE = {
    background: 'var(--bg-surface)',
    border: '1px solid rgba(201,169,110,0.1)',
};

export const PANEL_LABEL_STYLE = {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
};

export const MONO = "'DM Mono', monospace";
