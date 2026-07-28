import { useAuth } from '../context/AuthContext';

/**
 * The app's access rules, in one place.
 *
 * Two questions that used to be tangled together:
 *
 *   canUseApp  — may this account open a product tab at all?
 *                Signed in AND email verified. Enforced once in App.jsx for
 *                every gated tab, so a new tab cannot forget it.
 *
 *   hasTier    — does it hold the subscription a paid feature needs?
 *                Mirrors backend utils/security.py::has_feature_access: while
 *                BYPASS_PAYMENT is on (the paywall is currently off) any
 *                verified account qualifies; otherwise it needs pro/premium.
 *
 * Each tab used to inline `isPro = bypass ? email_verified : tierCheck`, which
 * made "has Pro" and "has a verified email" the same test whenever the paywall
 * was off — and left the four tabs with no paid feature (Dashboard, Chart, AI
 * Analyst, Data Analyst) with no gate at all.
 *
 * This is a UI concern only. The backend is the real boundary: paid endpoints
 * check has_feature_access themselves, while public market endpoints stay
 * public regardless of what this hook returns.
 */
export function useAccess(requiredTier = null) {
    const { user, isAuthenticated, loading } = useAuth();

    // Server-side feature flag, delivered on the /me payload — not a DB column.
    const bypassPayment = user?.bypass_payment === true;
    const emailVerified = user?.email_verified === true;
    const tier = user?.subscription_tier ?? 'free';

    let hasTier = true;
    if (requiredTier && !bypassPayment) {
        hasTier = requiredTier === 'premium'
            ? tier === 'premium'
            : tier === 'pro' || tier === 'premium';
    }

    return {
        // True while the session is still being resolved. Callers must render a
        // placeholder rather than a gate during this window, otherwise a
        // signed-in user with no cached profile sees the sign-in screen flash
        // before /me comes back.
        authLoading: loading,
        isAuthenticated,
        emailVerified,
        bypassPayment,
        tier,
        canUseApp: isAuthenticated && emailVerified,
        hasTier,
    };
}

export default useAccess;
