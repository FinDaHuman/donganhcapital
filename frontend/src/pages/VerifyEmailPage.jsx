/**
 * VerifyEmailPage — consume an email verification token from the link sent
 * after email/password registration.
 *
 * Reached via the link emailed by the backend:
 *   https://donganhcapital.com/verify-email?token=<raw_token>
 * App.jsx routes the `/verify-email` path here; the token is read from the
 * query string and immediately submitted to the backend. On success the user's
 * email_verified flag is flipped and AuthContext is refreshed.
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const VerifyEmailPage = ({ onTabChange }) => {
    const { verifyEmail, resendVerification, user, isAuthenticated } = useAuth();

    const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
    const [message, setMessage] = useState('');
    const [resendLoading, setResendLoading] = useState(false);
    const [resendMsg, setResendMsg] = useState('');

    useEffect(() => {
        const token = new URLSearchParams(window.location.search).get('token');
        // Scrub the token from the URL so it isn't visible in the address bar or
        // browser history after the page loads.
        window.history.replaceState({}, document.title, '/verify-email');

        if (!token) {
            setStatus('error');
            setMessage('No verification token found. Please use the link from your verification email.');
            return;
        }

        verifyEmail(token).then((result) => {
            if (result.success) {
                setStatus('success');
                setMessage(result.message || 'Your email has been verified successfully.');
            } else {
                setStatus('error');
                setMessage(result.error || 'This verification link is invalid or has expired.');
            }
        });
    }, []);

    const handleResend = async () => {
        setResendLoading(true);
        setResendMsg('');
        const result = await resendVerification();
        setResendLoading(false);
        setResendMsg(result.success ? result.message : result.error);
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

                    <div className="text-center py-4">
                        {status === 'verifying' && (
                            <>
                                <div className="flex justify-center mb-4">
                                    <Loader2 size={40} className="animate-spin" style={{ color: 'var(--gold-primary)' }} />
                                </div>
                                <h1 className="mb-2" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Verifying your email…
                                </h1>
                                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                    Please wait a moment.
                                </p>
                            </>
                        )}

                        {status === 'success' && (
                            <>
                                <div className="flex justify-center mb-4">
                                    <CheckCircle2 size={40} style={{ color: 'var(--market-up)' }} />
                                </div>
                                <h1 className="mb-2" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Email Verified
                                </h1>
                                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                                    {message} You can now claim your free 1-week Pro trial.
                                </p>
                                <button
                                    onClick={() => onTabChange && onTabChange('dashboard')}
                                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm cursor-pointer"
                                    style={{ background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-bright, #E8C97A))', color: 'var(--bg-void)', border: 'none', fontFamily: "'Outfit', sans-serif" }}
                                >
                                    Go to Dashboard <ArrowRight size={16} />
                                </button>
                            </>
                        )}

                        {status === 'error' && (
                            <>
                                <div className="flex justify-center mb-4">
                                    <AlertCircle size={40} style={{ color: '#ef4444' }} />
                                </div>
                                <h1 className="mb-2" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Verification Failed
                                </h1>
                                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                                    {message}
                                </p>

                                {isAuthenticated && (
                                    <div className="mb-4">
                                        <button
                                            onClick={handleResend}
                                            disabled={resendLoading}
                                            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm cursor-pointer mb-3"
                                            style={{ background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-bright, #E8C97A))', color: 'var(--bg-void)', border: 'none', fontFamily: "'Outfit', sans-serif", opacity: resendLoading ? 0.7 : 1 }}
                                        >
                                            {resendLoading ? <Loader2 size={16} className="animate-spin" /> : <><Mail size={16} /> Resend Verification Email</>}
                                        </button>
                                        {resendMsg && (
                                            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>{resendMsg}</p>
                                        )}
                                    </div>
                                )}

                                <button
                                    onClick={() => onTabChange && onTabChange(isAuthenticated ? 'dashboard' : 'login')}
                                    className="text-xs font-semibold cursor-pointer"
                                    style={{ color: 'var(--gold-primary)', background: 'none', border: 'none', fontFamily: "'Outfit', sans-serif" }}
                                >
                                    {isAuthenticated ? 'Go to Dashboard' : 'Back to Sign In'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default VerifyEmailPage;
