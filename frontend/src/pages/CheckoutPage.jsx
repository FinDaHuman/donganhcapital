/**
 * CheckoutPage — Payment checkout for DongAnh Capital subscriptions.
 * 
 * Features:
 * - Displays VietQR code for bank transfer payment
 * - Shows bank transfer details (account, amount, description)
 * - Auto-polls payment status every 5 seconds
 * - Countdown timer for order expiry (30 min)
 * - Success/failure animations
 * - Premium dark design
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Clock, Copy, Check, CheckCircle2,
    XCircle, Loader2, CreditCard, Building2, QrCode,
    Crown, Sparkles, RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const POLL_INTERVAL_MS = 5000; // 5 seconds

const planInfo = {
    pro: {
        name: 'Pro',
        color: 'var(--gold-primary)',
        bg: 'rgba(201,169,110,0.08)',
        border: 'rgba(201,169,110,0.25)',
        icon: Crown,
    },
    premium: {
        name: 'Premium',
        color: '#a855f7',
        bg: 'rgba(168,85,247,0.08)',
        border: 'rgba(168,85,247,0.25)',
        icon: Sparkles,
    },
};

const CheckoutPage = ({ onTabChange, plan = 'pro', period = 'monthly' }) => {
    const { authApi, user, isAuthenticated } = useAuth();
    const [orderData, setOrderData] = useState(null);
    const [status, setStatus] = useState('loading'); // loading | pending | completed | expired | error
    const [error, setError] = useState('');
    const [copied, setCopied] = useState('');
    const [timeLeft, setTimeLeft] = useState(null);
    const pollRef = useRef(null);
    const timerRef = useRef(null);

    const info = planInfo[plan] || planInfo.pro;
    const PlanIcon = info.icon;

    // Redirect if not authenticated
    useEffect(() => {
        if (!isAuthenticated) {
            onTabChange && onTabChange('login');
        }
    }, [isAuthenticated, onTabChange]);

    // Create order on mount
    useEffect(() => {
        if (!isAuthenticated) return;

        const createOrder = async () => {
            try {
                const { data } = await authApi.post('/api/payments/create-order', { plan, period });
                setOrderData(data);
                setStatus('pending');

                // Calculate time left
                const expiresAt = new Date(data.expires_at);
                const secondsLeft = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
                setTimeLeft(secondsLeft);
            } catch (err) {
                setError(err.response?.data?.detail || 'Failed to create order. Please try again.');
                setStatus('error');
            }
        };

        createOrder();

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isAuthenticated, plan, period, authApi]);

    // Poll payment status
    useEffect(() => {
        if (status !== 'pending' || !orderData?.order_code) return;

        const pollStatus = async () => {
            try {
                const { data } = await authApi.get(`/api/payments/check/${orderData.order_code}`);
                if (data.status === 'completed') {
                    setStatus('completed');
                    if (pollRef.current) clearInterval(pollRef.current);
                    if (timerRef.current) clearInterval(timerRef.current);
                } else if (data.status === 'expired') {
                    setStatus('expired');
                    if (pollRef.current) clearInterval(pollRef.current);
                    if (timerRef.current) clearInterval(timerRef.current);
                }
            } catch {
                // Silently retry on next poll
            }
        };

        pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [status, orderData, authApi]);

    // Countdown timer
    useEffect(() => {
        if (status !== 'pending' || timeLeft === null) return;

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 0) {
                    setStatus('expired');
                    if (timerRef.current) clearInterval(timerRef.current);
                    if (pollRef.current) clearInterval(pollRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [status, timeLeft]);

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleCopy = useCallback((text, field) => {
        navigator.clipboard.writeText(text);
        setCopied(field);
        setTimeout(() => setCopied(''), 2000);
    }, []);

    // ── Render states ──

    if (status === 'loading') {
        return (
            <div className="w-full min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-void)' }}>
                <div className="text-center">
                    <Loader2 size={32} className="animate-spin mx-auto mb-3" style={{ color: 'var(--gold-primary)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
                        Creating your order...
                    </p>
                </div>
            </div>
        );
    }

    if (status === 'completed') {
        return (
            <div className="w-full min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-void)' }}>
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center max-w-md"
                >
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
                        className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
                        style={{ background: 'rgba(77,184,130,0.1)', border: '2px solid rgba(77,184,130,0.3)' }}
                    >
                        <CheckCircle2 size={40} style={{ color: 'var(--market-up)' }} />
                    </motion.div>
                    <h2
                        className="mb-3"
                        style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '32px', fontWeight: 600, color: 'var(--text-primary)' }}
                    >
                        Payment Confirmed!
                    </h2>
                    <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif" }}>
                        Welcome to <strong>{info.name}</strong>! Your subscription is now active.
                    </p>
                    <p className="text-xs mb-8" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
                        Enjoy full access to all {info.name} features.
                    </p>
                    <button
                        onClick={() => onTabChange && onTabChange('dashboard')}
                        className="px-8 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all"
                        style={{
                            background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-bright, #E8C97A))',
                            color: 'var(--bg-void)',
                            border: 'none',
                            fontFamily: "'Outfit', sans-serif",
                        }}
                    >
                        Go to Dashboard →
                    </button>
                </motion.div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="w-full min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-void)' }}>
                <div className="text-center max-w-md">
                    <XCircle size={48} className="mx-auto mb-4" style={{ color: '#ef4444' }} />
                    <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                        Payment Error
                    </h2>
                    <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{error}</p>
                    <button
                        onClick={() => onTabChange && onTabChange('home')}
                        className="px-6 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
                        style={{ color: 'var(--gold-primary)', background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.2)', fontFamily: "'Outfit', sans-serif" }}
                    >
                        ← Back to Home
                    </button>
                </div>
            </div>
        );
    }

    if (status === 'expired') {
        return (
            <div className="w-full min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-void)' }}>
                <div className="text-center max-w-md">
                    <Clock size={48} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                    <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                        Order Expired
                    </h2>
                    <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                        This payment order has expired. Please create a new order.
                    </p>
                    <button
                        onClick={() => onTabChange && onTabChange('home')}
                        className="px-6 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
                        style={{ color: 'var(--gold-primary)', background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.2)', fontFamily: "'Outfit', sans-serif" }}
                    >
                        ← Try Again
                    </button>
                </div>
            </div>
        );
    }

    // ── Main Checkout UI (status === 'pending') ──
    const payment = orderData?.payment || {};

    return (
        <div
            className="w-full min-h-screen flex flex-col items-center py-8 px-4 relative"
            style={{ backgroundColor: 'var(--bg-void)', fontFamily: "'Outfit', sans-serif" }}
        >
            {/* Background glow */}
            <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] z-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse at 50% 0%, rgba(201,169,110,0.06) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
            />

            <div className="w-full max-w-lg relative z-10">
                {/* Back */}
                <button
                    onClick={() => onTabChange && onTabChange('home')}
                    className="flex items-center gap-2 text-sm cursor-pointer transition-colors mb-6"
                    style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
                >
                    <ArrowLeft size={16} /> Back
                </button>

                {/* Order Summary Card */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-3xl p-6 sm:p-8 relative overflow-hidden mb-5"
                    style={{
                        background: 'linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)',
                        border: `1px solid ${info.border}`,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                >
                    <div className="absolute top-0 left-0 right-0 h-[2px]"
                        style={{ background: `linear-gradient(90deg, transparent, ${info.color}, transparent)` }}
                    />

                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                                style={{ background: info.bg, border: `1px solid ${info.border}` }}>
                                <PlanIcon size={20} style={{ color: info.color }} />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    {info.name} Plan
                                </h2>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {period === 'yearly' ? 'Yearly subscription' : 'Monthly subscription'}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-xl font-bold" style={{ color: info.color, fontFamily: "'DM Mono', monospace" }}>
                                {orderData?.amount?.toLocaleString()}
                            </span>
                            <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>VND</span>
                        </div>
                    </div>

                    {/* Timer */}
                    {timeLeft !== null && (
                        <div className="flex items-center gap-2 p-3 rounded-xl mb-0"
                            style={{
                                background: timeLeft < 300 ? 'rgba(239,68,68,0.06)' : 'rgba(201,169,110,0.06)',
                                border: `1px solid ${timeLeft < 300 ? 'rgba(239,68,68,0.15)' : 'rgba(201,169,110,0.1)'}`,
                            }}
                        >
                            <Clock size={14} style={{ color: timeLeft < 300 ? '#ef4444' : 'var(--gold-primary)' }} />
                            <span className="text-xs" style={{ color: timeLeft < 300 ? '#ef4444' : 'var(--text-muted)' }}>
                                Order expires in <strong>{formatTime(timeLeft)}</strong>
                            </span>
                            <div className="ml-auto flex items-center gap-1.5">
                                <RefreshCw size={12} className="animate-spin" style={{ color: 'var(--gold-primary)', animationDuration: '3s' }} />
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Auto-checking...</span>
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* QR Code Card */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
                    className="rounded-3xl p-6 sm:p-8 relative overflow-hidden mb-5"
                    style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid rgba(201,169,110,0.12)',
                    }}
                >
                    <div className="flex items-center gap-2 mb-5">
                        <QrCode size={16} style={{ color: 'var(--gold-primary)' }} />
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
                            Scan to Pay
                        </h3>
                    </div>

                    {/* QR Image */}
                    <div className="flex justify-center mb-5">
                        {payment.qr_url ? (
                            <div className="p-3 rounded-2xl" style={{ background: 'white' }}>
                                <img
                                    src={payment.qr_url}
                                    alt="VietQR Payment Code"
                                    className="w-56 h-56 object-contain"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            </div>
                        ) : (
                            <div className="w-56 h-56 rounded-2xl flex items-center justify-center"
                                style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--gold-border)' }}>
                                <p className="text-xs text-center px-4" style={{ color: 'var(--text-muted)' }}>
                                    QR Code unavailable.<br />Please use manual transfer below.
                                </p>
                            </div>
                        )}
                    </div>

                    <p className="text-xs text-center mb-4" style={{ color: 'var(--text-muted)' }}>
                        Open your banking app and scan the QR code, or transfer manually:
                    </p>

                    {/* Bank Details */}
                    <div className="space-y-2.5">
                        {[
                            { label: 'Bank', value: payment.bank_name || 'MB Bank', field: 'bank' },
                            { label: 'Account Number', value: payment.account_no, field: 'account', copyable: true },
                            { label: 'Account Name', value: payment.account_name, field: 'name' },
                            { label: 'Amount', value: payment.amount_formatted, field: 'amount', copyable: true, copyValue: String(payment.amount) },
                            { label: 'Transfer Description', value: orderData?.order_code, field: 'desc', copyable: true, important: true },
                        ].map(({ label, value, field, copyable, copyValue, important }) => (
                            <div
                                key={field}
                                className="flex items-center justify-between p-3 rounded-xl"
                                style={{
                                    background: important ? 'rgba(201,169,110,0.06)' : 'var(--bg-elevated)',
                                    border: `1px solid ${important ? 'rgba(201,169,110,0.2)' : 'rgba(201,169,110,0.08)'}`,
                                }}
                            >
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`text-sm ${important ? 'font-bold' : 'font-medium'}`}
                                        style={{
                                            color: important ? 'var(--gold-primary)' : 'var(--text-primary)',
                                            fontFamily: field === 'amount' || field === 'account' ? "'DM Mono', monospace" : "'Outfit', sans-serif",
                                        }}
                                    >
                                        {value || '—'}
                                    </span>
                                    {copyable && value && (
                                        <button
                                            onClick={() => handleCopy(copyValue || value, field)}
                                            className="p-1 rounded cursor-pointer transition-all"
                                            style={{ background: 'none', border: 'none', color: copied === field ? 'var(--market-up)' : 'var(--text-muted)' }}
                                            title="Copy"
                                        >
                                            {copied === field ? <Check size={13} /> : <Copy size={13} />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Important notice */}
                    <div
                        className="mt-4 p-3 rounded-xl text-xs leading-relaxed"
                        style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)', color: '#ef4444' }}
                    >
                        ⚠️ <strong>Important:</strong> You must include the exact transfer description <strong>"{orderData?.order_code}"</strong> in your bank transfer for automatic confirmation.
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default CheckoutPage;
