import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, User, Shield, Crown, LogOut, Check,
    TrendingDown, BarChart2, TrendingUp, Settings, Mail, Calendar,
    AlertTriangle, Clock, ChevronRight, CreditCard, CheckCircle2,
    ArrowUpRight, Zap, Sparkles, History, XCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const itemVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const riskOptions = [
    {
        value: 'conservative',
        label: 'Conservative',
        description: 'Lower risk, stable returns. Focus on blue-chip stocks.',
        icon: Shield,
        color: '#4DB882',
    },
    {
        value: 'moderate',
        label: 'Moderate',
        description: 'Balanced risk-reward. Mix of growth and value stocks.',
        icon: BarChart2,
        color: 'var(--gold-primary)',
    },
    {
        value: 'aggressive',
        label: 'Aggressive',
        description: 'Higher risk, potential for greater returns. Growth & momentum.',
        icon: TrendingUp,
        color: '#ef4444',
    },
];

const tierConfig = {
    free: {
        label: 'Free',
        color: 'var(--text-muted)',
        bg: 'rgba(78,97,122,0.1)',
        border: 'rgba(78,97,122,0.2)',
        rank: 0,
    },
    pro: {
        label: 'Pro',
        color: 'var(--gold-primary)',
        bg: 'rgba(201,169,110,0.1)',
        border: 'rgba(201,169,110,0.25)',
        rank: 1,
    },
    premium: {
        label: 'Premium',
        color: '#a855f7',
        bg: 'rgba(168,85,247,0.1)',
        border: 'rgba(168,85,247,0.25)',
        rank: 2,
    },
};

const upgradePlans = [
    {
        id: 'pro',
        name: 'Pro',
        priceMonthly: '199,000',
        priceYearly: '1,990,000',
        color: 'var(--gold-primary)',
        bg: 'rgba(201,169,110,0.08)',
        border: 'rgba(201,169,110,0.25)',
        features: ['AI news analysis', 'Investment chatbot', '1 FinAI Predict model', 'Price alerts'],
    },
    {
        id: 'premium',
        name: 'Premium',
        priceMonthly: '499,000',
        priceYearly: '4,990,000',
        color: '#a855f7',
        bg: 'rgba(168,85,247,0.08)',
        border: 'rgba(168,85,247,0.25)',
        features: ['All Pro features', 'Unlimited AI analysis', '2 FinAI Predict models', 'Priority support'],
    },
];

const getDaysUntilExpiry = (expiresAt) => {
    if (!expiresAt) return null;
    const now = new Date();
    const exp = new Date(expiresAt);
    const diffMs = exp - now;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatAmount = (amount) => {
    if (!amount) return '0';
    return new Intl.NumberFormat('vi-VN').format(amount);
};

const ProfilePage = ({ onTabChange }) => {
    const { user, logout, updateProfile, authApi } = useAuth();
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState('');
    const [activeSection, setActiveSection] = useState('account');
    const [paymentHistory, setPaymentHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [upgradeYearly, setUpgradeYearly] = useState(false);

    const daysUntilExpiry = getDaysUntilExpiry(user?.subscription_expires_at);
    const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 3 && daysUntilExpiry >= 0;
    const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;

    const tier = tierConfig[user?.subscription_tier] || tierConfig.free;
    const currentRank = tier.rank;

    const availableUpgrades = upgradePlans.filter(p => {
        const planRank = tierConfig[p.id]?.rank ?? 0;
        return planRank > currentRank;
    });

    useEffect(() => {
        if (activeSection === 'billing' && paymentHistory.length === 0) {
            setHistoryLoading(true);
            authApi.get('/api/payments/history')
                .then(res => setPaymentHistory(res.data.payments || []))
                .catch(() => setPaymentHistory([]))
                .finally(() => setHistoryLoading(false));
        }
    }, [activeSection, authApi]);

    if (!user) {
        return (
            <div className="w-full min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-void)' }}>
                <p style={{ color: 'var(--text-muted)' }}>Loading profile...</p>
            </div>
        );
    }

    const handleRiskChange = async (risk) => {
        if (risk === user.risk_appetite || saving) return;
        setSaving(true);
        setSaveSuccess('');
        const result = await updateProfile({ risk_appetite: risk });
        setSaving(false);
        if (result.success) {
            setSaveSuccess('Saved!');
            setTimeout(() => setSaveSuccess(''), 2000);
        }
    };

    const handleLogout = async () => {
        await logout();
        onTabChange && onTabChange('home');
    };

    const handleUpgrade = (planId) => {
        onTabChange && onTabChange('checkout', { plan: planId, period: upgradeYearly ? 'yearly' : 'monthly' });
    };

    const sections = [
        { id: 'account', label: 'Account', icon: User },
        { id: 'subscription', label: 'Subscription', icon: Crown },
        { id: 'billing', label: 'Billing History', icon: History },
        { id: 'preferences', label: 'Preferences', icon: Settings },
    ];

    return (
        <div
            className="w-full min-h-screen flex flex-col relative"
            style={{ backgroundColor: 'var(--bg-void)', fontFamily: "'Outfit', sans-serif" }}
        >
            {/* Background */}
            <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] z-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(201,169,110,0.05) 0%, transparent 70%)', filter: 'blur(40px)' }}
            />

            <div className="relative z-10 w-full max-w-5xl mx-auto px-4 py-8">
                {/* Back button */}
                <motion.div variants={itemVariants} initial="initial" animate="animate" className="mb-6">
                    <button
                        onClick={() => onTabChange && onTabChange('dashboard')}
                        className="flex items-center gap-2 text-sm cursor-pointer transition-colors"
                        style={{ color: 'var(--text-muted)', background: 'none', border: 'none', fontFamily: "'Outfit', sans-serif" }}
                    >
                        <ArrowLeft size={16} />
                        Back to Dashboard
                    </button>
                </motion.div>

                {/* Expiry warning banner */}
                <AnimatePresence>
                    {(isExpiringSoon || isExpired) && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl"
                            style={{
                                background: isExpired ? 'rgba(239,68,68,0.06)' : 'rgba(234,179,8,0.06)',
                                border: `1px solid ${isExpired ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)'}`,
                            }}
                        >
                            <AlertTriangle size={16} style={{ color: isExpired ? '#ef4444' : '#eab308', flexShrink: 0 }} />
                            <p className="text-sm flex-1" style={{ color: isExpired ? '#ef4444' : '#eab308' }}>
                                {isExpired
                                    ? `Your ${tier.label} subscription has expired. Renew to restore access.`
                                    : `Your ${tier.label} plan expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}. Renew to keep access.`
                                }
                            </p>
                            <button
                                onClick={() => setActiveSection('subscription')}
                                className="text-xs font-semibold cursor-pointer shrink-0"
                                style={{ background: 'none', border: 'none', color: isExpired ? '#ef4444' : '#eab308' }}
                            >
                                Renew →
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Sidebar */}
                    <motion.div variants={itemVariants} initial="initial" animate="animate" className="lg:w-64 shrink-0">
                        {/* User card */}
                        <div
                            className="rounded-2xl p-5 mb-4"
                            style={{
                                background: 'linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)',
                                border: '1px solid rgba(201,169,110,0.15)',
                            }}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                {user.avatar_url ? (
                                    <img
                                        src={user.avatar_url}
                                        alt={user.full_name || 'User'}
                                        className="w-12 h-12 rounded-xl object-cover"
                                        style={{ border: '2px solid rgba(201,169,110,0.2)' }}
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div
                                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(201,169,110,0.2), rgba(201,169,110,0.05))',
                                            border: '2px solid rgba(201,169,110,0.2)',
                                        }}
                                    >
                                        <User size={22} style={{ color: 'var(--gold-primary)' }} />
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <p className="font-semibold truncate" style={{ color: 'var(--text-primary)', fontSize: '15px', fontFamily: "'Cormorant Garamond', serif" }}>
                                        {user.full_name || 'Investor'}
                                    </p>
                                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user.email}</p>
                                </div>
                            </div>
                            <span
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase"
                                style={{ background: tier.bg, color: tier.color, border: `1px solid ${tier.border}`, letterSpacing: '0.08em' }}
                            >
                                <Crown size={10} />
                                {tier.label}
                            </span>
                        </div>

                        {/* Nav */}
                        <nav className="flex flex-col gap-1">
                            {sections.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => setActiveSection(s.id)}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium cursor-pointer transition-all text-left"
                                    style={{
                                        background: activeSection === s.id ? 'rgba(201,169,110,0.08)' : 'transparent',
                                        border: `1px solid ${activeSection === s.id ? 'rgba(201,169,110,0.2)' : 'transparent'}`,
                                        color: activeSection === s.id ? 'var(--gold-primary)' : 'var(--text-secondary)',
                                        fontFamily: "'Outfit', sans-serif",
                                    }}
                                >
                                    <s.icon size={16} />
                                    {s.label}
                                    {s.id === 'subscription' && isExpiringSoon && (
                                        <span className="ml-auto w-2 h-2 rounded-full" style={{ background: '#eab308' }} />
                                    )}
                                </button>
                            ))}

                            <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(201,169,110,0.08)' }}>
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium cursor-pointer transition-all"
                                    style={{ background: 'transparent', border: '1px solid transparent', color: '#ef4444', fontFamily: "'Outfit', sans-serif" }}
                                >
                                    <LogOut size={16} />
                                    Sign Out
                                </button>
                            </div>
                        </nav>
                    </motion.div>

                    {/* Main content */}
                    <motion.div variants={itemVariants} initial="initial" animate="animate" className="flex-1 min-w-0">
                        <AnimatePresence mode="wait">

                            {/* ACCOUNT SECTION */}
                            {activeSection === 'account' && (
                                <motion.div key="account" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }}>
                                    <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-primary)', fontFamily: "'Cormorant Garamond', serif" }}>
                                        Account Information
                                    </h2>

                                    <div
                                        className="rounded-2xl p-6 mb-4"
                                        style={{ background: 'var(--bg-surface)', border: '1px solid rgba(201,169,110,0.12)' }}
                                    >
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                            <div>
                                                <p className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Full Name</p>
                                                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{user.full_name || '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Email</p>
                                                <div className="flex items-center gap-2">
                                                    <Mail size={13} style={{ color: 'var(--text-muted)' }} />
                                                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user.email}</p>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Sign-in Method</p>
                                                <p className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                                                    {user.auth_provider === 'google' ? '🔵 Google OAuth' : '📧 Email & Password'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Member Since</p>
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
                                                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                                        {user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric', day: 'numeric' }) : '—'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        className="rounded-2xl p-5 flex items-center justify-between"
                                        style={{ background: 'var(--bg-surface)', border: '1px solid rgba(201,169,110,0.12)' }}
                                    >
                                        <div>
                                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Current Plan</p>
                                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                {user.subscription_expires_at
                                                    ? `Renews / expires on ${formatDate(user.subscription_expires_at)}`
                                                    : 'No active paid subscription'
                                                }
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span
                                                className="px-3 py-1 rounded-full text-xs font-bold uppercase"
                                                style={{ background: tier.bg, color: tier.color, border: `1px solid ${tier.border}`, letterSpacing: '0.08em' }}
                                            >
                                                {tier.label}
                                            </span>
                                            {availableUpgrades.length > 0 && (
                                                <button
                                                    onClick={() => setActiveSection('subscription')}
                                                    className="text-xs font-semibold cursor-pointer flex items-center gap-1"
                                                    style={{ background: 'none', border: 'none', color: 'var(--gold-primary)' }}
                                                >
                                                    Upgrade <ChevronRight size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* SUBSCRIPTION SECTION */}
                            {activeSection === 'subscription' && (
                                <motion.div key="subscription" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }}>
                                    <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-primary)', fontFamily: "'Cormorant Garamond', serif" }}>
                                        Subscription
                                    </h2>

                                    {/* Current plan status */}
                                    <div
                                        className="rounded-2xl p-6 mb-6 relative overflow-hidden"
                                        style={{
                                            background: `linear-gradient(135deg, ${tier.bg} 0%, var(--bg-surface) 100%)`,
                                            border: `1px solid ${tier.border}`,
                                        }}
                                    >
                                        <div className="absolute top-0 left-0 right-0 h-[2px]"
                                            style={{ background: `linear-gradient(90deg, transparent, ${tier.color}, transparent)` }}
                                        />
                                        <div className="flex items-start justify-between mb-4">
                                            <div>
                                                <p className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Current Plan</p>
                                                <p className="text-2xl font-bold" style={{ color: tier.color, fontFamily: "'Cormorant Garamond', serif" }}>{tier.label}</p>
                                            </div>
                                            <Crown size={28} style={{ color: tier.color, opacity: 0.3 }} />
                                        </div>

                                        {user.subscription_expires_at ? (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Status</p>
                                                    <p className="text-sm font-medium mt-0.5" style={{ color: isExpired ? '#ef4444' : daysUntilExpiry <= 3 ? '#eab308' : 'var(--market-up)' }}>
                                                        {isExpired ? 'Expired' : 'Active'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Expires</p>
                                                    <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>
                                                        {formatDate(user.subscription_expires_at)}
                                                    </p>
                                                </div>
                                                {!isExpired && daysUntilExpiry !== null && (
                                                    <div className="col-span-2">
                                                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Time remaining</p>
                                                        <p className="text-sm font-medium mt-0.5" style={{ color: daysUntilExpiry <= 3 ? '#eab308' : 'var(--text-primary)' }}>
                                                            {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                                Free plan — no expiry date
                                            </p>
                                        )}
                                    </div>

                                    {/* Upgrade options */}
                                    {availableUpgrades.length > 0 && (
                                        <div>
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                    {currentRank === 0 ? 'Upgrade Your Plan' : 'Upgrade to Premium'}
                                                </h3>
                                                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                                                    <button
                                                        onClick={() => setUpgradeYearly(false)}
                                                        className="cursor-pointer px-2.5 py-1 rounded-full transition-all"
                                                        style={{
                                                            background: !upgradeYearly ? 'rgba(201,169,110,0.12)' : 'transparent',
                                                            border: `1px solid ${!upgradeYearly ? 'rgba(201,169,110,0.25)' : 'transparent'}`,
                                                            color: !upgradeYearly ? 'var(--gold-primary)' : 'var(--text-muted)',
                                                            fontFamily: "'Outfit', sans-serif",
                                                        }}
                                                    >Monthly</button>
                                                    <button
                                                        onClick={() => setUpgradeYearly(true)}
                                                        className="cursor-pointer px-2.5 py-1 rounded-full transition-all"
                                                        style={{
                                                            background: upgradeYearly ? 'rgba(201,169,110,0.12)' : 'transparent',
                                                            border: `1px solid ${upgradeYearly ? 'rgba(201,169,110,0.25)' : 'transparent'}`,
                                                            color: upgradeYearly ? 'var(--gold-primary)' : 'var(--text-muted)',
                                                            fontFamily: "'Outfit', sans-serif",
                                                        }}
                                                    >Yearly <span style={{ color: 'var(--market-up)' }}>-17%</span></button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {availableUpgrades.map((plan) => (
                                                    <div
                                                        key={plan.id}
                                                        className="rounded-2xl p-5 relative overflow-hidden"
                                                        style={{ background: plan.bg, border: `1px solid ${plan.border}` }}
                                                    >
                                                        <div className="flex items-center justify-between mb-3">
                                                            <p className="font-semibold text-base" style={{ color: plan.color, fontFamily: "'Cormorant Garamond', serif" }}>
                                                                {plan.name}
                                                            </p>
                                                            <Sparkles size={16} style={{ color: plan.color, opacity: 0.7 }} />
                                                        </div>
                                                        <p className="text-xl font-medium mb-1" style={{ color: 'var(--text-primary)', fontFamily: "'DM Mono', monospace" }}>
                                                            {upgradeYearly ? plan.priceYearly : plan.priceMonthly}
                                                            <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                                                                VND/{upgradeYearly ? 'yr' : 'mo'}
                                                            </span>
                                                        </p>
                                                        <ul className="space-y-1.5 mb-4">
                                                            {plan.features.map((f, i) => (
                                                                <li key={i} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                                    <CheckCircle2 size={12} style={{ color: plan.color, flexShrink: 0 }} />
                                                                    {f}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                        <button
                                                            onClick={() => handleUpgrade(plan.id)}
                                                            className="w-full py-2.5 rounded-xl text-sm font-semibold cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                                                            style={{
                                                                background: plan.color,
                                                                color: plan.id === 'pro' ? 'var(--bg-void)' : '#fff',
                                                                border: 'none',
                                                                fontFamily: "'Outfit', sans-serif",
                                                            }}
                                                        >
                                                            <ArrowUpRight size={15} />
                                                            Upgrade to {plan.name}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {availableUpgrades.length === 0 && (
                                        <div
                                            className="rounded-2xl p-6 text-center"
                                            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(168,85,247,0.2)' }}
                                        >
                                            <Sparkles size={28} style={{ color: '#a855f7', margin: '0 auto 12px' }} />
                                            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>You're on our best plan</p>
                                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                You have full access to all Premium features. Thank you for your support!
                                            </p>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* BILLING HISTORY SECTION */}
                            {activeSection === 'billing' && (
                                <motion.div key="billing" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }}>
                                    <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-primary)', fontFamily: "'Cormorant Garamond', serif" }}>
                                        Billing History
                                    </h2>

                                    {historyLoading ? (
                                        <div className="flex items-center justify-center py-16">
                                            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--gold-primary)', borderTopColor: 'transparent' }} />
                                        </div>
                                    ) : paymentHistory.length === 0 ? (
                                        <div
                                            className="rounded-2xl p-10 text-center"
                                            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(201,169,110,0.1)' }}
                                        >
                                            <CreditCard size={32} style={{ color: 'var(--text-muted)', opacity: 0.4, margin: '0 auto 12px' }} />
                                            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No payment history yet</p>
                                            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Your transactions will appear here.</p>
                                        </div>
                                    ) : (
                                        <div
                                            className="rounded-2xl overflow-hidden"
                                            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(201,169,110,0.12)' }}
                                        >
                                            <div className="grid grid-cols-4 px-5 py-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em', borderBottom: '1px solid rgba(201,169,110,0.08)' }}>
                                                <span>Plan</span>
                                                <span>Date</span>
                                                <span>Amount</span>
                                                <span>Status</span>
                                            </div>
                                            {paymentHistory.map((p, i) => (
                                                <div
                                                    key={i}
                                                    className="grid grid-cols-4 px-5 py-4 text-sm items-center"
                                                    style={{ borderBottom: i < paymentHistory.length - 1 ? '1px solid rgba(201,169,110,0.06)' : 'none' }}
                                                >
                                                    <span className="font-medium capitalize" style={{ color: 'var(--text-primary)' }}>{p.plan}</span>
                                                    <span style={{ color: 'var(--text-secondary)' }}>{formatDate(p.completed_at)}</span>
                                                    <span style={{ color: 'var(--text-primary)', fontFamily: "'DM Mono', monospace" }}>
                                                        {formatAmount(p.amount)} đ
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        {p.status === 'completed' ? (
                                                            <>
                                                                <CheckCircle2 size={13} style={{ color: 'var(--market-up)' }} />
                                                                <span style={{ color: 'var(--market-up)', fontSize: '12px' }}>Paid</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <XCircle size={13} style={{ color: 'var(--text-muted)' }} />
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'capitalize' }}>{p.status}</span>
                                                            </>
                                                        )}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* PREFERENCES SECTION */}
                            {activeSection === 'preferences' && (
                                <motion.div key="preferences" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }}>
                                    <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-primary)', fontFamily: "'Cormorant Garamond', serif" }}>
                                        Preferences
                                    </h2>

                                    <div
                                        className="rounded-2xl p-6"
                                        style={{ background: 'var(--bg-surface)', border: '1px solid rgba(201,169,110,0.12)' }}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <Settings size={14} style={{ color: 'var(--gold-primary)' }} />
                                            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Risk Appetite</h3>
                                            {saveSuccess && (
                                                <span className="text-xs flex items-center gap-1 ml-auto" style={{ color: 'var(--market-up)' }}>
                                                    <Check size={12} /> {saveSuccess}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs mb-5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                            Tailor AI trade suggestions to your investment style and comfort with risk.
                                        </p>

                                        <div className="space-y-2.5">
                                            {riskOptions.map((opt) => {
                                                const isSelected = user.risk_appetite === opt.value;
                                                return (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => handleRiskChange(opt.value)}
                                                        disabled={saving}
                                                        className="w-full flex items-start gap-3.5 p-3.5 rounded-xl text-left transition-all cursor-pointer"
                                                        style={{
                                                            background: isSelected ? 'rgba(201,169,110,0.06)' : 'transparent',
                                                            border: `1px solid ${isSelected ? 'rgba(201,169,110,0.3)' : 'rgba(201,169,110,0.1)'}`,
                                                            fontFamily: "'Outfit', sans-serif",
                                                        }}
                                                    >
                                                        <div
                                                            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                                                            style={{ background: `${opt.color}15`, border: `1px solid ${opt.color}30` }}
                                                        >
                                                            <opt.icon size={16} style={{ color: opt.color }} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium" style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                                                    {opt.label}
                                                                </span>
                                                                {isSelected && <Check size={14} style={{ color: 'var(--gold-primary)' }} />}
                                                            </div>
                                                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                                {opt.description}
                                                            </p>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
