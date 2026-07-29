/**
 * Cookie-consent record, kept in localStorage.
 *
 * Only strictly-necessary cookies exist today (the three auth cookies), so this
 * is a notice with a recorded choice rather than a true gate. It is wired up in
 * advance so that if analytics is ever added, it can be made conditional on
 * `hasConsent('analytics')` without revisiting the consent mechanics.
 */

const KEY = 'dac_cookie_consent';

// Bump to re-prompt everyone — e.g. when a new cookie category is introduced.
const VERSION = 1;

const listeners = new Set();

export const readConsent = () => {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.v === VERSION ? parsed : null;
    } catch {
        // Blocked or corrupt storage reads as "not yet answered".
        return null;
    }
};

export const writeConsent = ({ analytics }) => {
    const record = {
        v: VERSION,
        necessary: true,     // cannot be declined; sign-in would not work
        analytics: !!analytics,
        ts: Date.now(),
    };
    try {
        localStorage.setItem(KEY, JSON.stringify(record));
    } catch {
        // Not persisting is survivable — the banner simply reappears next visit.
    }
    listeners.forEach((fn) => {
        try { fn(record); } catch { /* a bad listener must not break the rest */ }
    });
    return record;
};

/** `necessary` is always true; every other category needs an explicit opt-in. */
export const hasConsent = (category) =>
    category === 'necessary' || Boolean(readConsent()?.[category]);

/** Subscribe to consent changes so opting in mid-session takes effect without a reload. */
export const onConsentChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};
