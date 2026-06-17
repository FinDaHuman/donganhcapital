import React from 'react';

/* ─── Skeleton shimmer block ─── */
export const SkeletonBlock = ({ className = '' }) => (
    <div className={`relative overflow-hidden rounded-xl bg-[#1a1d22] ${className}`}>
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
);

export const SkeletonCard = ({ className = '' }) => (
    <div className={`rounded-2xl border border-[#1e2128] bg-[#0e1015] p-5 space-y-3 ${className}`}>
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-8 w-20" />
        <SkeletonBlock className="h-3 w-32" />
    </div>
);

export const SkeletonChart = ({ className = '' }) => (
    <div className={`rounded-2xl border border-[#1e2128] bg-[#0e1015] p-5 space-y-4 ${className}`}>
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-[200px] w-full" />
    </div>
);

export const SkeletonDashboard = ({ className = '' }) => (
    <div className={`flex-1 w-full flex flex-col p-2 gap-2 ${className}`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 w-full shrink-0 gap-2">
            <SkeletonCard className="rounded-lg h-[92px] border-[rgba(201,169,110,0.1)] p-3 flex flex-col justify-center space-y-2 bg-[var(--bg-surface)]" />
            <SkeletonCard className="rounded-lg h-[92px] border-[rgba(201,169,110,0.1)] p-3 flex flex-col justify-center space-y-2 bg-[var(--bg-surface)]" />
            <SkeletonCard className="rounded-lg h-[92px] border-[rgba(201,169,110,0.1)] p-3 flex flex-col justify-center space-y-2 bg-[var(--bg-surface)]" />
            <SkeletonCard className="rounded-lg h-[92px] border-[rgba(201,169,110,0.1)] p-3 flex flex-col justify-center space-y-2 bg-[var(--bg-surface)]" />
        </div>
        <div className="flex-1 rounded-sm relative min-h-[300px] sm:min-h-[400px]">
            <SkeletonBlock className="absolute inset-0 w-full h-full rounded-sm" />
        </div>
    </div>
);
