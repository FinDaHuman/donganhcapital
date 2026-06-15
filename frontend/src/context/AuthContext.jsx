/**
 * AuthContext — Global authentication state for DongAnh Capital.
 * 
 * Features:
 * - Cookie-based JWT auth (httpOnly cookies, no localStorage tokens)
 * - Google OAuth support
 * - Auto-refresh on mount (check /api/auth/me)
 * - Token refresh on 401 responses
 * - Provides: user, isAuthenticated, loading, login, register, loginWithGoogle, logout
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API_BASE = (() => {
    let url = import.meta.env.VITE_API_URL || 'https://donganhcapital.onrender.com/api';
    // Strip /api suffix since our auth endpoints already include /api prefix
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
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const initialCheckDone = useRef(false);

    // Check auth status on mount
    useEffect(() => {
        if (initialCheckDone.current) return;
        initialCheckDone.current = true;

        const checkAuth = async () => {
            try {
                const { data } = await authApi.get('/api/auth/me');
                setUser(data.user);
            } catch {
                setUser(null);
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
            return { success: true, user: data.user };
        } catch (err) {
            const message = err.response?.data?.detail || 'Google sign-in failed.';
            setError(message);
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
        setError(null);
    }, []);

    // ── Update profile ──
    const updateProfile = useCallback(async (updates) => {
        try {
            const { data } = await authApi.put('/api/auth/me', updates);
            setUser(data.user);
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
        logout,
        updateProfile,
        authApi, // Expose for other components that need authenticated requests
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
