/**
 * ResetPasswordPage — consume a password-reset token and set a new password.
 *
 * Reached via the link emailed by the backend:
 *   https://donganhcapital.com/reset-password?token=<raw_token>
 * App.jsx routes the `/reset-password` path here; the token is read from the
 * query string. On success the user is sent back to the login screen.
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ResetPasswordPage = ({ onTabChange }) => {
    const { resetPassword, logout } = useAuth();

    const [token, setToken] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    // Pull the token out of the URL once, then scrub it so it isn't left in
    // history / shoulder-surfed from the address bar.
    useEffect(() => {
        const t = new URLSearchParams(window.location.search).get('token');
        if (t) {
            setToken(t);
            window.history.replaceState({}, document.title, '/reset-password');
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
            setError('Password must be at least 8 characters with an uppercase letter, a lowercase letter, and a number.');
            return;
        }

        setLoading(true);
        const result = await resetPassword(token, password);
        setLoading(false);
        if (result.success) {
            // Reset revokes all sessions server-side; clear any stale local cache so
            // a previously-logged-in user isn't bounced to a now-401 dashboard.
            await logout();
            setDone(true);
        } else {
            setError(result.error);
        }
    };

    return (
        <div
            className="w-full min-h-screen flex items-center justify-center relative overflow-hidden"
            style={{ backgroundColor: 'var(--bg-void)', fontFamily: "'Outfit', sans-serif" }}
        >
            <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] z-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(201,169,110,0.08) 0%, transparent 70%)', filter: 'blur(40px)' }}
            />

            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 w-full max-w-[420px] mx-4"
            >
                <div className="flex items-center justify-center gap-2.5 mb-8">
                    <img src="/assets/NoBGLogoNoName.png" alt="DongAnh Capital" className="h-8 w-8 object-contain" style={{ filter: 'drop-shadow(0 0 8px rgba(201,169,110,0.3))' }} />
                    <span className="font-semibold text-sm" style={{ letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                        DongAnh<span style={{ color: 'var(--gold-primary)' }}> Capital</span>
                    </span>
                </div>

                <div
                    className="rounded-3xl p-7 sm:p-8 relative overflow-hidden"
                    style={{
                        background: 'linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)',
                        border: '1px solid rgba(201,169,110,0.15)',
                        boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 80px -20px rgba(201,169,110,0.08)',
                    }}
                >
                    <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, var(--gold-primary), transparent)' }} />

                    {done ? (
                        <div className="text-center py-4">
                            <div className="flex justify-center mb-4">
                                <CheckCircle2 size={40} style={{ color: 'var(--market-up)' }} />
                            </div>
                            <h1 className="mb-2" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Password Reset
                            </h1>
                            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                                Your password has been updated. You can now sign in with your new password.
                            </p>
                            <button
                                onClick={() => onTabChange && onTabChange('login')}
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm cursor-pointer"
                                style={{ background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-bright, #E8C97A))', color: 'var(--bg-void)', border: 'none' }}
                            >
                                Go to Sign In <ArrowRight size={16} />
                            </button>
                        </div>
                    ) : !token ? (
                        <div className="text-center py-4">
                            <div className="flex justify-center mb-4">
                                <AlertCircle size={40} style={{ color: '#ef4444' }} />
                            </div>
                            <h1 className="mb-2" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Invalid Link
                            </h1>
                            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                                This password reset link is missing or invalid. Please request a new one from the sign-in page.
                            </p>
                            <button
                                onClick={() => onTabChange && onTabChange('login')}
                                className="text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                                style={{ color: 'var(--gold-primary)', background: 'none', border: 'none' }}
                            >
                                <ArrowLeft size={12} /> Back to Sign In
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="text-center mb-6">
                                <h1 className="mb-2" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '28px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Set a New Password
                                </h1>
                                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                    Choose a strong password for your account.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-3.5">
                                <div>
                                    <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                                        New Password
                                    </label>
                                    <div className="relative">
                                        <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                            placeholder="Min 8 chars, uppercase, number"
                                            required
                                            minLength={8}
                                            maxLength={128}
                                            className="w-full pl-10 pr-12 py-3 rounded-xl text-sm focus:outline-none transition-all"
                                            style={{ background: 'var(--bg-void)', border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(201,169,110,0.15)'}`, color: 'var(--text-primary)' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 cursor-pointer"
                                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}
                                            tabIndex={-1}
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                                        Confirm Password
                                    </label>
                                    <div className="relative">
                                        <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={confirmPassword}
                                            onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                                            placeholder="••••••••"
                                            required
                                            maxLength={128}
                                            className="w-full pl-10 pr-4 py-3 rounded-xl text-sm focus:outline-none transition-all"
                                            style={{ background: 'var(--bg-void)', border: `1px solid ${confirmPassword && password !== confirmPassword ? 'rgba(239,68,68,0.4)' : 'rgba(201,169,110,0.15)'}`, color: 'var(--text-primary)' }}
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                        <AlertCircle size={14} className="shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                                        <span className="text-xs" style={{ color: '#ef4444' }}>{error}</span>
                                    </div>
                                )}

                                <motion.button
                                    type="submit"
                                    disabled={loading}
                                    whileHover={!loading ? { scale: 1.01 } : {}}
                                    whileTap={!loading ? { scale: 0.98 } : {}}
                                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm cursor-pointer"
                                    style={{ background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-bright, #E8C97A))', color: 'var(--bg-void)', border: 'none', opacity: loading ? 0.7 : 1 }}
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : (<>Reset Password <ArrowRight size={16} /></>)}
                                </motion.button>

                                <div className="text-center mt-2">
                                    <button
                                        type="button"
                                        onClick={() => onTabChange && onTabChange('login')}
                                        className="text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                                        style={{ color: 'var(--gold-primary)', background: 'none', border: 'none' }}
                                    >
                                        <ArrowLeft size={12} /> Back to Sign In
                                    </button>
                                </div>
                            </form>
                        </>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default ResetPasswordPage;
