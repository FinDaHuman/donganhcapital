/**
 * ProfilePage — User profile management for DongAnh Capital.
 * 
 * Features:
 * - User info display (avatar, name, email)
 * - Risk appetite selector
 * - Subscription status
 * - Logout button
 * - Premium dark design
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowLeft, User, Shield, Crown, LogOut, Check,
    TrendingDown, BarChart2, TrendingUp, Settings, Mail, Calendar
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
        description: 'Lower risk, stable returns. Focus on blue-chip stocks and bonds.',
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
        description: 'Higher risk, potential for greater returns. Growth stocks and momentum.',
        icon: TrendingUp,
        color: '#ef4444',
    },
];

const tierConfig = {
    free: { label: 'Free', color: 'var(--text-muted)', bg: 'rgba(78,97,122,0.1)', border: 'rgba(78,97,122,0.2)' },
    pro: { label: 'Pro', color: 'var(--gold-primary)', bg: 'rgba(201,169,110,0.1)', border: 'rgba(201,169,110,0.25)' },
    premium: { label: 'Premium', color: '#a855f7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.25)' },
};

const ProfilePage = ({ onTabChange }) => {
    const { user, logout, updateProfile } = useAuth();
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState('');

    if (!user) {
        return (
            <div className="w-full min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-void)' }}>
                <p style={{ color: 'var(--text-muted)' }}>Loading profile...</p>
            </div>
        );
    }

    const tier = tierConfig[user.subscription_tier] || tierConfig.free;

    const handleRiskChange = async (risk) => {
        if (risk === user.risk_appetite || saving) return;
        setSaving(true);
        setSaveSuccess('');
        const result = await updateProfile({ risk_appetite: risk });
        setSaving(false);
        if (result.success) {
            setSaveSuccess('Risk appetite updated!');
            setTimeout(() => setSaveSuccess(''), 2000);
        }
    };

    const handleLogout = async () => {
        await logout();
        onTabChange && onTabChange('home');
    };

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

                {/* Profile Card */}
                <motion.div
                    variants={itemVariants}
                    initial="initial"
                    animate="animate"
                    className="rounded-3xl p-6 sm:p-8 relative overflow-hidden mb-6"
                    style={{
                        background: 'linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)',
                        border: '1px solid rgba(201,169,110,0.15)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                >
                    <div className="absolute top-0 left-0 right-0 h-[2px]"
                        style={{ background: 'linear-gradient(90deg, transparent, var(--gold-primary), transparent)' }}
                    />

                    {/* Avatar + Info */}
                    <div className="flex items-center gap-4 mb-6">
                        {user.avatar_url ? (
                            <img
                                src={user.avatar_url}
                                alt={user.full_name || 'User'}
                                className="w-16 h-16 rounded-2xl object-cover"
                                style={{ border: '2px solid rgba(201,169,110,0.25)' }}
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <div
                                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(201,169,110,0.2), rgba(201,169,110,0.05))',
                                    border: '2px solid rgba(201,169,110,0.25)',
                                }}
                            >
                                <User size={28} style={{ color: 'var(--gold-primary)' }} />
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <h2
                                className="text-xl font-semibold truncate"
                                style={{ color: 'var(--text-primary)', fontFamily: "'Cormorant Garamond', serif" }}
                            >
                                {user.full_name || 'Investor'}
                            </h2>
                            <div className="flex items-center gap-2 mt-1">
                                <Mail size={12} style={{ color: 'var(--text-muted)' }} />
                                <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                                    {user.email}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5">
                                <span
                                    className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase"
                                    style={{
                                        background: tier.bg,
                                        color: tier.color,
                                        border: `1px solid ${tier.border}`,
                                        letterSpacing: '0.08em',
                                    }}
                                >
                                    <Crown size={10} className="inline mr-1" style={{ marginTop: '-2px' }} />
                                    {tier.label}
                                </span>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    via {user.auth_provider === 'google' ? 'Google' : 'Email'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Member since */}
                    <div className="flex items-center gap-2 mb-6 p-3 rounded-xl" style={{ background: 'var(--bg-void)', border: '1px solid rgba(201,169,110,0.1)' }}>
                        <Calendar size={14} style={{ color: 'var(--gold-primary)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Member since {user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
                        </span>
                    </div>

                    {/* Divider */}
                    <div className="h-px mb-6" style={{ background: 'rgba(201,169,110,0.12)' }} />

                    {/* Risk Appetite */}
                    <div className="mb-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Settings size={14} style={{ color: 'var(--gold-primary)' }} />
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
                                Risk Appetite
                            </h3>
                            {saveSuccess && (
                                <span className="text-xs flex items-center gap-1 ml-auto" style={{ color: 'var(--market-up)' }}>
                                    <Check size={12} /> {saveSuccess}
                                </span>
                            )}
                        </div>
                        <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                            This helps our AI Agent tailor trade suggestions to your investment style.
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

                    {/* Logout */}
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer"
                        style={{
                            background: 'rgba(239,68,68,0.06)',
                            border: '1px solid rgba(239,68,68,0.15)',
                            color: '#ef4444',
                            fontFamily: "'Outfit', sans-serif",
                        }}
                    >
                        <LogOut size={16} />
                        Sign Out
                    </button>
                </motion.div>
            </div>
        </div>
    );
};

export default ProfilePage;
