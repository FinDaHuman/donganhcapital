/**
 * AuthContext — Global authentication state for DongAnh Capital.
 *
 * Auth model:
 * - httpOnly cookies are the source of truth (never expose tokens to JS)
 * - sessionStorage holds a non-sensitive user profile cache (email, name, tier)
 *   as a stale-while-revalidate hint to survive Render.com cold starts (~50s)
 * - Background /api/auth/me always runs on mount to verify the cookie is still valid
 * - On real 401: clear cache + treat as logged out
 * - On network error / timeout (cold start): keep cached user — cookie is still valid,
 *   server just hasn't finished waking up yet
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API_BASE = (() => {
    let url = import.meta.env.VITE_API_URL || 'https://api.donganhcapital.com/api';
    url = url.replace(/\/api\/?$/, '');
    return url;
})();

// Create axios instance with credentials (for httpOnly cookies)
const authApi = axios.create({
    baseURL: API_BASE,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
});

// Cross-tab refresh coordination: when one tab rotates the tokens, broadcast
// so other tabs know to skip their own refresh and re-check /me instead.
let _broadcastChannel = null;
try { _broadcastChannel = new BroadcastChannel('dac_auth'); } catch { /* Safari <15.4 */ }

// Interceptor: auto-refresh on 401
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error) => {
    failedQueue.forEach((prom) => {
        if (error) prom.reject(error);
        else prom.resolve();
    });
    failedQueue = [];
};

authApi.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            if (originalRequest.url?.includes('/auth/refresh') ||
                originalRequest.url?.includes('/auth/login') ||
                originalRequest.url?.includes('/auth/register') ||
                originalRequest.url?.includes('/auth/google/callback')) {
                return Promise.reject(error);
            }

            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(() => authApi(originalRequest));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                await authApi.post('/api/auth/refresh');
                _broadcastChannel?.postMessage({ type: 'tokens_refreshed' });
                processQueue(null);
                return authApi(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError);
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);


// ── Session hint cookie ──
// Backend sets a non-httpOnly "dac_session=1" cookie alongside the httpOnly auth
// cookies (and clears it on logout). It carries no token and no PII — it only lets
// us answer "could this browser be logged in?" WITHOUT a network round-trip. When it
// is absent we know there's no session, so we skip the /api/auth/me + /api/auth/refresh
// bootstrap entirely — removing the 2 guaranteed 401s every anonymous page load used
// to make. The httpOnly cookies remain the sole source of truth for actual auth.
const SESSION_HINT_COOKIE = 'dac_session';

const hasSessionHint = () => {
    try {
        return document.cookie
            .split('; ')
            .some((c) => c.startsWith(`${SESSION_HINT_COOKIE}=`));
    } catch {
        return false;
    }
};


// ── Session cache helpers (non-sensitive profile data only, never tokens) ──
const CACHE_KEY = 'dac_user_profile';

const readCache = () => {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeCache = (user) => {
    try {
        if (user) sessionStorage.setItem(CACHE_KEY, JSON.stringify(user));
        else sessionStorage.removeItem(CACHE_KEY);
    } catch {}
};


// ── Error normalization ──
// FastAPI returns error bodies in two shapes:
//   • HTTPException     → detail is a string  ("Invalid email or password")
//   • 422 validation    → detail is an ARRAY of { loc, msg, type } objects
// Passing the array straight into setError() and rendering it in JSX throws
// "Objects are not valid as a React child", which unmounts the (un-bounded)
// AuthPage and leaves a blank screen. Always collapse detail to a string.
const extractError = (err, fallback) => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    const clean = (m) => m.replace(/^Value error,\s*/i, ''); // Pydantic v2 prefix
    if (Array.isArray(detail)) {
        const msg = detail
            .map((e) => (typeof e?.msg === 'string' ? clean(e.msg) : null))
            .filter(Boolean)
            .join(' ');
        if (msg) return msg;
    }
    if (detail && typeof detail === 'object' && typeof detail.msg === 'string') {
        return clean(detail.msg);
    }
    return fallback;
};


// ── Context ──
const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};


export const AuthProvider = ({ children }) => {
    // Initialize immediately from sessionStorage so logged-in users never see
    // "Sign In" buttons — even while the background /api/auth/me is running or
    // the Render server is cold-starting.
    const cachedUser = readCache();
    const [user, setUser] = useState(cachedUser);
    // Skip loading state entirely if we already have cached data
    const [loading, setLoading] = useState(!cachedUser);
    const [error, setError] = useState(null);
    const initialCheckDone = useRef(false);
    // Prevents checkAuth's catch from clearing state after a concurrent login
    // has already succeeded. Set synchronously (before the first await) in each
    // login function so it's always true before checkAuth's two-round-trip chain
    // can reach its catch block. Reset only on login failure, never on success.
    const loginInProgress = useRef(false);

    // Check auth status on mount — always runs in the background to verify the
    // httpOnly cookie is still valid and refresh subscription/tier data.
    useEffect(() => {
        if (initialCheckDone.current) return;
        initialCheckDone.current = true;

        const checkAuth = async () => {
            // Fast path for logged-out visitors: with no session hint cookie AND no
            // cached profile, this browser has no session to validate. Skip the
            // /me + /refresh round-trips (2 guaranteed 401s) and settle as logged out.
            // We also require no cached profile so that users already logged in BEFORE
            // this hint cookie existed (no hint yet) still validate via /me and
            // transparently re-acquire the hint on their next token refresh.
            if (!hasSessionHint() && !cachedUser) {
                setLoading(false);
                return;
            }

            try {
                const { data } = await authApi.get('/api/auth/me');
                setUser(data.user);
                writeCache(data.user);
            } catch (err) {
                const isRealAuthError =
                    err.response?.status === 401 || err.response?.status === 403;

                // Skip clearing state if a login already completed while this
                // chain was in flight (race: /me → interceptor refresh → catch
                // can lag behind a concurrent loginWithGoogle resolving first).
                if (isRealAuthError && !loginInProgress.current) {
                    setUser(null);
                    writeCache(null);
                }
                // Network error / timeout (Render cold start): keep the cached
                // user shown in the UI. The cookie is still valid; the server
                // just hasn't woken up yet. The next real API call will succeed
                // once the server is warm.
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, []);

    // Listen for token rotations from other tabs. When a sibling tab refreshes,
    // re-validate /me using the fresh cookies it set so this tab stays logged in
    // without needing its own (now-stale) refresh attempt.
    useEffect(() => {
        if (!_broadcastChannel) return;
        const handleMessage = (event) => {
            if (event.data?.type !== 'tokens_refreshed') return;
            authApi.get('/api/auth/me').then(({ data }) => {
                setUser(data.user);
                writeCache(data.user);
            }).catch(() => {});
        };
        _broadcastChannel.addEventListener('message', handleMessage);
        return () => _broadcastChannel.removeEventListener('message', handleMessage);
    }, []);

    // ── Login with email/password ──
    const login = useCallback(async (email, password) => {
        setError(null);
        loginInProgress.current = true;
        try {
            const { data } = await authApi.post('/api/auth/login', { email, password });
            setUser(data.user);
            writeCache(data.user);
            return { success: true, user: data.user };
        } catch (err) {
            loginInProgress.current = false;
            const message = extractError(err, 'Login failed. Please try again.');
            setError(message);
            return { success: false, error: message };
        }
    }, []);

    // ── Register with email/password ──
    const register = useCallback(async (email, password, fullName, consent = {}) => {
        setError(null);
        loginInProgress.current = true;
        try {
            const { data } = await authApi.post('/api/auth/register', {
                email,
                password,
                full_name: fullName || null,
                // Proof-of-consent (Luật 91/2025). The version sent is the one the
                // user actually saw, so a stale cached SPA records a stale version
                // and gets re-prompted rather than silently recording the current one.
                ...consent,
            });
            setUser(data.user);
            writeCache(data.user);
            return { success: true, user: data.user };
        } catch (err) {
            loginInProgress.current = false;
            const message = extractError(err, 'Registration failed. Please try again.');
            setError(message);
            return { success: false, error: message };
        }
    }, []);

    // ── Google OAuth ──
    const getGoogleAuthUrl = useCallback(async () => {
        try {
            const { data } = await authApi.get('/api/auth/google/url');
            return data.url;
        } catch {
            return null;
        }
    }, []);

    const loginWithGoogle = useCallback(async (code, state, consent = {}) => {
        setError(null);
        loginInProgress.current = true;
        try {
            // `consent` is replayed from sessionStorage: the OAuth redirect
            // destroys React state, so the checkbox result has to survive it out
            // of band. It is ignored by the backend for existing accounts.
            //
            // `state` is the anti-CSRF nonce Google echoes back on the redirect.
            // The backend compares it against an httpOnly cookie it set when it
            // built the consent URL, which is what stops someone completing this
            // flow with their own code in your browser. Nothing to store here —
            // we only forward what came back in the URL.
            const { data } = await authApi.post('/api/auth/google/callback', { code, state, ...consent });
            setUser(data.user);
            writeCache(data.user);
            return { success: true, user: data.user };
        } catch (err) {
            loginInProgress.current = false;
            const message = extractError(err, 'Google sign-in failed.');
            setError(message);
            return { success: false, error: message };
        }
    }, []);

    // ── Forgot password (request reset link) ──
    // Backend returns an opaque success regardless of whether the email exists,
    // so the UI shows the same confirmation either way.
    const forgotPassword = useCallback(async (email) => {
        try {
            const { data } = await authApi.post('/api/auth/forgot-password', { email });
            return { success: true, message: data.message };
        } catch (err) {
            const message = extractError(err, 'Something went wrong. Please try again.');
            return { success: false, error: message };
        }
    }, []);

    // ── Reset password (consume token, set new password) ──
    const resetPassword = useCallback(async (token, password) => {
        try {
            const { data } = await authApi.post('/api/auth/reset-password', { token, password });
            return { success: true, message: data.message };
        } catch (err) {
            const message = extractError(err, 'Could not reset password. The link may have expired.');
            return { success: false, error: message };
        }
    }, []);

    // ── Logout ──
    const logout = useCallback(async () => {
        try {
            await authApi.post('/api/auth/logout');
        } catch {
            // Logout should always succeed on client side
        }
        setUser(null);
        writeCache(null);
        setError(null);
    }, []);

    // ── Refresh user from server (e.g. after subscription upgrade) ──
    const refreshUser = useCallback(async () => {
        try {
            const { data } = await authApi.get('/api/auth/me');
            setUser(data.user);
            writeCache(data.user);
            return data.user;
        } catch {
            return null;
        }
    }, []);

    // ── Email verification ──
    const verifyEmail = useCallback(async (token) => {
        try {
            const { data } = await authApi.post('/api/auth/verify-email', { token });
            await refreshUser();
            return { success: true, message: data.message };
        } catch (err) {
            const message = extractError(err, 'Verification failed. The link may be invalid or expired.');
            return { success: false, error: message };
        }
    }, [refreshUser]);

    const resendVerification = useCallback(async () => {
        try {
            const { data } = await authApi.post('/api/auth/resend-verification');
            return { success: true, message: data.message };
        } catch (err) {
            const message = extractError(err, 'Could not send verification email. Please try again.');
            return { success: false, error: message };
        }
    }, []);

    // ── Update profile ──
    const updateProfile = useCallback(async (updates) => {
        try {
            const { data } = await authApi.put('/api/auth/me', updates);
            setUser(data.user);
            writeCache(data.user);
            return { success: true, user: data.user };
        } catch (err) {
            const message = extractError(err, 'Update failed.');
            return { success: false, error: message };
        }
    }, []);

    const value = {
        user,
        isAuthenticated: !!user,
        loading,
        error,
        login,
        register,
        getGoogleAuthUrl,
        loginWithGoogle,
        forgotPassword,
        resetPassword,
        logout,
        updateProfile,
        refreshUser,
        verifyEmail,
        resendVerification,
        authApi,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
