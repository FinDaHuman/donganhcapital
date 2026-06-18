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
                originalRequest.url?.includes('/auth/register')) {
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

    // Check auth status on mount — always runs in the background to verify the
    // httpOnly cookie is still valid and refresh subscription/tier data.
    useEffect(() => {
        if (initialCheckDone.current) return;
        initialCheckDone.current = true;

        const checkAuth = async () => {
            try {
                const { data } = await authApi.get('/api/auth/me');
                setUser(data.user);
                writeCache(data.user);
            } catch (err) {
                const isRealAuthError =
                    err.response?.status === 401 || err.response?.status === 403;

                if (isRealAuthError) {
                    // Cookie expired or invalid — really logged out
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

    // ── Login with email/password ──
    const login = useCallback(async (email, password) => {
        setError(null);
        try {
            const { data } = await authApi.post('/api/auth/login', { email, password });
            setUser(data.user);
            writeCache(data.user);
            return { success: true, user: data.user };
        } catch (err) {
            const message = err.response?.data?.detail || 'Login failed. Please try again.';
            setError(message);
            return { success: false, error: message };
        }
    }, []);

    // ── Register with email/password ──
    const register = useCallback(async (email, password, fullName) => {
        setError(null);
        try {
            const { data } = await authApi.post('/api/auth/register', {
                email,
                password,
                full_name: fullName || null,
            });
            setUser(data.user);
            writeCache(data.user);
            return { success: true, user: data.user };
        } catch (err) {
            const message = err.response?.data?.detail || 'Registration failed. Please try again.';
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

    const loginWithGoogle = useCallback(async (code) => {
        setError(null);
        try {
            const { data } = await authApi.post('/api/auth/google/callback', { code });
            setUser(data.user);
            writeCache(data.user);
            return { success: true, user: data.user };
        } catch (err) {
            const message = err.response?.data?.detail || 'Google sign-in failed.';
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
            const message = err.response?.data?.detail || 'Something went wrong. Please try again.';
            return { success: false, error: message };
        }
    }, []);

    // ── Reset password (consume token, set new password) ──
    const resetPassword = useCallback(async (token, password) => {
        try {
            const { data } = await authApi.post('/api/auth/reset-password', { token, password });
            return { success: true, message: data.message };
        } catch (err) {
            const message = err.response?.data?.detail || 'Could not reset password. The link may have expired.';
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

    // ── Update profile ──
    const updateProfile = useCallback(async (updates) => {
        try {
            const { data } = await authApi.put('/api/auth/me', updates);
            setUser(data.user);
            writeCache(data.user);
            return { success: true, user: data.user };
        } catch (err) {
            const message = err.response?.data?.detail || 'Update failed.';
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
        authApi,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
