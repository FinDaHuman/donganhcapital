/**
 * LoginPage — Premium authentication page for DongAnh Capital.
 * 
 * Features:
 * - Google OAuth sign-in (primary, prominent)
 * - Email/password login (secondary)
 * - Animated transitions with framer-motion
 * - Dark premium design matching DongAnh Capital brand
 * - Error handling with account lockout messages
 * - Toggle to registration form
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, User, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/* ── Google Icon SVG ── */
const GoogleIcon = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
);

/* ── Animation variants ── */
const pageVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.4, staggerChildren: 0.08 } },
    exit: { opacity: 0, transition: { duration: 0.2 } },
};

const itemVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const AuthPage = ({ onTabChange, initialMode = 'login' }) => {
    const { login, register, getGoogleAuthUrl, loginWithGoogle, forgotPassword, isAuthenticated, loading: authLoading } = useAuth();

    const [mode, setMode] = useState(initialMode); // 'login' | 'register' | 'forgot'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [loginFailed, setLoginFailed] = useState(false);

    // Handle Google OAuth callback (URL contains ?code=...)
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
            handleGoogleCallback(code);
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated && !authLoading) {
            onTabChange && onTabChange('dashboard');
        }
    }, [isAuthenticated, authLoading, onTabChange]);

    const handleGoogleSignIn = async () => {
        setError('');
        setLoading(true);
        try {
            const url = await getGoogleAuthUrl();
            if (url) {
                window.location.href = url;
            } else {
                setError('Google Sign-In is not configured yet. Please use email login.');
                setLoading(false);
            }
        } catch {
            setError('Failed to initiate Google Sign-In.');
            setLoading(false);
        }
    };

    const handleGoogleCallback = async (code) => {
        setLoading(true);
        setError('');
        const result = await loginWithGoogle(code);
        setLoading(false);
        if (result.success) {
            setSuccess('Welcome! Redirecting...');
            setTimeout(() => onTabChange && onTabChange('dashboard'), 800);
        } else {
            setError(result.error);
        }
    };

    const handleEmailSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (mode === 'register') {
            if (password !== confirmPassword) {
                setError('Passwords do not match.');
                return;
            }
            if (!agreedToTerms) {
                setError('Please agree to the Terms of Service.');
                return;
            }
        }

        setLoading(true);
        setLoginFailed(false);

        if (mode === 'login') {
            const result = await login(email, password);
            setLoading(false);
            if (result.success) {
                setSuccess('Welcome back! Redirecting...');
                setTimeout(() => onTabChange && onTabChange('dashboard'), 800);
            } else {
                setError(result.error);
                setLoginFailed(true);
            }
        } else {
            const result = await register(email, password, fullName);
            setLoading(false);
            if (result.success) {
                setSuccess('Account created! Redirecting...');
                setTimeout(() => onTabChange && onTabChange('dashboard'), 800);
            } else {
                setError(result.error);
            }
        }
    };

    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);
        const result = await forgotPassword(email);
        setLoading(false);
        if (result.success) {
            // Opaque message — same whether or not the email is registered.
            setSuccess(result.message || 'If an account exists for that email, a reset link is on its way.');
        } else {
            setError(result.error);
        }
    };

    const switchMode = () => {
        setMode(mode === 'login' ? 'register' : 'login');
        setError('');
        setSuccess('');
        setPassword('');
        setConfirmPassword('');
        setLoginFailed(false);
    };

    const goToMode = (next) => {
        setMode(next);
        setError('');
        setSuccess('');
        setPassword('');
        setConfirmPassword('');
        setLoginFailed(false);
    };

    return (
        <div
            className="w-full min-h-screen flex items-center justify-center relative overflow-hidden"
            style={{ backgroundColor: 'var(--bg-void)', fontFamily: "'Outfit', sans-serif" }}
        >
            {/* Background effects */}
            <div className="absolute inset-0 z-0" style={{ background: 'var(--bg-void)' }} />
            <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] z-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse at 50% 0%, rgba(201,169,110,0.08) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
            />
            <div
                className="absolute inset-0 z-0 pointer-events-none opacity-[0.02]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'repeat',
                    backgroundSize: '200px 200px',
                }}
            />

            {/* Auth Card */}
            <motion.div
                variants={pageVariants}
                initial="initial"
                animate="animate"
                className="relative z-10 w-full max-w-[420px] mx-4"
            >
                {/* Logo + Back */}
                <motion.div variants={itemVariants} className="flex items-center justify-between mb-8">
                    <button
                        onClick={() => onTabChange && onTabChange('home')}
                        className="flex items-center gap-2 text-sm cursor-pointer transition-colors"
                        style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif", background: 'none', border: 'none' }}
                    >
                        <ArrowLeft size={16} />
                        Back
                    </button>
                    <div className="flex items-center gap-2.5">
                        <img
                            src="/assets/NoBGLogoNoName.png"
                            alt="DongAnh Capital"
                            className="h-8 w-8 object-contain"
                            style={{ filter: 'drop-shadow(0 0 8px rgba(201,169,110,0.3))' }}
                        />
                        <span
                            className="font-semibold text-sm"
                            style={{ letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-primary)' }}
                        >
                            DongAnh<span style={{ color: 'var(--gold-primary)' }}> Capital</span>
                        </span>
                    </div>
                </motion.div>

                {/* Card */}
                <motion.div
                    variants={itemVariants}
                    className="rounded-3xl p-7 sm:p-8 relative overflow-hidden"
                    style={{
                        background: 'linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)',
                        border: '1px solid rgba(201,169,110,0.15)',
                        boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 80px -20px rgba(201,169,110,0.08)',
                    }}
                >
                    {/* Top gold line */}
                    <div
                        className="absolute top-0 left-0 right-0 h-[2px]"
                        style={{ background: 'linear-gradient(90deg, transparent, var(--gold-primary), transparent)' }}
                    />

                    {/* Header */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={mode}
                            initial={{ opacity: 0, x: mode === 'login' ? -20 : 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: mode === 'login' ? 20 : -20 }}
                            transition={{ duration: 0.25 }}
                            className="text-center mb-6"
                        >
                            <h1
                                className="mb-2"
                                style={{
                                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                                    fontSize: '28px',
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                }}
                            >
                                {mode === 'login' ? 'Welcome Back' : mode === 'register' ? 'Create Account' : 'Reset Password'}
                            </h1>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                {mode === 'login'
                                    ? 'Sign in to access your AI trading dashboard.'
                                    : mode === 'register'
                                        ? 'Join to unlock AI-powered market intelligence.'
                                        : "Enter your email and we'll send you a reset link."}
                            </p>
                        </motion.div>
                    </AnimatePresence>

                    {/* Forgot-password form (email only) */}
                    {mode === 'forgot' && (
                        <form onSubmit={handleForgotSubmit} className="space-y-3.5">
                            <div>
                                <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                                    Email
                                </label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => { setEmail(e.target.value); setError(''); }}
                                        placeholder="you@example.com"
                                        required
                                        maxLength={254}
                                        className="w-full pl-10 pr-4 py-3 rounded-xl text-sm focus:outline-none transition-all"
                                        style={{
                                            background: 'var(--bg-void)',
                                            border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(201,169,110,0.15)'}`,
                                            color: 'var(--text-primary)',
                                            fontFamily: "'Outfit', sans-serif",
                                        }}
                                    />
                                </div>
                            </div>

                            <AnimatePresence>
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className="flex items-start gap-2 p-3 rounded-xl"
                                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                                    >
                                        <AlertCircle size={14} className="shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                                        <span className="text-xs" style={{ color: '#ef4444' }}>{error}</span>
                                    </motion.div>
                                )}
                                {success && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className="flex items-start gap-2 p-3 rounded-lg"
                                        style={{ background: 'rgba(77,184,130,0.08)', border: '1px solid rgba(77,184,130,0.2)' }}
                                    >
                                        <CheckCircle2 size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--market-up)' }} />
                                        <span className="text-xs" style={{ color: 'var(--market-up)' }}>{success}</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <motion.button
                                type="submit"
                                disabled={loading}
                                whileHover={!loading ? { scale: 1.01 } : {}}
                                whileTap={!loading ? { scale: 0.98 } : {}}
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all cursor-pointer"
                                style={{
                                    background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-bright, #E8C97A))',
                                    color: 'var(--bg-void)',
                                    border: 'none',
                                    fontFamily: "'Outfit', sans-serif",
                                    opacity: loading ? 0.7 : 1,
                                }}
                            >
                                {loading ? <Loader2 size={16} className="animate-spin" /> : (<>Send Reset Link <ArrowRight size={16} /></>)}
                            </motion.button>

                            <div className="text-center mt-2">
                                <button
                                    type="button"
                                    onClick={() => goToMode('login')}
                                    className="text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                                    style={{ color: 'var(--gold-primary)', background: 'none', border: 'none', fontFamily: "'Outfit', sans-serif" }}
                                >
                                    <ArrowLeft size={12} /> Back to Sign In
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Google + email/password (login & register only) */}
                    {mode !== 'forgot' && (
                    <>
                    {/* Google Sign In */}
                    <motion.button
                        variants={itemVariants}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleGoogleSignIn}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-medium text-sm transition-all cursor-pointer mb-5"
                        style={{
                            background: 'rgba(255,255,255,0.95)',
                            color: '#1a1a1a',
                            border: 'none',
                            fontFamily: "'Outfit', sans-serif",
                        }}
                    >
                        {loading ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <>
                                <GoogleIcon size={18} />
                                {mode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}
                            </>
                        )}
                    </motion.button>

                    {/* Divider */}
                    <div className="flex items-center gap-3 mb-5">
                        <div className="flex-1 h-px" style={{ background: 'rgba(201,169,110,0.15)' }} />
                        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                            OR
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'rgba(201,169,110,0.15)' }} />
                    </div>

                    {/* Email/Password Form */}
                    <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                        {mode === 'register' && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                            >
                                <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                                    Full Name
                                </label>
                                <div className="relative">
                                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                    <input
                                        type="text"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        placeholder="Nguyễn Văn A"
                                        maxLength={100}
                                        className="w-full pl-10 pr-4 py-3 rounded-xl text-sm focus:outline-none transition-all"
                                        style={{
                                            background: 'var(--bg-void)',
                                            border: '1px solid rgba(201,169,110,0.15)',
                                            color: 'var(--text-primary)',
                                            fontFamily: "'Outfit', sans-serif",
                                        }}
                                    />
                                </div>
                            </motion.div>
                        )}

                        <div>
                            <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                                Email
                            </label>
                            <div className="relative">
                                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                                    placeholder="you@example.com"
                                    required
                                    maxLength={254}
                                    className="w-full pl-10 pr-4 py-3 rounded-xl text-sm focus:outline-none transition-all"
                                    style={{
                                        background: 'var(--bg-void)',
                                        border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(201,169,110,0.15)'}`,
                                        color: 'var(--text-primary)',
                                        fontFamily: "'Outfit', sans-serif",
                                    }}
                                    id="auth-email-input"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                                Password
                            </label>
                            <div className="relative">
                                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                    placeholder={mode === 'register' ? 'Min 8 chars, uppercase, number' : '••••••••'}
                                    required
                                    minLength={mode === 'register' ? 8 : 1}
                                    maxLength={128}
                                    className="w-full pl-10 pr-12 py-3 rounded-xl text-sm focus:outline-none transition-all"
                                    style={{
                                        background: 'var(--bg-void)',
                                        border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(201,169,110,0.15)'}`,
                                        color: 'var(--text-primary)',
                                        fontFamily: "'Outfit', sans-serif",
                                    }}
                                    id="auth-password-input"
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

                        {mode === 'login' && (
                            <div className="flex justify-end -mt-1">
                                <button
                                    type="button"
                                    onClick={() => goToMode('forgot')}
                                    className="text-xs font-medium cursor-pointer"
                                    style={{ color: 'var(--gold-primary)', background: 'none', border: 'none', fontFamily: "'Outfit', sans-serif" }}
                                >
                                    Forgot password?
                                </button>
                            </div>
                        )}

                        {mode === 'register' && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                            >
                                <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                                    Confirm Password
                                </label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        maxLength={128}
                                        className="w-full pl-10 pr-4 py-3 rounded-xl text-sm focus:outline-none transition-all"
                                        style={{
                                            background: 'var(--bg-void)',
                                            border: `1px solid ${confirmPassword && password !== confirmPassword ? 'rgba(239,68,68,0.4)' : 'rgba(201,169,110,0.15)'}`,
                                            color: 'var(--text-primary)',
                                            fontFamily: "'Outfit', sans-serif",
                                        }}
                                    />
                                </div>

                                {/* Terms checkbox */}
                                <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={agreedToTerms}
                                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                                        className="mt-0.5 cursor-pointer"
                                        style={{ accentColor: 'var(--gold-primary)' }}
                                    />
                                    <span className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                        I agree to the{' '}
                                        <span style={{ color: 'var(--gold-primary)', textDecoration: 'underline' }}>Terms of Service</span>
                                        {' '}and{' '}
                                        <span style={{ color: 'var(--gold-primary)', textDecoration: 'underline' }}>Privacy Policy</span>
                                    </span>
                                </label>
                            </motion.div>
                        )}

                        {/* Error/Success messages */}
                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="rounded-xl overflow-hidden"
                                    style={{ border: '1px solid rgba(239,68,68,0.2)' }}
                                >
                                    <div
                                        className="flex items-start gap-2 p-3"
                                        style={{ background: 'rgba(239,68,68,0.08)' }}
                                    >
                                        <AlertCircle size={14} className="shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                                        <span className="text-xs" style={{ color: '#ef4444' }}>{error}</span>
                                    </div>
                                    {/* Suggest creating account after failed login */}
                                    {loginFailed && mode === 'login' && (
                                        <div
                                            className="px-3 py-2.5 flex items-center justify-between"
                                            style={{ background: 'rgba(201,169,110,0.06)', borderTop: '1px solid rgba(201,169,110,0.1)' }}
                                        >
                                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>New here?</span>
                                            <button
                                                type="button"
                                                onClick={switchMode}
                                                className="text-xs font-semibold cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
                                                style={{
                                                    color: 'var(--gold-primary)',
                                                    background: 'rgba(201,169,110,0.1)',
                                                    border: '1px solid rgba(201,169,110,0.2)',
                                                    fontFamily: "'Outfit', sans-serif",
                                                }}
                                                id="auth-suggest-register"
                                            >
                                                Create Account <ArrowRight size={12} />
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                            {success && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="flex items-center gap-2 p-3 rounded-lg"
                                    style={{ background: 'rgba(77,184,130,0.08)', border: '1px solid rgba(77,184,130,0.2)' }}
                                >
                                    <CheckCircle2 size={14} style={{ color: 'var(--market-up)' }} />
                                    <span className="text-xs" style={{ color: 'var(--market-up)' }}>{success}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Submit */}
                        <motion.button
                            type="submit"
                            disabled={loading}
                            whileHover={!loading ? { scale: 1.01 } : {}}
                            whileTap={!loading ? { scale: 0.98 } : {}}
                            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all cursor-pointer"
                            style={{
                                background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-bright, #E8C97A))',
                                color: 'var(--bg-void)',
                                border: 'none',
                                fontFamily: "'Outfit', sans-serif",
                                opacity: loading ? 0.7 : 1,
                            }}
                            id="auth-submit-button"
                        >
                            {loading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <>
                                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </motion.button>
                    </form>

                    {/* Toggle mode */}
                    <div className="text-center mt-5">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                        </span>
                        <button
                            onClick={switchMode}
                            className="text-xs font-semibold cursor-pointer"
                            style={{
                                color: 'var(--gold-primary)',
                                background: 'none',
                                border: 'none',
                                fontFamily: "'Outfit', sans-serif",
                                textDecoration: 'underline',
                                textUnderlineOffset: '2px',
                            }}
                        >
                            {mode === 'login' ? 'Sign Up' : 'Sign In'}
                        </button>
                    </div>
                    </>
                    )}
                </motion.div>

                {/* Security badge */}
                <motion.div variants={itemVariants} className="text-center mt-6">
                    <div className="flex items-center justify-center gap-2">
                        <Lock size={12} style={{ color: 'var(--text-muted)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                            Secured with 256-bit encryption · Google OAuth 2.0
                        </span>
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
};

export default AuthPage;
