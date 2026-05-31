import React from 'react';
import { motion } from 'framer-motion';

/* ── Four-Pointed Star SVG (logo motif) ── */
export const StarMark = ({ size = 16, color = 'var(--gold-primary)', className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className}>
        <path
            d="M8 0 L9 6.5 L16 8 L9 9.5 L8 16 L7 9.5 L0 8 L7 6.5 Z"
            fill={color}
        />
    </svg>
);

/* ── Branded Gold Loading Spinner ── */
export const BrandedLoader = ({ label = 'Loading...' }) => (
    <div className="flex flex-col items-center gap-5">
        {/* Rotating ring with star */}
        <div className="relative w-14 h-14">
            {/* Outer rotating ring */}
            <svg
                className="absolute inset-0 w-full h-full animate-spin"
                style={{ animationDuration: '2s' }}
                viewBox="0 0 56 56"
                fill="none"
            >
                <circle
                    cx="28" cy="28" r="24"
                    stroke="rgba(201,169,110,0.15)"
                    strokeWidth="2"
                />
                <path
                    d="M28 4 A24 24 0 0 1 52 28"
                    stroke="url(#goldArc)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                />
                <defs>
                    <linearGradient id="goldArc" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#E8C97A" />
                        <stop offset="100%" stopColor="rgba(201,169,110,0)" />
                    </linearGradient>
                </defs>
            </svg>
            {/* Center star pulsing */}
            <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                    animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.1, 0.8] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                    <StarMark size={20} />
                </motion.div>
            </div>
        </div>
        <motion.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--gold-muted)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
            }}
        >
            {label}
        </motion.span>
    </div>
);
