import React, { useState } from 'react';
import { Menu, X, User, LogOut, Settings, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Header = ({ activeTab, onTabChange }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const { user, isAuthenticated, logout } = useAuth();

    const handleTabChange = (tab) => {
        onTabChange(tab);
        setIsMenuOpen(false);
    };

    const navTabs = [
        { id: 'home',         label: 'Home' },
        { id: 'dashboard',    label: 'Dashboard' },
        { id: 'chart',        label: 'Chart' },
        { id: 'analyst',      label: 'AI Analyst' },
        { id: 'data-analyst', label: 'Data Analyst' },
        { id: 'news',         label: 'News' },
        { id: 'chatbot',      label: 'AI Chat', badge: 'PRO' },
        { id: 'ltr-signals',  label: 'Pro Signals', badge: 'PRO' },
        { id: 'bcd-signals',  label: 'BCD Signals', badge: 'PRO' },
        { id: 'reports',      label: 'Reports', badge: 'PREMIUM' },
    ];

    return (
        <div
            className="w-full shrink-0 relative z-50"
            style={{ backgroundColor: '#060B14', borderBottom: '1px solid rgba(201,169,110,0.12)' }}
        >
            <div className="h-[60px] flex items-center px-4 sm:px-6 w-full">
                {/* Brand Logo */}
                <div
                    className="flex items-center gap-2.5 mr-auto sm:mr-8 cursor-pointer group"
                    onClick={() => handleTabChange('home')}
                    title="DongAnh Capital"
                >
                    <img
                        src="/assets/NoBGLogoNoName.png"
                        alt="DongAnh Capital"
                        className="h-9 w-9 object-contain transition-opacity duration-200 group-hover:opacity-80"
                        style={{ filter: 'drop-shadow(0 0 8px rgba(201,169,110,0.25))' }}
                    />
                    <span
                        className="hidden sm:block font-semibold text-sm transition-opacity duration-200 group-hover:opacity-80"
                        style={{
                            fontFamily: "'Outfit', sans-serif",
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: '#EDE8DA',
                        }}
                    >
                        DongAnh<span style={{ color: '#C9A96E' }}> Capital</span>
                    </span>
                </div>

                {/* Mobile Menu Button */}
                <button
                    className="sm:hidden flex items-center justify-center w-9 h-9 rounded-full transition-colors cursor-pointer"
                    style={{
                        border: '1px solid rgba(201,169,110,0.2)',
                        background: 'rgba(14, 23, 41, 0.8)',
                        color: '#94A3BC',
                    }}
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    aria-label="Toggle navigation menu"
                >
                    {isMenuOpen ? <X size={18} /> : <Menu size={18} />}
                </button>

                {/* Desktop Navigation Tabs */}
                <div className="hidden sm:flex items-center gap-1 h-full">
                    {navTabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => onTabChange(tab.id)}
                                className="relative h-full px-4 text-sm font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5"
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    color: isActive ? '#C9A96E' : '#94A3BC',
                                    background: 'transparent',
                                    border: 'none',
                                }}
                            >
                                {tab.label}
                                {tab.badge && (
                                    <span
                                        className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase leading-none"
                                        style={{ background: 'rgba(201,169,110,0.15)', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.25)' }}
                                    >
                                        {tab.badge}
                                    </span>
                                )}
                                {/* Gold underline indicator */}
                                <span
                                    className="absolute bottom-0 left-3 right-3 h-[2px] rounded-t transition-all duration-300"
                                    style={{
                                        background: 'linear-gradient(90deg, transparent, #C9A96E, transparent)',
                                        opacity: isActive ? 1 : 0,
                                        transform: isActive ? 'scaleX(1)' : 'scaleX(0)',
                                    }}
                                />
                            </button>
                        );
                    })}
                </div>

                {/* Auth Section — Desktop */}
                <div className="hidden sm:flex items-center gap-2 ml-auto relative">
                    {isAuthenticated && user ? (
                        <div className="relative">
                            <button
                                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                                style={{
                                    background: 'rgba(201,169,110,0.06)',
                                    border: '1px solid rgba(201,169,110,0.15)',
                                    fontFamily: "'Outfit', sans-serif",
                                }}
                            >
                                {user.avatar_url ? (
                                    <img
                                        src={user.avatar_url}
                                        alt={user.full_name || 'User'}
                                        className="w-6 h-6 rounded-full object-cover"
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center"
                                        style={{ background: 'rgba(201,169,110,0.15)' }}>
                                        <User size={13} style={{ color: '#C9A96E' }} />
                                    </div>
                                )}
                                <span className="text-xs font-medium max-w-[100px] truncate" style={{ color: '#EDE8DA' }}>
                                    {user.full_name || user.email?.split('@')[0]}
                                </span>
                                <ChevronDown size={12} style={{ color: '#94A3BC' }} />
                            </button>

                            {/* User Dropdown */}
                            {isUserMenuOpen && (
                                <div
                                    className="absolute top-full right-0 mt-2 w-48 rounded-xl shadow-2xl py-1 z-50"
                                    style={{
                                        background: 'rgba(6, 11, 20, 0.98)',
                                        backdropFilter: 'blur(20px)',
                                        border: '1px solid rgba(201,169,110,0.15)',
                                    }}
                                >
                                    <button
                                        onClick={() => { onTabChange('profile'); setIsUserMenuOpen(false); }}
                                        className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 cursor-pointer transition-colors"
                                        style={{ color: '#94A3BC', background: 'none', border: 'none', fontFamily: "'Outfit', sans-serif" }}
                                    >
                                        <Settings size={14} /> Profile
                                    </button>
                                    <div className="h-px mx-3" style={{ background: 'rgba(201,169,110,0.1)' }} />
                                    <button
                                        onClick={async () => { await logout(); setIsUserMenuOpen(false); onTabChange('home'); }}
                                        className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 cursor-pointer transition-colors"
                                        style={{ color: '#ef4444', background: 'none', border: 'none', fontFamily: "'Outfit', sans-serif" }}
                                    >
                                        <LogOut size={14} /> Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={() => onTabChange('login')}
                                className="px-4 py-2 text-xs font-medium rounded-lg cursor-pointer transition-all"
                                style={{
                                    color: '#C9A96E',
                                    background: 'transparent',
                                    border: '1px solid rgba(201,169,110,0.2)',
                                    fontFamily: "'Outfit', sans-serif",
                                }}
                            >
                                Sign In
                            </button>
                            <button
                                onClick={() => onTabChange('register')}
                                className="px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all"
                                style={{
                                    color: '#0A1020',
                                    background: 'linear-gradient(135deg, #C9A96E, #E8C97A)',
                                    border: 'none',
                                    fontFamily: "'Outfit', sans-serif",
                                }}
                            >
                                Sign Up Free
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Mobile Dropdown Menu */}
            {isMenuOpen && (
                <div
                    className="absolute top-[60px] left-0 right-0 sm:hidden flex flex-col py-2 shadow-2xl z-50"
                    style={{
                        background: 'rgba(6, 11, 20, 0.98)',
                        backdropFilter: 'blur(20px)',
                        borderBottom: '1px solid rgba(201,169,110,0.12)',
                    }}
                >
                    {navTabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                className="text-left px-6 py-3.5 text-base font-medium transition-colors cursor-pointer flex items-center gap-2"
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    color: isActive ? '#C9A96E' : '#94A3BC',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    background: isActive ? 'rgba(201,169,110,0.05)' : 'transparent',
                                }}
                            >
                                {tab.label}
                                {tab.badge && (
                                    <span
                                        className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase leading-none"
                                        style={{ background: 'rgba(201,169,110,0.15)', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.25)' }}
                                    >
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                    {/* Mobile Auth */}
                    <div className="px-4 py-3 flex gap-2" style={{ borderTop: '1px solid rgba(201,169,110,0.1)' }}>
                        {isAuthenticated && user ? (
                            <>
                                <button
                                    onClick={() => handleTabChange('profile')}
                                    className="flex-1 py-2.5 text-sm font-medium rounded-lg cursor-pointer"
                                    style={{ color: '#C9A96E', background: 'rgba(201,169,110,0.06)', border: '1px solid rgba(201,169,110,0.15)', fontFamily: "'Outfit', sans-serif" }}
                                >
                                    Profile
                                </button>
                                <button
                                    onClick={async () => { await logout(); handleTabChange('home'); }}
                                    className="flex-1 py-2.5 text-sm font-medium rounded-lg cursor-pointer"
                                    style={{ color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', fontFamily: "'Outfit', sans-serif" }}
                                >
                                    Sign Out
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => handleTabChange('login')}
                                    className="flex-1 py-2.5 text-sm font-medium rounded-lg cursor-pointer"
                                    style={{ color: '#C9A96E', background: 'transparent', border: '1px solid rgba(201,169,110,0.2)', fontFamily: "'Outfit', sans-serif" }}
                                >
                                    Sign In
                                </button>
                                <button
                                    onClick={() => handleTabChange('register')}
                                    className="flex-1 py-2.5 text-sm font-semibold rounded-lg cursor-pointer"
                                    style={{ color: '#0A1020', background: 'linear-gradient(135deg, #C9A96E, #E8C97A)', border: 'none', fontFamily: "'Outfit', sans-serif" }}
                                >
                                    Sign Up
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Header;
