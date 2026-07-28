/**
 * Shared trade-history statistics and return formatting.
 *
 * BCD Signals and AI Analyst render the same stat cards over the same trade
 * shape, and the logic was copy-pasted into both. That is how "Best Trade"
 * ended up written as a hardcoded `+{value}%` in a hardcoded green class in
 * both files: on a set where every trade lost it rendered "+-7%" in green.
 *
 * Anything carrying a direction goes through formatSignedPercent +
 * returnToneClass, so the sign and the colour are always derived from the
 * value rather than assumed.
 */

export const EMPTY = '—';

const isBlank = (v) => v === null || v === undefined || Number.isNaN(Number(v));

/** Signed percentage: "+7.00%" / "-7.00%" / "0.00%", or "—" when unknown. */
export function formatSignedPercent(value, decimals = 2) {
    if (isBlank(value)) return EMPTY;
    const n = Number(value);
    return `${n > 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}

/** Unsigned percentage, for magnitudes like a win rate. */
export function formatPercent(value, decimals = 1) {
    if (isBlank(value)) return EMPTY;
    return `${Number(value).toFixed(decimals)}%`;
}

/** Day counts, without a trailing ".0" on whole numbers. */
export function formatDays(value, decimals = 1) {
    if (isBlank(value)) return EMPTY;
    return String(Number(Number(value).toFixed(decimals)));
}

/** Green at or above zero, red below, neutral when there is no value. */
export function returnToneClass(value) {
    if (isBlank(value)) return 'text-gray-500';
    return Number(value) >= 0 ? 'text-green-400' : 'text-red-400';
}

/** Green at or above `threshold`, red below, neutral when there is no value. */
export function rateToneClass(value, threshold = 50) {
    if (isBlank(value)) return 'text-gray-500';
    return Number(value) >= threshold ? 'text-green-400' : 'text-red-400';
}

/**
 * Portfolio statistics over an already-filtered trade list.
 *
 * Aggregates are null when nothing has closed yet, so the cards can show "—"
 * rather than a 0 that reads like a measured result — which matters now that
 * a confidence filter can select trades that have all yet to close.
 *
 * A TIMEOUT that ended in profit counts as a win; percentages are returned
 * unrounded, and rounding is left to the formatters.
 */
export function computeTradeStats(trades) {
    const closed = trades.filter((t) => ['TP', 'SL', 'TIMEOUT'].includes(t.status));
    const wins = trades.filter(
        (t) => t.status === 'TP' || (t.status === 'TIMEOUT' && t.return_pct != null && t.return_pct > 0)
    ).length;

    const returns = closed.map((t) => t.return_pct).filter((r) => r != null);
    const days = closed.map((t) => t.holding_days).filter((d) => d != null);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

    return {
        total_trades: trades.length,
        win_rate: closed.length > 0 ? (wins / closed.length) * 100 : null,
        avg_return: returns.length > 0 ? mean(returns) * 100 : null,
        best_return: returns.length > 0 ? Math.max(...returns) * 100 : null,
        avg_holding_days: days.length > 0 ? mean(days) : null,
    };
}
