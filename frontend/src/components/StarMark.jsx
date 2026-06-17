import React from 'react';

/* ── Four-Pointed Star SVG (logo motif) ── */
export const StarMark = ({ size = 16, color = 'var(--gold-primary)', className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className}>
        <path
            d="M8 0 L9 6.5 L16 8 L9 9.5 L8 16 L7 9.5 L0 8 L7 6.5 Z"
            fill={color}
        />
    </svg>
);
