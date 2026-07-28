import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, User, Shield, Crown, LogOut, Check,
    BarChart2, TrendingUp, Settings, Mail, Calendar, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DataRightsPanel from '../components/DataRightsPanel';

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

// The paid-plan catalogue (Pro 199.000đ / Premium 499.000đ), the client-side
// proration estimator and the billing-history view lived here. They are gone
// along with the rest of the commerce surface: nothing is sold, so there is no
// plan to upgrade to, no invoice to show, and no proration to compute.

const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const ProfilePage = ({ onTabChange }) => {
    const { user, loading, logout, updateProfile, authApi } = useAuth();
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState('');
    const [activeSection, setActiveSection] = useState('account');

    // Redirect unauthenticated visitors (e.g. an expired session opening /profile
    // directly) to login instead of leaving them on an endless "Loading…" screen.
    useEffect(() => {
        if (!loading && !user) onTabChange && onTabChange('login');
    }, [loading, user, onTabChange]);

    if (!user) {
        return (
            <div className="w-full min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-void)' }}>
                <p style={{ color: 'var(--text-muted)' }}>{loading ? 'Loading profile…' : 'Redirecting…'}</p>
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

    const sections = [
        { id: 'account', label: 'Account', icon: User },
        { id: 'access', label: 'Access', icon: Crown },
        { id: 'preferences', label: 'Preferences', icon: Settings },
        { id: 'privacy', label: 'Your data', icon: Shield },
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
                            {user.email_verified ? (
                                <span
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase"
                                    style={{ background: 'rgba(77,184,130,0.1)', color: '#4DB882', border: '1px solid rgba(77,184,130,0.25)', letterSpacing: '0.08em' }}
                                >
                                    <CheckCircle2 size={10} />
                                    Verified
                                </span>
                            ) : (
                                <span
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase"
                                    style={{ background: 'rgba(234,179,8,0.1)', color: '#eab308', border: '1px solid rgba(234,179,8,0.25)', letterSpacing: '0.08em' }}
                                >
                                    <Mail size={10} />
                                    Unverified
                                </span>
                            )}
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
                                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Access</p>
                                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                Free for every verified account — nothing is offered for sale.
                                            </p>
                                        </div>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <span
                                                className="px-3 py-1 rounded-full text-xs font-bold uppercase"
                                                style={{ background: 'rgba(77,184,130,0.1)', color: '#4DB882', border: '1px solid rgba(77,184,130,0.25)', letterSpacing: '0.08em' }}
                                            >
                                                {user.email_verified ? '✓ Full access' : 'Verify your email'}
                                            </span>
                                        </div>
                                    </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* ACCESS SECTION — replaces the former Subscription and
                                Billing History tabs. There is no plan to manage: the
                                platform is free and non-commercial, so the only thing
                                that gates access is email verification. */}
                            {activeSection === 'access' && (
                                <motion.div key="access" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }}>
                                    <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-primary)', fontFamily: "'Cormorant Garamond', serif" }}>
                                        Access
                                    </h2>

                                    <div
                                        className="rounded-2xl p-6 mb-4"
                                        style={{ background: 'var(--bg-surface)', border: '1px solid rgba(201,169,110,0.12)' }}
                                    >
                                        <div className="flex items-start gap-4">
                                            <div
                                                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                                                style={{ background: 'rgba(77,184,130,0.1)', border: '1px solid rgba(77,184,130,0.25)' }}
                                            >
                                                <CheckCircle2 size={20} style={{ color: '#4DB882' }} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                                    {user.email_verified
                                                        ? 'You have full access to every feature'
                                                        : 'Verify your email to unlock every feature'}
                                                </p>
                                                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                                    DongAnh Capital is a free, non-commercial academic research project. There
                                                    is no paid plan, no subscription and no payment method on file — the only
                                                    requirement is a verified email address.
                                                </p>
                                                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                                                    Member since {formatDate(user.created_at)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        className="rounded-2xl p-6"
                                        style={{ background: 'var(--bg-surface)', border: '1px solid rgba(201,169,110,0.12)' }}
                                    >
                                        <div className="flex items-start gap-4">
                                            <div
                                                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                                                style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid var(--gold-border)' }}
                                            >
                                                <Shield size={20} style={{ color: 'var(--gold-primary)' }} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                                    What this platform is not
                                                </p>
                                                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                                    We are not a securities company and hold no licence from the State
                                                    Securities Commission. Nothing here is investment advice or a
                                                    recommendation to buy or sell any security.{' '}
                                                    <button
                                                        onClick={() => onTabChange && onTabChange('disclaimer')}
                                                        className="underline underline-offset-2 cursor-pointer"
                                                        style={{ background: 'none', border: 'none', color: 'var(--gold-primary)', font: 'inherit', padding: 0 }}
                                                    >
                                                        Read the full disclaimer →
                                                    </button>
                                                </p>
                                            </div>
                                        </div>
                                    </div>
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

                            {/* YOUR DATA — the rights required by Luật 91/2025:
                                access/portability, and erasure. */}
                            {activeSection === 'privacy' && (
                                <motion.div key="privacy" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }}>
                                    <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: "'Cormorant Garamond', serif" }}>
                                        Your data
                                    </h2>
                                    <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                        Quyền của bạn theo Luật Bảo vệ dữ liệu cá nhân 91/2025. Chi tiết trong{' '}
                                        <button
                                            onClick={() => onTabChange && onTabChange('privacy')}
                                            className="underline underline-offset-2 cursor-pointer"
                                            style={{ background: 'none', border: 'none', color: 'var(--gold-primary)', font: 'inherit', padding: 0 }}
                                        >
                                            Chính sách bảo mật
                                        </button>.
                                    </p>

                                    <DataRightsPanel
                                        email={user.email}
                                        authApi={authApi}
                                        onDeleted={() => onTabChange && onTabChange('home')}
                                    />
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
