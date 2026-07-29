import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity, TrendingUp, BarChart3, LineChart,
    Lock, Calendar, Globe, Server, Database,
    ChevronDown, ChevronUp, MapPin, Users, Mail, Facebook, Youtube, ShieldCheck,
    CheckCircle2, Clock, Send, ArrowRight,
    Bot, Brain, Target, Shield, Zap, BarChart2, Eye, Cpu,
    XCircle, TrendingDown, AlertTriangle, BarChart,
    Newspaper, Settings, Play, BadgeCheck, Infinity, Rocket,
    Loader2
} from 'lucide-react';
import { subscribeEmail } from '../services/stock_api';
import { LEGAL_LINKS } from '../legal/routes';
import { useLocale } from '../context/LocaleContext';

/* ============================================================
   ANIMATION VARIANTS
   ============================================================ */
const sectionVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1, delayChildren: 0.05 }
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

/* ============================================================
   SHARED COMPONENTS
   ============================================================ */

const SectionLabel = ({ children, align = 'center' }) => (
    <div className={`flex items-center gap-4 mb-5 ${align === 'center' ? 'justify-center' : 'justify-start'}`}>
        <div
            className="h-px flex-shrink-0"
            style={{
                width: '48px',
                background: 'linear-gradient(to right, transparent, var(--gold-primary))',
            }}
        />
        <span
            style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.26em',
                textTransform: 'uppercase',
                color: 'var(--gold-primary)',
                whiteSpace: 'nowrap',
            }}
        >
            {children}
        </span>
        <div
            className="h-px flex-shrink-0"
            style={{
                width: '48px',
                background: 'linear-gradient(to left, transparent, var(--gold-primary))',
            }}
        />
    </div>
);

const StarMark = ({ size = 16, color = 'var(--gold-primary)', className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className}>
        <path d="M8 0 L9 6.5 L16 8 L9 9.5 L8 16 L7 9.5 L0 8 L7 6.5 Z" fill={color} />
    </svg>
);


/* ============================================================
   MARQUEE TICKER
   ============================================================ */
export const MarqueeTicker = () => {
    // Factual coverage/capability figures only. This strip previously showed
    // invented per-ticker returns (VNM +8.7%, FPT +12.3%, ...), which read as a
    // performance claim — banned by facebook_bot/rule.md and unsubstantiable
    // under Luật Quảng cáo 75/2025.
    const items = [
        { label: 'Stocks Covered', value: '226', up: null },
        { label: 'Exchanges', value: 'HOSE · HNX · UPCoM', up: null },
        { label: 'AI Models', value: '3 Active', up: null },
        { label: 'Derivatives', value: 'VN30F1M', up: null },
        { label: 'Signals', value: 'Daily 15:02 ICT', up: null },
        { label: 'Data', value: 'OHLC · Indicators · News', up: null },
        { label: 'Access', value: 'Free — Non-commercial', up: null },
        { label: 'Nature', value: 'Research tool, not advice', up: null },
    ];
    const doubled = [...items, ...items];

    return (
        <div
            className="w-full overflow-hidden py-3"
            style={{
                background: 'rgba(14,23,41,0.8)',
                borderTop: '1px solid rgba(201,169,110,0.1)',
                borderBottom: '1px solid rgba(201,169,110,0.1)',
            }}
            aria-hidden="true"
        >
            <div className="marquee-track">
                {doubled.map((item, i) => (
                    <div key={i} className="flex items-center gap-6 px-8">
                        <div className="flex items-center gap-2">
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', fontWeight: 500, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                                {item.label}
                            </span>
                            <span style={{
                                fontFamily: "'DM Mono', monospace", fontSize: '12px', fontWeight: 500,
                                color: item.up === true ? 'var(--market-up)' : item.up === false ? 'var(--market-down)' : 'var(--gold-primary)',
                            }}>
                                {item.value}
                            </span>
                        </div>
                        <div style={{ width: '1px', height: '12px', background: 'rgba(201,169,110,0.15)' }} />
                    </div>
                ))}
            </div>
        </div>
    );
};


/* ============================================================
   HOW IT WORKS SECTION
   ============================================================ */
export const HowItWorksSection = () => {
    const steps = [
        {
            number: '01',
            title: 'Market Ingestion at Scale',
            description: 'Every trading session, our data pipeline ingests price, volume, order flow, and derivatives data across 226 Vietnamese equities on HOSE, HNX, and UPCoM in near real-time.',
            icon: Database,
            detail: '226 stocks · 3 exchanges',
        },
        {
            number: '02',
            title: 'Multi-Model Signal Generation',
            description: 'Three proprietary LightGBM and XGBoost models cross-validate breakout patterns, momentum signals, and risk-adjusted entry points. Signals are computed automatically at 3:02 PM daily.',
            icon: Brain,
            detail: 'Daily at 15:02 ICT',
        },
        {
            number: '03',
            title: 'Actionable Intelligence Delivered',
            description: 'Each signal includes precise entry price, take-profit target, stop-loss level, and a probability score. Review on any device. Your AI Agent learns from your decisions over time.',
            icon: Target,
            detail: 'Entry · TP · SL · Score',
        },
    ];

    return (
        <motion.section
            id="how-it-works"
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="w-full max-w-6xl mx-auto px-4 py-16 md:py-24"
        >
            <div className="text-center mb-16">
                <motion.div variants={itemVariants}>
                    <SectionLabel>How It Works</SectionLabel>
                </motion.div>
                <motion.h2 variants={itemVariants} className="type-section mb-4" style={{ color: 'var(--text-primary)' }}>
                    From Raw Data to Trading Edge
                </motion.h2>
                <motion.p variants={itemVariants} className="type-body-lg max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                    An institutional-grade pipeline — automated, transparent, and built exclusively for the Vietnamese market.
                </motion.p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-px rounded-2xl overflow-hidden relative"
                style={{ background: 'rgba(201,169,110,0.1)', boxShadow: '0 0 0 1px rgba(201,169,110,0.1)' }}
            >
                {steps.map((step, i) => (
                    <motion.div
                        key={i}
                        variants={itemVariants}
                        className="flex flex-col p-7 sm:p-8"
                        style={{ background: 'var(--bg-surface)' }}
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', fontWeight: 500, color: 'var(--gold-muted)', letterSpacing: '0.12em' }}>
                                STEP {step.number}
                            </span>
                            <div className="flex-1 h-px" style={{ background: 'rgba(201,169,110,0.15)' }} />
                        </div>
                        <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                            style={{
                                background: 'linear-gradient(135deg, rgba(201,169,110,0.15), rgba(201,169,110,0.05))',
                                border: '1px solid var(--gold-border)',
                            }}
                        >
                            <step.icon size={20} style={{ color: 'var(--gold-primary)' }} />
                        </div>
                        <h3 className="type-h3 mb-3" style={{ color: 'var(--text-primary)', lineHeight: 1.3 }}>{step.title}</h3>
                        <p className="type-body-sm leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>{step.description}</p>
                        <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(201,169,110,0.08)' }}>
                            <span className="text-xs font-semibold" style={{ color: 'var(--gold-muted)', fontFamily: "'DM Mono', monospace", letterSpacing: '0.06em' }}>
                                {step.detail}
                            </span>
                        </div>
                    </motion.div>
                ))}
            </div>
        </motion.section>
    );
};


/* ============================================================
   SOCIAL PROOF SECTION — Stats + trust signals
   ============================================================ */
export const SocialProofSection = () => {
    const stats = [
        { value: '226', label: 'Stocks Monitored', sub: 'HOSE · HNX · UPCoM', icon: BarChart3 },
        { value: '3', label: 'Proprietary AI Models', sub: 'LightGBM & XGBoost', icon: Brain },
        // "Avg. Signal Score" read as an accuracy claim. It is the model's mean
        // confidence output — not a win rate and not a return. facebook_bot/rule.md:50
        // requires exactly this distinction; the website never made it.
        { value: '87%', label: 'Avg. Model Confidence', sub: 'Not a win rate or return', icon: Target },
        { value: '< 1s', label: 'Signal Delivery', sub: 'After model computation', icon: Zap },
        { value: '15:02', label: 'Daily Computation', sub: 'Post-market analysis (ICT)', icon: Clock },
        { value: '₫0', label: 'Free Tier — Forever', sub: 'No credit card required', icon: BadgeCheck },
    ];

    return (
        <motion.section
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="w-full px-4 py-16 md:py-20"
            style={{ background: 'linear-gradient(180deg, var(--bg-base) 0%, var(--bg-void) 100%)' }}
        >
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-12">
                    <motion.div variants={itemVariants}>
                        <SectionLabel>Platform Intelligence</SectionLabel>
                    </motion.div>
                    <motion.h2 variants={itemVariants} className="type-section mb-4" style={{ color: 'var(--text-primary)' }}>
                        Built on Institutional-Grade Infrastructure
                    </motion.h2>
                    <motion.p variants={itemVariants} className="type-body-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                        The same data depth and model rigor used by quantitative funds — now accessible to every Vietnamese investor.
                    </motion.p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {stats.map((stat, i) => (
                        <motion.div
                            key={i}
                            variants={itemVariants}
                            className="relative rounded-2xl p-5 sm:p-6 overflow-hidden cursor-default group"
                            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(201,169,110,0.1)' }}
                            whileHover={{ y: -2, transition: { duration: 0.2 } }}
                        >
                            <div className="absolute top-0 left-0 right-0 h-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                style={{ background: 'linear-gradient(90deg, transparent, var(--gold-primary), transparent)' }}
                            />
                            <div className="flex items-start gap-3 mb-3">
                                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ background: 'rgba(201,169,110,0.08)', border: '1px solid var(--gold-border)' }}>
                                    <stat.icon size={16} style={{ color: 'var(--gold-primary)' }} />
                                </div>
                            </div>
                            <motion.span
                                animate={{ textShadow: ['0 0 0px transparent', '0 0 16px rgba(201,169,110,0.25)', '0 0 0px transparent'] }}
                                transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
                                style={{
                                    fontFamily: "'DM Mono', monospace",
                                    fontSize: 'clamp(24px, 3.5vw, 32px)',
                                    fontWeight: 500,
                                    color: 'var(--gold-primary)',
                                    lineHeight: 1,
                                    display: 'block',
                                    marginBottom: '6px',
                                }}
                            >
                                {stat.value}
                            </motion.span>
                            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                                {stat.label}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
                                {stat.sub}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </motion.section>
    );
};


/* ============================================================
   FEATURES SECTION
   ============================================================ */
export const FeaturesSection = () => {
    const features = [
        {
            icon: Activity,
            title: 'Live Market Intelligence Dashboard',
            description: 'A real-time treemap heatmap covering 226 Vietnamese equities — visualize market breadth, sector rotation, and individual stock momentum at a glance during trading hours.',
            span: 'md:col-span-2',
            highlight: ['HOSE', 'HNX', 'UPCoM', 'Real-time'],
        },
        {
            icon: LineChart,
            title: 'Institutional-Grade Charting',
            description: 'Candlestick charts with SMA/RSI overlays and AI forecast bounds. Navigate 60 trading days of history with one-click stock selection.',
            span: 'col-span-1',
            highlight: ['AI Forecast Overlay'],
        },
        {
            icon: Cpu,
            title: 'VN30 Futures Tracker',
            description: 'Track VN30F1M intraday data with 1-minute granularity. Built-in basis analytics for derivatives traders who need real-time exposure management.',
            span: 'col-span-1',
            highlight: ['1-min candles'],
        },
        {
            icon: BarChart2,
            title: 'Quantitative Analytics Engine',
            description: 'Five-section analytics suite: signal distribution, trade performance, market breadth by sector, data pipeline health, and equity curve visualizations — all in one dashboard.',
            span: 'md:col-span-2',
            highlight: ['5 analytics modules'],
        },
    ];

    return (
        <motion.div
            id="features"
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="w-full max-w-6xl mx-auto px-4 py-16 md:py-24"
        >
            <div className="text-center mb-16">
                <motion.div variants={itemVariants}>
                    <SectionLabel>Platform Capabilities</SectionLabel>
                </motion.div>
                <motion.h2 variants={itemVariants} className="type-section mb-4" style={{ color: 'var(--text-primary)' }}>
                    Powerful Market Intelligence
                </motion.h2>
                <motion.p variants={itemVariants} className="type-body-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                    Uncover hidden market dynamics with our real-time analytics engine, built exclusively for Vietnamese markets.
                </motion.p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                {features.map((feat, i) => (
                    <motion.div
                        key={i}
                        variants={itemVariants}
                        className={`${feat.span} card-premium group relative rounded-2xl p-6 sm:p-7 overflow-hidden transition-all duration-500 cursor-default`}
                    >
                        <div className="absolute top-0 left-6 right-6 h-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                            style={{ background: 'linear-gradient(90deg, transparent, var(--gold-primary), transparent)' }}
                        />
                        <div className="flex items-center gap-3 mb-4 sm:mb-6">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--gold-border)' }}>
                                <feat.icon size={22} style={{ color: 'var(--gold-primary)' }} />
                            </div>
                            {feat.badge && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase"
                                    style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '0.08em', background: 'rgba(232,160,48,0.1)', color: 'var(--warning)', border: '1px solid rgba(232,160,48,0.25)' }}>
                                    <Clock size={10} />{feat.badge}
                                </span>
                            )}
                        </div>
                        <h3 className="type-h3 mb-3" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{feat.title}</h3>
                        <p className="type-body-sm leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>{feat.description}</p>
                        {feat.highlight && (
                            <div className="flex flex-wrap gap-2 mt-auto">
                                {feat.highlight.map((tag, j) => (
                                    <span key={j} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,169,110,0.08)', color: 'var(--gold-muted)', border: '1px solid rgba(201,169,110,0.15)', fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em' }}>
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
};


/* ============================================================
   AI AGENT SECTION — The flagship upcoming feature
   ============================================================ */
export const AIAgentSection = ({ onTabChange }) => {
    const [activeFeature, setActiveFeature] = useState(0);

    // Order execution through a connected brokerage used to be listed here. It has
    // been removed, not merely re-tagged: môi giới chứng khoán is a licensed
    // activity under Điều 86 Luật Chứng khoán, and advertising it — even as
    // "planned" — describes an activity this project cannot lawfully perform.
    // Same reason the wording below never promises output matched to a user's
    // financial profile: that is suitability assessment, i.e. regulated advice.
    const agentFeatures = [
        {
            icon: Newspaper,
            title: 'News Intelligence',
            description: 'Scans financial news, earnings releases, and macro events, then summarises them so you can read a day of market coverage in a few minutes.',
            tag: 'Live',
        },
        {
            icon: Settings,
            title: 'Your Workspace, Your Way',
            description: 'Will let you save the tickers, sectors, and indicators you follow, so the dashboard opens on the data you actually watch.',
            tag: 'In Development',
        },
        {
            icon: Target,
            title: 'Filters and Alerts',
            description: 'Will let you set your own screening thresholds on model outputs and be notified when a ticker crosses them. You define the criteria; the tool does the watching.',
            tag: 'In Development',
        },
        {
            icon: Play,
            title: 'Export and Review',
            description: 'Will let you export model outputs and historical statistics for your own research and record-keeping. Every trading decision stays entirely with you and your broker.',
            tag: 'Planned',
        },
    ];

    const tagColor = (tag) => {
        if (tag === 'Live') return { bg: 'rgba(77,184,130,0.1)', color: 'var(--market-up)', border: '1px solid rgba(77,184,130,0.25)' };
        if (tag === 'In Development') return { bg: 'rgba(201,169,110,0.1)', color: 'var(--gold-primary)', border: '1px solid rgba(201,169,110,0.25)' };
        return { bg: 'rgba(78,97,122,0.1)', color: 'var(--text-muted)', border: '1px solid rgba(78,97,122,0.2)' };
    };


    return (
        <motion.div
            id="ai-agents"
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            className="w-full max-w-6xl mx-auto px-4 py-16 md:py-24"
        >
            <div className="text-center mb-16">
                <motion.div variants={itemVariants}>
                    <SectionLabel>Coming Soon</SectionLabel>
                </motion.div>
                <motion.h2 variants={itemVariants} className="type-section mb-4" style={{ color: 'var(--text-primary)' }}>
                    Your AI Research Assistant
                </motion.h2>
                <motion.p variants={itemVariants} className="type-body-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                    A research assistant that reads the news, organises the data, and keeps your watchlist current. It will never place an order or manage money — every decision stays with you.
                </motion.p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
                {/* Left: Feature tabs */}
                <motion.div variants={itemVariants} className="flex flex-col gap-3">
                    {agentFeatures.map((feat, i) => {
                        const isActive = activeFeature === i;
                        const tc = tagColor(feat.tag);
                        return (
                            <div
                                key={i}
                                className="rounded-2xl overflow-hidden cursor-pointer"
                                style={{
                                    background: isActive ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                                    border: `1px solid ${isActive ? 'rgba(201,169,110,0.3)' : 'rgba(201,169,110,0.1)'}`,
                                    transition: 'all 0.3s ease',
                                }}
                                onClick={() => setActiveFeature(i)}
                            >
                                <div className="p-4 sm:p-5 flex items-start gap-4">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                        style={{
                                            background: isActive ? 'rgba(201,169,110,0.15)' : 'rgba(201,169,110,0.06)',
                                            border: '1px solid var(--gold-border)',
                                            transition: 'all 0.3s ease',
                                        }}
                                    >
                                        <feat.icon size={18} style={{ color: 'var(--gold-primary)' }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <h3 className="type-h4 transition-colors duration-300" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                                {feat.title}
                                            </h3>
                                            <span
                                                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                                style={{ ...tc, fontFamily: "'Outfit', sans-serif", letterSpacing: '0.06em' }}
                                            >
                                                {feat.tag}
                                            </span>
                                        </div>
                                        <div
                                            className="type-body-sm leading-relaxed overflow-hidden transition-all duration-300 ease-in-out"
                                            style={{
                                                maxHeight: isActive ? '200px' : '0px',
                                                opacity: isActive ? 1 : 0,
                                                color: 'var(--text-secondary)',
                                                marginTop: isActive ? '8px' : '0px'
                                            }}
                                        >
                                            {feat.description}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </motion.div>

                {/* Right: Visual agent card */}
                <motion.div variants={itemVariants} className="relative">
                    <div
                        className="rounded-3xl p-6 sm:p-8 relative overflow-hidden"
                        style={{
                            background: 'linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)',
                            border: '1px solid rgba(201,169,110,0.2)',
                            boxShadow: '0 8px 40px rgba(0,0,0,0.4), 0 0 60px -20px rgba(201,169,110,0.1)',
                        }}
                    >
                        {/* Background glow */}
                        <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"
                            style={{ background: 'rgba(201,169,110,0.07)' }}
                        />

                        {/* Agent header */}
                        <div className="flex items-center gap-3 mb-6">
                            <div
                                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, rgba(201,169,110,0.2), rgba(201,169,110,0.05))', border: '1px solid rgba(201,169,110,0.3)' }}
                            >
                                <Bot size={22} style={{ color: 'var(--gold-primary)' }} />
                            </div>
                            <div>
                                <p className="type-h4" style={{ color: 'var(--text-primary)' }}>DongAnh AI Agent</p>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full signal-pulse" />
                                    <p className="type-caption" style={{ color: 'var(--market-up)' }}>Monitoring markets...</p>
                                </div>
                            </div>
                        </div>

                        {/* Illustrative conversation. Previously this mocked up an order
                            being placed ("Execute the FPT trade", "Order placed: BUY FPT")
                            — depicting brokerage execution the project neither performs nor
                            is licensed to perform, on top of reading as a recommendation. */}
                        <p
                            className="type-caption mb-3"
                            style={{ color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                        >
                            Ví dụ minh hoạ · Illustrative
                        </p>
                        <div className="space-y-3 mb-6">
                            {[
                                { type: 'user', text: 'What stood out in tech today?' },
                                { type: 'agent', text: 'Three tickers you follow closed above their 20-day average. Here is where the model ranks FPT.' },
                                { type: 'signal', ticker: 'FPT', confidence: 87 },
                                { type: 'agent', text: 'This is a model score computed from historical data — not a recommendation, and not a forecast of return.' },
                            ].map((msg, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: msg.type === 'user' ? 20 : -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.15, duration: 0.4 }}
                                    className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {msg.type === 'signal' ? (
                                        <div
                                            className="w-full rounded-xl p-3"
                                            style={{ background: 'rgba(77,184,130,0.08)', border: '1px solid rgba(77,184,130,0.2)' }}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
                                                    {msg.ticker}
                                                </span>
                                                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(201,169,110,0.15)', color: 'var(--gold-primary)' }}>
                                                    MODEL SCORE
                                                </span>
                                            </div>
                                            <div className="flex gap-4 text-xs" style={{ fontFamily: "'DM Mono', monospace" }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Confidence <span style={{ color: 'var(--gold-primary)' }}>{msg.confidence}%</span></span>
                                                <span style={{ color: 'var(--text-muted)' }}>Not a win rate</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className="rounded-2xl px-4 py-2.5 max-w-[85%]"
                                            style={{
                                                background: msg.type === 'user' ? 'rgba(201,169,110,0.12)' : 'var(--bg-overlay)',
                                                border: msg.type === 'user' ? '1px solid rgba(201,169,110,0.2)' : '1px solid rgba(255,255,255,0.05)',
                                            }}
                                        >
                                            <p className="type-body-sm" style={{ color: msg.type === 'user' ? 'var(--gold-primary)' : 'var(--text-secondary)' }}>
                                                {msg.text}
                                            </p>
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </div>

                        {/* CTA */}
                        <button
                            onClick={() => onTabChange && onTabChange('analyst')}
                            className="w-full btn-primary flex items-center justify-center gap-2 cursor-pointer"
                            style={{ padding: '13px 24px', fontSize: '14px' }}
                        >
                            <Bot size={16} />
                            Try the AI Agent Preview
                            <ArrowRight size={14} />
                        </button>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
};


/* ============================================================
   AI ADVANTAGE SECTION
   ============================================================ */
export const AIAdvantageSection = ({ onTabChange }) => {
    const advantages = [
        {
            icon: Target,
            title: 'Predictive Signals',
            description: 'Our AI scans every Vietnamese equity daily, identifying high-probability opportunities before the crowd moves.',
            stat: '226',
            statLabel: 'Stocks scanned daily',
        },
        {
            icon: Brain,
            title: 'Market Sentiment Engine',
            description: 'Real-time sentiment analysis across 3 proprietary models, giving you conviction when others hesitate.',
            stat: '3',
            statLabel: 'AI models deployed',
        },
        {
            icon: Shield,
            title: 'Risk Intelligence',
            description: 'Model-computed reference levels and volatility statistics, so you can size and bound your own risk. The decision is always yours.',
            stat: '24/7',
            statLabel: 'Automated monitoring',
        },
    ];

    return (
        <motion.div
            id="ai-advantage"
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            className="w-full max-w-6xl mx-auto px-4 py-16 md:py-24"
        >
            <div className="text-center mb-16">
                <motion.div variants={itemVariants}>
                    <SectionLabel>The AI Edge</SectionLabel>
                </motion.div>
                <motion.h2 variants={itemVariants} className="type-section mb-4" style={{ color: 'var(--text-primary)' }}>
                    While Others Guess,<br />
                    <span style={{ background: 'linear-gradient(135deg, var(--gold-bright), var(--gold-primary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        You Know
                    </span>
                </motion.h2>
                <motion.p variants={itemVariants} className="type-body-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                    Our AI agents work around the clock — analyzing, predicting, and alerting — so every decision you make is backed by data, not gut feeling.
                </motion.p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center mb-16">
                {/* Left: AI visualization */}
                <motion.div variants={itemVariants} className="relative order-2 lg:order-1">
                    <div className="relative rounded-2xl overflow-hidden dashboard-preview-glow" style={{ border: '1px solid var(--gold-border)' }}>
                        <img
                            src="/assets/ai_brain_trading.png"
                            alt="AI Trading Intelligence Visualization"
                            className="w-full h-auto object-cover rounded-2xl"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 scan-line pointer-events-none rounded-2xl" />
                        <div className="absolute inset-0 pointer-events-none rounded-2xl"
                            style={{ background: 'linear-gradient(to top, var(--bg-base) 0%, transparent 40%, transparent 100%)' }}
                        />
                    </div>
                    <div
                        className="absolute -bottom-3 -right-3 sm:bottom-4 sm:right-4 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg"
                        style={{ background: 'rgba(10, 16, 32, 0.9)', backdropFilter: 'blur(12px)', border: '1px solid var(--gold-border)' }}
                    >
                        <div className="w-3 h-3 rounded-full signal-pulse" />
                        <div>
                            <p className="type-caption" style={{ color: 'var(--text-muted)' }}>Signal Generated</p>
                            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)', fontFamily: "'DM Mono', monospace" }}>
                                LIVE — AI Active
                            </p>
                        </div>
                    </div>
                </motion.div>

                {/* Right: Advantage cards */}
                <div className="flex flex-col gap-4 order-1 lg:order-2">
                    {advantages.map((adv, i) => (
                        <motion.div
                            key={i}
                            variants={itemVariants}
                            className="card-premium group relative rounded-2xl p-5 sm:p-6 overflow-hidden transition-all duration-300"
                        >
                            <div className="absolute top-0 left-6 right-6 h-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                style={{ background: 'linear-gradient(90deg, transparent, var(--gold-primary), transparent)' }}
                            />
                            <div className="relative flex items-start gap-4">
                                <div
                                    className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300"
                                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--gold-border)' }}
                                >
                                    <adv.icon size={22} style={{ color: 'var(--gold-primary)' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="type-h3 mb-1.5" style={{ color: 'var(--text-primary)' }}>{adv.title}</h3>
                                    <p className="type-body-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>{adv.description}</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl font-medium" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--gold-primary)' }}>{adv.stat}</span>
                                        <span className="type-label">{adv.statLabel}</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Dashboard preview */}
            <motion.div variants={itemVariants} className="relative">
                <div className="text-center mb-8">
                    <SectionLabel>Live Platform</SectionLabel>
                    <h3 className="type-card-title mb-2" style={{ color: 'var(--text-primary)', fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
                        See It in Action
                    </h3>
                    <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>
                        Real market data and live model outputs — presented as they are computed.
                    </p>
                </div>
                <div
                    className="relative rounded-2xl overflow-hidden dashboard-preview-glow mx-auto max-w-4xl cursor-pointer"
                    style={{ border: '1px solid var(--gold-border)' }}
                    onClick={() => onTabChange && onTabChange('dashboard')}
                >
                    <div style={{ height: '480px', overflow: 'hidden', position: 'relative' }}>
                        <img
                            src="/assets/dashboard_preview.png"
                            alt="DongAnh Capital AI Dashboard Preview"
                            loading="lazy"
                            style={{ width: '100%', height: '140%', objectFit: 'cover', objectPosition: 'center 30%', display: 'block' }}
                        />
                    </div>
                    <div className="absolute inset-0 pointer-events-none rounded-2xl"
                        style={{ background: 'linear-gradient(to top, var(--bg-surface) 0%, transparent 40%, rgba(10,16,32,0.15) 100%)' }}
                    />
                    <div className="absolute inset-0 flex items-end justify-center pb-8">
                        <button
                            onClick={(e) => { e.stopPropagation(); onTabChange && onTabChange('analyst'); }}
                            className="group flex items-center gap-2.5 btn-primary cursor-pointer"
                            style={{ padding: '14px 32px', fontSize: '15px', backdropFilter: 'blur(8px)' }}
                        >
                            <Bot size={16} />
                            Start Getting Signals
                            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};


/* ============================================================
   FUTURE ROADMAP SECTION
   ============================================================ */
export const FutureSection = () => {
    const milestones = [
        {
            quarter: 'Q1 2026',
            status: 'completed',
            title: 'Platform Launch',
            description: 'Released DongAnh Capital with real-time market data, advanced charting, and derivatives tracking for the Vietnamese market.',
        },
        {
            quarter: 'Q2 2026',
            status: 'completed',
            title: 'AI Signal Engine v1',
            description: 'Deployed three AI models for price modelling, sentiment analysis, and market trend detection across 226 Vietnamese equities.',
        },
        {
            quarter: 'Q3 2026',
            status: 'active',
            title: 'News Tracking & Saved Watchlists',
            description: 'Automated tracking of financial news, with saved watchlists so the dashboard opens on the tickers and sectors you follow.',
        },
        {
            quarter: 'Q4 2026',
            status: 'planned',
            title: 'Custom Screens & Alerts',
            description: 'Define your own thresholds over model outputs and technical indicators, and get notified when a ticker crosses them.',
        },
        {
            quarter: 'Q1 2027',
            status: 'planned',
            title: 'Research Exports & Backtest Explorer',
            description: 'Export model outputs and historical statistics, and inspect how a strategy would have behaved over past data — with full methodology shown.',
        },
    ];

    const getStatusStyle = (status) => {
        switch (status) {
            case 'completed': return {
                dotBg: 'var(--market-up)', textColor: 'var(--market-up)',
                badgeBg: 'rgba(77,184,130,0.1)', badgeBorder: 'rgba(77,184,130,0.25)',
                label: 'Completed', icon: <CheckCircle2 size={14} />,
            };
            case 'active': return {
                dotBg: 'var(--gold-primary)', textColor: 'var(--gold-primary)',
                badgeBg: 'rgba(201,169,110,0.1)', badgeBorder: 'rgba(201,169,110,0.25)',
                label: 'In Development', icon: <Rocket size={14} />, pulse: true,
            };
            default: return {
                dotBg: 'var(--text-muted)', textColor: 'var(--text-muted)',
                badgeBg: 'rgba(78,97,122,0.1)', badgeBorder: 'rgba(78,97,122,0.25)',
                label: 'Planned', icon: <Calendar size={14} />,
            };
        }
    };

    return (
        <motion.div
            id="future"
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="w-full max-w-4xl mx-auto px-4 py-16 md:py-24"
        >
            <div className="text-center mb-16">
                <motion.div variants={itemVariants}>
                    <SectionLabel>Strategic Roadmap</SectionLabel>
                </motion.div>
                <motion.h2 variants={itemVariants} className="type-section mb-4" style={{ color: 'var(--text-primary)' }}>
                    The Road Ahead
                </motion.h2>
                <motion.p variants={itemVariants} className="type-body-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>
                    From AI signals to fully autonomous trading agents — here's our roadmap to the future of Vietnamese investing.
                </motion.p>
            </div>

            <div className="relative ml-4 md:ml-8 space-y-10 sm:space-y-12 pb-8" style={{ borderLeft: '1px solid var(--navy-mid)' }}>
                {milestones.map((m, i) => {
                    const s = getStatusStyle(m.status);
                    return (
                        <motion.div key={i} variants={itemVariants} className="relative pl-6 sm:pl-8">
                            <div
                                className={`absolute -left-2 top-1.5 w-4 h-4 rounded-full ${s.pulse ? 'animate-pulse' : ''}`}
                                style={{ backgroundColor: s.dotBg, boxShadow: `0 0 0 4px var(--bg-base)` }}
                            />
                            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold tracking-wider mb-1" style={{ color: s.textColor }}>
                                {s.icon} {m.quarter}
                                <span
                                    className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase"
                                    style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '0.08em', background: s.badgeBg, color: s.textColor, border: `1px solid ${s.badgeBorder}` }}
                                >
                                    {s.label}
                                </span>
                            </div>
                            <h3 className="type-h2 mb-2" style={{ color: m.status === 'planned' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                                {m.title}
                            </h3>
                            <p
                                className={`type-body-sm leading-relaxed max-w-2xl ${m.status === 'active' ? 'rounded-lg p-4' : ''}`}
                                style={{
                                    color: 'var(--text-secondary)',
                                    ...(m.status === 'active' ? { background: 'var(--bg-surface)', border: '1px solid var(--gold-border)' } : {}),
                                }}
                            >
                                {m.description}
                            </p>
                        </motion.div>
                    );
                })}
            </div>

            <motion.div variants={itemVariants} className="text-center mt-12">
                <p className="type-body-sm" style={{ color: 'var(--text-muted)' }}>
                    Want to shape our roadmap?{' '}
                    <a href="https://www.facebook.com/profile.php?id=61590323739631" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 transition-colors" style={{ color: 'var(--gold-primary)' }}>
                        Join our community
                    </a>.
                </p>
            </motion.div>
        </motion.div>
    );
};


/* ============================================================
   EMAIL SUBSCRIBE FORM — Reusable, security-hardened
   ============================================================ */
const EmailSubscribeForm = ({ variant = 'default', ctaText = 'Get Notified at Launch', className = '', layout = 'row' }) => {
    const [email, setEmail] = useState('');
    const [honeypot, setHoneypot] = useState('');
    const [status, setStatus] = useState('idle'); // idle | loading | success | error
    const [message, setMessage] = useState('');
    const [cooldown, setCooldown] = useState(false);

    const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (cooldown || status === 'loading') return;

        const trimmed = email.trim().toLowerCase();
        if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
            setStatus('error');
            setMessage('Please enter a valid email address.');
            return;
        }
        if (trimmed.length > 254) {
            setStatus('error');
            setMessage('Email is too long.');
            return;
        }

        setStatus('loading');
        setCooldown(true);

        try {
            const result = await subscribeEmail(trimmed, honeypot);
            setStatus('success');
            setMessage(result?.message || "You're on the list!");
            setEmail('');
        } catch (err) {
            setStatus('error');
            const detail = err?.response?.data?.detail;
            if (err?.response?.status === 429) {
                setMessage('Too many requests. Please try again later.');
            } else {
                setMessage(detail || 'Something went wrong. Please try again.');
            }
        }

        // 3-second cooldown to prevent spam
        setTimeout(() => setCooldown(false), 3000);
    };

    const isGold = variant === 'gold';

    return (
        <form onSubmit={handleSubmit} className={`flex flex-col gap-3 ${className}`} noValidate>
            {/* Honeypot — invisible to users, bots auto-fill it */}
            <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, width: 0, overflow: 'hidden' }}
                aria-hidden="true"
            />

            <div className={`flex flex-col ${layout === 'row' ? 'sm:flex-row' : ''} gap-2`}>
                <input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (status !== 'idle') setStatus('idle'); }}
                    maxLength={254}
                    required
                    className="flex-1 px-4 py-3 rounded-xl text-sm focus:outline-none transition-all duration-200"
                    style={{
                        background: 'var(--bg-elevated)',
                        border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.5)' : isGold ? 'rgba(201,169,110,0.3)' : 'rgba(201,169,110,0.15)'}`,
                        color: 'var(--text-primary)',
                        fontFamily: "'Outfit', sans-serif",
                    }}
                    id="email-subscribe-input"
                />
                <motion.button
                    type="submit"
                    disabled={cooldown || status === 'loading'}
                    whileHover={!cooldown ? { scale: 1.02 } : {}}
                    whileTap={!cooldown ? { scale: 0.97 } : {}}
                    className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${cooldown || status === 'loading' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    style={{
                        background: isGold
                            ? 'linear-gradient(135deg, var(--gold-primary), var(--gold-bright, #E8C97A))'
                            : 'linear-gradient(135deg, rgba(201,169,110,0.2), rgba(201,169,110,0.1))',
                        color: isGold ? 'var(--bg-void)' : 'var(--gold-primary)',
                        border: isGold ? 'none' : '1px solid rgba(201,169,110,0.25)',
                        fontFamily: "'Outfit', sans-serif",
                        whiteSpace: 'nowrap',
                    }}
                    id="email-subscribe-button"
                >
                    {status === 'loading' ? (
                        <><Loader2 size={14} className="animate-spin" /> Subscribing...</>
                    ) : status === 'success' ? (
                        <><CheckCircle2 size={14} /> Subscribed!</>
                    ) : (
                        <><Send size={14} /> {ctaText}</>
                    )}
                </motion.button>
            </div>

            <AnimatePresence>
                {(status === 'success' || status === 'error') && (
                    <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-xs px-1"
                        style={{
                            color: status === 'success' ? 'var(--market-up)' : 'rgb(239,68,68)',
                            fontFamily: "'Outfit', sans-serif",
                        }}
                    >
                        {message}
                    </motion.p>
                )}
            </AnimatePresence>
        </form>
    );
};


/* ============================================================
   ACCESS SECTION

   Replaces the former three-tier pricing block (Free / Pro 199.000đ /
   Premium 499.000đ) and its SePay-VietQR checkout. DongAnh Capital is a
   non-commercial academic project with no registered business entity, so it
   cannot lawfully sell a subscription: doing so would require a đăng ký kinh
   doanh, a tax code, and e-invoicing under Nghị định 70/2025, and would also
   recast the service as a paid securities service under Điều 12.4 Luật Chứng
   khoán. The payment code remains in the repository, unreferenced, should an
   entity ever be registered.
   ============================================================ */
export const AccessSection = ({ onTabChange }) => {
    const { isAuthenticated } = useAuth();

    const points = [
        {
            icon: BadgeCheck,
            title: 'Free, with no paid tier',
            body: 'Every feature is available to every signed-in account. There is no subscription, no trial that converts, and no payment method on file.',
        },
        {
            icon: ShieldCheck,
            title: 'Not a financial service',
            body: 'We are not a securities company, hold no State Securities Commission licence, and provide no investment advice. Outputs are statistical model results — the decision is always yours.',
        },
        {
            icon: Infinity,
            title: 'Academic and open-ended',
            body: 'This is a student research project studying what machine learning can and cannot tell us about the Vietnamese market. Methods and limitations are published alongside the results.',
        },
    ];

    return (
        <motion.section
            id="pricing"
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="w-full max-w-5xl mx-auto px-4 py-16 md:py-24"
        >
            <div className="text-center mb-10">
                <motion.div variants={itemVariants}>
                    <SectionLabel>Access</SectionLabel>
                </motion.div>
                <motion.h2 variants={itemVariants} className="type-section mb-4" style={{ color: 'var(--text-primary)' }}>
                    Free for Everyone
                </motion.h2>
                <motion.p variants={itemVariants} className="type-body-lg max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                    Create an account, verify your email, and you have the whole platform. Nothing here is for sale.
                </motion.p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
                {points.map((p, i) => (
                    <motion.div
                        key={i}
                        variants={itemVariants}
                        className="rounded-2xl p-6 flex flex-col gap-3"
                        style={{ background: 'var(--bg-surface)', border: '1px solid rgba(201,169,110,0.12)' }}
                    >
                        <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center"
                            style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid var(--gold-border)' }}
                        >
                            <p.icon size={20} style={{ color: 'var(--gold-primary)' }} />
                        </div>
                        <h3 className="type-card-title" style={{ color: 'var(--text-primary)' }}>{p.title}</h3>
                        <p className="type-body-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{p.body}</p>
                    </motion.div>
                ))}
            </div>

            <motion.div variants={itemVariants} className="text-center">
                {!isAuthenticated && (
                    <button
                        onClick={() => onTabChange && onTabChange('register')}
                        className="btn-primary inline-flex items-center gap-2 group"
                        style={{ padding: '14px 32px', fontSize: '15px' }}
                    >
                        Create a free account
                        <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                )}
                <p className="type-caption mt-5 max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    Thông tin trên trang này chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.{' '}
                    <button
                        onClick={() => onTabChange && onTabChange('disclaimer')}
                        className="underline underline-offset-2 cursor-pointer"
                        style={{ background: 'none', border: 'none', color: 'var(--gold-primary)', font: 'inherit', padding: 0 }}
                    >
                        Đọc miễn trừ trách nhiệm →
                    </button>
                </p>
            </motion.div>
        </motion.section>
    );
};


/* ============================================================
   Q&A SECTION
   ============================================================ */
export const QAndASection = () => {
    const [openIndex, setOpenIndex] = useState(0);

    const faqs = [
        {
            q: "How do the AI trading agents work?",
            a: "Our AI agents continuously analyze 226 Vietnamese stocks using 3 proprietary models. They identify high-probability trading opportunities, calculate entry/exit prices, and generate actionable signals — all automatically, every trading day."
        },
        {
            q: "What is the upcoming AI Agent feature?",
            a: "It is a research assistant, currently in development. It will track financial news, keep your watchlists current, and let you screen model outputs against thresholds you define. It will not place orders, connect to a brokerage, or manage money — DongAnh Capital is not a fund, not a broker, and not a licensed advisory firm, and every trading decision remains yours."
        },
        {
            q: "How fast is the data update rate?",
            a: "Data is updated in near real-time during market hours. Price updates, order book shifts, and volume changes are reflected on the platform with minimal delay from the Vietnam stock exchanges."
        },
        {
            q: "Do I need coding experience to use the platform?",
            a: "No. DongAnh Capital is designed for investors, not software developers. All AI models, predictive analytics, and data tools are accessible through an intuitive, point-and-click interface."
        },
        {
            q: "What markets are currently supported?",
            a: "We currently cover Vietnamese financial markets, including HOSE, HNX, UPCoM, and the VN30 derivatives market. International market expansion is planned for late 2027."
        },
        {
            q: "Is DongAnh Capital really free?",
            a: "Yes — entirely. There is no paid tier, no trial that converts, and no payment method on file. This is a non-commercial academic research project, not a business, so nothing here is offered for sale."
        },
        {
            q: "How accurate are the AI predictions?",
            a: "Our models produce statistical scores from historical data. A confidence score expresses how strongly a model ranks a setup — it is not a win rate, not an accuracy figure, and not a forecast of return. Past performance does not guarantee future results, and no model output should be read as a recommendation to buy or sell."
        },
        {
            q: "Is this investment advice?",
            a: "No. DongAnh Capital is not a securities company and holds no licence from the State Securities Commission (UBCKNN). We provide no investment advisory service, no personalised recommendations, and no portfolio management. Everything on this site is information and analysis for research and education — every investment decision, and its consequences, are yours alone."
        },
        {
            q: "When will the AI Agent be available?",
            a: "The AI Agent is currently in development (Q4 2026 target). Subscribe with your email to be notified at launch. Early adopters will receive priority access and help shape the product through beta testing."
        },
        {
            q: "Can I upgrade or switch plans later?",
            a: "Yes. You can upgrade from Pro to Premium at any time. When you upgrade mid-cycle, unused days on your current plan are credited toward the new plan — so you only pay the difference. Switching from monthly to yearly is also supported with the same credit logic."
        },
    ];

    return (
        <motion.div
            id="qna"
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="w-full max-w-3xl mx-auto px-4 py-16 md:py-24"
        >
            <div className="text-center mb-12">
                <motion.div variants={itemVariants}>
                    <SectionLabel>Support</SectionLabel>
                </motion.div>
                <motion.h2 variants={itemVariants} className="type-section mb-4" style={{ color: 'var(--text-primary)' }}>
                    Frequently Asked Questions
                </motion.h2>
                <div className="flex items-center justify-center gap-3 mt-4">
                    <div style={{ width: '40px', height: '1px', background: 'linear-gradient(to right, transparent, var(--gold-primary))' }} />
                    <StarMark size={10} />
                    <div style={{ width: '40px', height: '1px', background: 'linear-gradient(to left, transparent, var(--gold-primary))' }} />
                </div>
            </div>

            <div className="space-y-3 sm:space-y-4" role="region" aria-label="Frequently Asked Questions">
                {faqs.map((faq, index) => {
                    const isOpen = openIndex === index;
                    const panelId = `faq-panel-${index}`;
                    const buttonId = `faq-button-${index}`;

                    return (
                        <motion.div
                            key={index}
                            variants={itemVariants}
                            className="rounded-xl overflow-hidden transition-colors duration-300"
                            style={{
                                background: isOpen ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                                border: `1px solid ${isOpen ? 'var(--gold-border-hover)' : 'var(--gold-border)'}`,
                            }}
                        >
                            <button
                                id={buttonId}
                                className="w-full px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between text-left rounded-xl cursor-pointer"
                                style={{ outline: 'none', background: 'transparent', border: 'none' }}
                                onClick={() => setOpenIndex(isOpen ? -1 : index)}
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                            >
                                <span className="type-body font-medium pr-4" style={{ color: 'var(--text-primary)', fontSize: '15px' }}>
                                    {faq.q}
                                </span>
                                {isOpen
                                    ? <ChevronUp size={18} style={{ color: 'var(--gold-primary)', flexShrink: 0 }} />
                                    : <ChevronDown size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                }
                            </button>
                            <AnimatePresence initial={false}>
                                {isOpen && (
                                    <motion.div
                                        id={panelId}
                                        role="region"
                                        aria-labelledby={buttonId}
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                                        className="overflow-hidden"
                                    >
                                        <div
                                            className="px-4 sm:px-6 pb-5 sm:pb-6 type-body-sm leading-relaxed pt-4"
                                            style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border-subtle)' }}
                                        >
                                            {faq.a}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}
            </div>

            <motion.div variants={itemVariants} className="text-center mt-8">
                <p className="type-body-sm" style={{ color: 'var(--text-muted)' }}>
                    Have another question? Reach out at{' '}
                    <a href="mailto:contact@donganhcapital.com" className="underline underline-offset-2 transition-colors" style={{ color: 'var(--gold-primary)' }}>
                        contact@donganhcapital.com
                    </a>
                </p>
            </motion.div>
        </motion.div>
    );
};


/* ============================================================
   ABOUT US SECTION
   ============================================================ */
export const AboutUsSection = () => {
    return (
        <motion.div
            id="about"
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="w-full max-w-5xl mx-auto px-4 py-16 md:py-24"
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                {/* Left Column: Origins */}
                <motion.div variants={itemVariants} className="flex flex-col justify-center">
                    <SectionLabel align="left">Our Origins</SectionLabel>
                    <h2 className="type-section mb-6 leading-tight" style={{ color: 'var(--text-primary)', fontSize: 'clamp(28px, 4vw, 44px)' }}>
                        Built by Engineers,<br />Designed for Investors.
                    </h2>
                    <p className="type-body-lg mb-8 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        DongAnh Capital is a non-commercial academic research project exploring what machine learning can and cannot
                        tell us about the Vietnamese equity market. Everything here is published openly, free of charge, as a
                        research tool — never as advice.
                    </p>
                    {/* Headcount is 5 and the names are real — the previous "lean team of
                        6" was simply wrong. Note the wording: students *at* FPT University,
                        never a project *by* the university, which would imply an
                        endorsement that is not ours to claim. */}
                    <div className="card-premium rounded-xl p-5 sm:p-6 mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-12 sm:w-14 h-12 sm:h-14 rounded-xl flex items-center justify-center shrink-0"
                                style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid var(--gold-border)' }}>
                                <Users size={24} style={{ color: 'var(--gold-primary)' }} />
                            </div>
                            <div>
                                <span className="type-number-lg" style={{ color: 'var(--gold-primary)' }}>5</span>
                                <p className="type-body-sm mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                    Sinh viên Đại học FPT — an independent student research team. Not a company, not a fund,
                                    and not a licensed securities advisory firm. Nothing here is offered for sale.
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Right Column: Contact */}
                <motion.div variants={itemVariants} className="card-premium rounded-2xl sm:rounded-3xl p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"
                        style={{ background: 'rgba(201,169,110,0.06)' }}
                    />
                    <div>
                        <h3 className="type-h2 mb-6 flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
                            <MapPin size={20} style={{ color: 'var(--gold-primary)' }} />
                            Based in
                        </h3>
                        {/* Was headed "Headquarters" over a university campus address — this
                            project has no offices and no registered place of business. */}
                        <p className="type-body font-medium mb-2 leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                            Khu Công nghệ cao Hòa Lạc
                        </p>
                        <p className="type-body-sm mb-8 sm:mb-10 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                            Km29 Đại lộ Thăng Long, Xã Hòa Lạc, TP. Hà Nội
                        </p>
                    </div>

                    <div className="space-y-3 sm:space-y-4">
                        <h4 className="type-label mb-3 sm:mb-4">Support</h4>
                        <a href="mailto:support@donganhcapital.com" className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl transition-all group cursor-pointer"
                            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--gold-border)' }}>
                            <div className="p-2 rounded-lg" style={{ background: 'rgba(201,169,110,0.1)', color: 'var(--gold-primary)' }}>
                                <Mail size={18} />
                            </div>
                            <div>
                                <p className="type-caption" style={{ color: 'var(--text-muted)' }}>Support Email</p>
                                <p className="type-body font-medium" style={{ color: 'var(--text-primary)' }}>support@donganhcapital.com</p>
                            </div>
                        </a>
                        <a href="mailto:contact@donganhcapital.com" className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl transition-all group cursor-pointer"
                            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--gold-border)' }}>
                            <div className="p-2 rounded-lg" style={{ background: 'rgba(201,169,110,0.1)', color: 'var(--gold-primary)' }}>
                                <Mail size={18} />
                            </div>
                            <div>
                                <p className="type-caption" style={{ color: 'var(--text-muted)' }}>Get in Touch</p>
                                <p className="type-body font-medium" style={{ color: 'var(--text-primary)' }}>contact@donganhcapital.com</p>
                            </div>
                        </a>
                    </div>

                    <div className="flex items-center gap-3 mt-6 sm:mt-8 pt-6 sm:pt-8" style={{ borderTop: '1px solid var(--gold-border)' }}>
                        <a href="https://www.facebook.com/profile.php?id=61590323739631" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer"
                            title="Facebook"
                            style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid var(--gold-border)', color: 'var(--text-secondary)' }}>
                            <Facebook size={18} />
                        </a>
                        <a href="https://www.youtube.com/@DongAnhCapital" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer"
                            title="YouTube"
                            style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid var(--gold-border)', color: 'var(--text-secondary)' }}>
                            <Youtube size={18} />
                        </a>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
};


/* ============================================================
   FOOTER SECTION
   ============================================================ */
export const FooterSection = ({ onTabChange }) => {
    const { locale } = useLocale();
    return (
        <footer style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--gold-border)' }}>
            <div className="max-w-6xl mx-auto px-4 py-10 sm:py-12">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 md:gap-12">
                    {/* Brand */}
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <img
                                src="/assets/NoBGLogoNoName.png"
                                alt="DongAnh Capital"
                                className="h-9 w-9 object-contain"
                                style={{ filter: 'drop-shadow(0 0 6px rgba(201,169,110,0.2))' }}
                            />
                            <span
                                className="font-semibold text-base"
                                style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-primary)' }}
                            >
                                DongAnh<span style={{ color: 'var(--gold-primary)' }}> Capital</span>
                            </span>
                        </div>
                        <p className="type-body-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                            Machine-learning market analytics for Vietnamese equities. A free, non-commercial research project — not investment advice.
                        </p>
                    </div>

                    {/* Contact */}
                    <div>
                        <h4 className="type-label mb-4" style={{ color: 'var(--text-secondary)' }}>Contact</h4>
                        <div className="space-y-2 type-body-sm">
                            <a href="mailto:contact@donganhcapital.com" className="block transition-colors hover:text-gold-primary" style={{ color: 'var(--text-muted)' }}>
                                contact@donganhcapital.com
                            </a>
                            <a href="mailto:support@donganhcapital.com" className="block transition-colors hover:text-gold-primary" style={{ color: 'var(--text-muted)' }}>
                                support@donganhcapital.com
                            </a>
                        </div>
                    </div>

                    {/* Social */}
                    <div>
                        <h4 className="type-label mb-4" style={{ color: 'var(--text-secondary)' }}>Follow Us</h4>
                        <div className="flex items-center gap-3">
                            <a href="https://www.facebook.com/profile.php?id=61590323739631" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer"
                                title="Facebook"
                                style={{ background: 'rgba(201,169,110,0.08)', border: '1px solid var(--gold-border)', color: 'var(--text-muted)' }}>
                                <Facebook size={16} />
                            </a>
                            <a href="https://www.youtube.com/@DongAnhCapital" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer"
                                title="YouTube"
                                style={{ background: 'rgba(201,169,110,0.08)', border: '1px solid var(--gold-border)', color: 'var(--text-muted)' }}>
                                <Youtube size={16} />
                            </a>
                        </div>
                        <h4 className="type-label mt-8 mb-4" style={{ color: 'var(--text-secondary)' }}>Legal</h4>
                        {/* Driven by LEGAL_LINKS so this list and LegalFooter's cannot diverge. */}
                        <div className="space-y-2 type-body-sm flex flex-col items-start">
                            {LEGAL_LINKS.map(({ slug, vi, en }) => (
                                <a
                                    key={slug}
                                    href={`/${slug}`}
                                    onClick={(e) => { e.preventDefault(); onTabChange && onTabChange(slug); }}
                                    className="block transition-colors hover:text-gold-primary text-left"
                                    style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
                                >
                                    {locale === 'vi' ? vi : en}
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Newsletter Subscribe */}
                <div className="mt-8 sm:mt-10 pt-6 sm:pt-8" style={{ borderTop: '1px solid var(--gold-border)' }}>
                    <div className="max-w-md mx-auto text-center">
                        <h4 className="type-label mb-2" style={{ color: 'var(--text-secondary)' }}>Stay Updated</h4>
                        <p className="type-caption mb-3" style={{ color: 'var(--text-muted)' }}>
                            Get notified when new features and products launch.
                        </p>
                        <EmailSubscribeForm ctaText="Subscribe" />
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="mt-8 sm:mt-10 pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-4"
                    style={{ borderTop: '1px solid var(--gold-border)' }}>
                    <p className="type-caption" style={{ color: 'var(--text-muted)' }}>
                        © {new Date().getFullYear()} DongAnh Capital. All rights reserved.
                    </p>
                    <p className="type-caption" style={{ color: 'var(--text-muted)' }}>
                        Hà Nội, Việt Nam
                    </p>
                </div>

                {/* Risk Disclaimer */}
                <div
                    className="mt-6 pt-6 type-caption leading-relaxed text-center max-w-3xl mx-auto"
                    style={{ borderTop: '1px solid var(--gold-border)', color: 'var(--text-muted)' }}
                >
                    The signals, analytics, and forecasts provided by DongAnh Capital are for informational and educational purposes only.
                    They do not constitute investment advice or a recommendation to buy or sell any security.
                    All investments involve risk, including possible loss of principal. Past signal performance is not indicative of future results.
                    Always conduct your own due diligence before making investment decisions.
                </div>
            </div>
        </footer>
    );
};
