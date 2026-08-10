import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, RotateCw } from 'lucide-react';
import {
    subscribeWake,
    getWakeState,
    getWakingSince,
    isWakeToastSuppressed,
    WAKE_HINT_AFTER_MS,
    WAKE_STALE_AFTER_MS,
} from '../services/serverWake';

/**
 * Tells the visitor, anywhere in the app, that the backend is starting up.
 *
 * The API sleeps when idle and takes ~2 minutes to wake, so a first visit after
 * a quiet period is slow no matter which tab it lands on. Without this the wait
 * is indistinguishable from a broken site; with it, it reads as a deliberate
 * free-tier trade-off.
 *
 * Three decisions worth keeping:
 *
 * - Shown by default, hidden once the server answers. This backend is asleep
 *   most of the time, so "asleep" is the normal case. Earlier versions started
 *   silent and hunted for evidence that the wait was real — waiting for a failed
 *   request, then for a 5s timer — and both delivered the explanation only after
 *   the user had been watching a spinner for a while. The only delay left is
 *   WAKE_HINT_AFTER_MS, purely to avoid a blink when the server is already warm.
 *
 * - A floating toast, not a strip at the top. The landing page renders its own
 *   fixed header (it is a chromeless tab) which drew straight over an in-flow
 *   banner. A fixed overlay owes nothing to any view's layout.
 *
 * - It matters most to someone who is NOT signed in. The Dashboard has a richer
 *   wake screen of its own, but that sits behind the auth gate (App.jsx renders
 *   Dashboard only when canUseApp), so a first-time visitor never reaches it.
 *   For them this toast is the only explanation there is.
 */
const ServerWakeBanner = () => {
    const [, bump] = useState(0);
    const [state, setState] = useState(getWakeState);
    const [since, setSince] = useState(getWakingSince);
    const [now, setNow] = useState(Date.now());
    const [pastAntiFlash, setPastAntiFlash] = useState(false);

    useEffect(() => subscribeWake((nextState, nextSince) => {
        setState(nextState);
        setSince(nextSince);
        bump((n) => n + 1); // suppression may have changed too
    }), []);

    // The anti-flash delay is far shorter than the 1s tick below, so it needs
    // its own timer rather than riding on it.
    useEffect(() => {
        if (state !== 'waking' || !since) {
            setPastAntiFlash(false);
            return;
        }
        const remaining = WAKE_HINT_AFTER_MS - (Date.now() - since);
        if (remaining <= 0) {
            setPastAntiFlash(true);
            return;
        }
        const t = setTimeout(() => setPastAntiFlash(true), remaining);
        return () => clearTimeout(t);
    }, [state, since]);

    // Only tick while a wake is actually in progress.
    useEffect(() => {
        if (state !== 'waking') return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [state]);

    if (state !== 'waking' || !since) return null;
    if (isWakeToastSuppressed()) return null;
    if (!pastAntiFlash) return null;

    // Clamped: the 1s tick can lag a `since` that moved, and a counter that
    // briefly reads "-1s" destroys confidence in everything next to it.
    const waited = Math.max(0, now - since);
    const stale = waited >= WAKE_STALE_AFTER_MS;
    const seconds = Math.floor(waited / 1000);

    return (
        <div
            // Shape follows the content: a pill only reads as a pill on one
            // line. On a phone the copy wraps, so it becomes a rounded card
            // spanning the viewport instead of an ellipse full of small text.
            className="fixed left-1/2 flex items-start sm:items-center gap-2.5 px-3.5 sm:px-4 py-2.5 rounded-2xl sm:rounded-full w-[calc(100vw-1.5rem)] sm:w-auto"
            style={{
                // Ride above the cookie bar, whatever height it happens to be.
                // It stacks vertically on narrow screens and grows to ~140px,
                // which a fixed offset would sit inside — and since this toast
                // outranks it in z-order, that covered its Accept button.
                bottom: 'calc(var(--cookie-bar-height, 0px) + 1rem)',
                transform: 'translateX(-50%)',
                zIndex: 9999,
                maxWidth: '34rem',
                background: 'var(--bg-surface)',
                border: `1px solid ${stale ? 'rgba(224,85,85,0.45)' : 'rgba(201,169,110,0.35)'}`,
                boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
                fontFamily: "'Outfit', sans-serif",
            }}
            role="status"
            aria-live="polite"
        >
            {stale ? (
                <>
                    <AlertCircle size={14} className="mt-px sm:mt-0" style={{ color: 'var(--market-down)', flexShrink: 0 }} />
                    <span className="flex-1 text-xs sm:text-[13px]" style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                        The server is taking longer than usual to respond.
                    </span>
                    <button
                        onClick={() => window.location.reload()}
                        className="flex items-center gap-1.5 text-xs rounded-full px-3 py-1 cursor-pointer"
                        style={{
                            color: 'var(--gold-primary)',
                            background: 'var(--gold-dim)',
                            border: '1px solid rgba(201,169,110,0.35)',
                            fontFamily: "'Outfit', sans-serif",
                            flexShrink: 0,
                        }}
                    >
                        <RotateCw size={12} />
                        Reload
                    </button>
                </>
            ) : (
                <>
                    <Loader2
                        size={14}
                        className="animate-spin mt-px sm:mt-0"
                        style={{ color: 'var(--gold-primary)', flexShrink: 0 }}
                    />
                    {/* Short copy on a phone: the full sentence wrapped to four
                        cramped lines. The trade-off it explains still lands. */}
                    <span className="flex-1 text-xs sm:text-[13px]" style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                        <span className="sm:hidden">
                            Starting the server — the first load can take up to two minutes.
                        </span>
                        <span className="hidden sm:inline">
                            Starting the server — it sleeps when idle on free-tier hosting.
                            {' '}This first load can take up to two minutes.
                        </span>
                    </span>
                    <span
                        className="text-xs tabular-nums mt-px sm:mt-0"
                        style={{ color: 'var(--gold-primary)', opacity: 0.8, flexShrink: 0 }}
                    >
                        {seconds}s
                    </span>
                </>
            )}
        </div>
    );
};

export default ServerWakeBanner;
