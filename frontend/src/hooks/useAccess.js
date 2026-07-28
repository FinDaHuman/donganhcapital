import { useAuth } from '../context/AuthContext';

/**
 * The app's access rules, in one place.
 *
 *   canUseApp — may this account open a product tab at all?
 *               Signed in AND email verified. Enforced once in App.jsx for
 *               every gated tab, so a new tab cannot forget it.
 *
 * There is no longer a subscription dimension. The paid tiers (Pro / Premium)
 * were removed along with the rest of the commerce surface: DongAnh Capital is a
 * non-commercial academic project, so every verified account gets every feature.
 * `hasTier` is kept — always true — so the call sites that still ask for it do
 * not need touching, and so re-introducing tiers later is a one-file change.
 *
 * This is a UI concern only. The backend is the real boundary: it applies the
 * same "signed in and verified" test in utils/security.py::has_feature_access.
 */
export function useAccess() {
    const { user, isAuthenticated, loading } = useAuth();

    const emailVerified = user?.email_verified === true;

    return {
        // True while the session is still being resolved. Callers must render a
        // placeholder rather than a gate during this window, otherwise a
        // signed-in user with no cached profile sees the sign-in screen flash
        // before /me comes back.
        authLoading: loading,
        isAuthenticated,
        emailVerified,
        canUseApp: isAuthenticated && emailVerified,
        hasTier: true,
    };
}

export default useAccess;
