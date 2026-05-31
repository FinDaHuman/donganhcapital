import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';

const Header = ({ activeTab, onTabChange }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

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
                                className="relative h-full px-4 text-sm font-medium transition-all duration-200 cursor-pointer"
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    color: isActive ? '#C9A96E' : '#94A3BC',
                                    background: 'transparent',
                                    border: 'none',
                                }}
                            >
                                {tab.label}
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
                                className="text-left px-6 py-3.5 text-base font-medium transition-colors cursor-pointer"
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    color: isActive ? '#C9A96E' : '#94A3BC',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    background: isActive ? 'rgba(201,169,110,0.05)' : 'transparent',
                                }}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Header;
