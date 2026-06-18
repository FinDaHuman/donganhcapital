import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Menu, X, ChevronUp, Bot, LogIn } from 'lucide-react';
import {
    HowItWorksSection,
    FeaturesSection,
    AIAgentSection,
    AIAdvantageSection,
    SocialProofSection,
    TestimonialsSection,
    FutureSection,
    PricingSection,
    QAndASection,
    AboutUsSection,
    FooterSection,
    MarqueeTicker,
} from './LandingSections';
import { StarMark } from './StarMark';
import { useAuth } from '../context/AuthContext';

/* ── Animated counter hook ── */
const useCounter = (end, duration = 2000) => {
    const [count, setCount] = useState(0);
    const [hasStarted, setHasStarted] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting && !hasStarted) setHasStarted(true); },
            { threshold: 0.3 }
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [hasStarted]);

    useEffect(() => {
        if (!hasStarted) return;
        let start = 0;
        const increment = end / (duration / 16);
        const timer = setInterval(() => {
            start += increment;
            if (start >= end) { setCount(end); clearInterval(timer); }
            else setCount(Math.floor(start));
        }, 16);
        return () => clearInterval(timer);
    }, [hasStarted, end, duration]);

    return { count, ref };
};

/* ── Animation Variants ── */
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1, delayChildren: 0.05 }
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

/* ── Floating particles ── */
const FloatingParticles = () => {
    const particles = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2 + 1,
        duration: Math.random() * 8 + 6,
        delay: Math.random() * 4,
        opacity: Math.random() * 0.4 + 0.1,
    }));

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.map(p => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-full"
                    style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: p.size,
                        height: p.size,
                        background: `rgba(201,169,110,${p.opacity})`,
                    }}
                    animate={{
                        y: [0, -80, 0],
                        x: [0, Math.random() > 0.5 ? 20 : -20, 0],
                        opacity: [0, p.opacity, 0],
                    }}
                    transition={{
                        duration: p.duration,
                        delay: p.delay,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />
            ))}
        </div>
    );
};

/* ============================================================
   LANDING PAGE
   ============================================================ */
const LandingPage = ({ onTabChange }) => {
    const { isAuthenticated, loading: authLoading } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [activeSection, setActiveSection] = useState('hero');
    const [navScrolled, setNavScrolled] = useState(false);
    const [showBackToTop, setShowBackToTop] = useState(false);
    const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });

    const scrollContainerRef = useRef(null);

    /* Animated counters */
    const stocksCounter = useCounter(400, 2200);
    const modelsCounter = useCounter(3, 1500);
    const accuracyCounter = useCounter(87, 1800);

    /* Mouse-based spotlight */
    const handleMouseMove = useCallback((e) => {
        setMousePos({
            x: e.clientX / window.innerWidth,
            y: e.clientY / window.innerHeight,
        });
    }, []);

    /* Navbar backdrop + back-to-top */
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const handleScroll = () => {
            setNavScrolled(container.scrollTop > 60);
            setShowBackToTop(container.scrollTop > window.innerHeight * 0.8);
        };
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    /* IntersectionObserver — with improved rootMargin to reduce missed triggers */
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const sectionIds = ['hero', 'how-it-works', 'features', 'ai-agents', 'ai-advantage', 'future', 'pricing', 'qna', 'about'];
        let lastScrollTop = 0;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id || 'hero');
                    }
                });
            },
            { root: container, rootMargin: '-15% 0px -55% 0px', threshold: 0 }
        );

        const handleScrollFallback = () => {
            // Fallback: update based on current scroll if IntersectionObserver misses
            const scrollTop = container.scrollTop;
            lastScrollTop = scrollTop;
        };
        container.addEventListener('scroll', handleScrollFallback, { passive: true });

        sectionIds.forEach((id) => {
            const el = container.querySelector(`#${id}`);
            if (el) observer.observe(el);
        });

        return () => {
            observer.disconnect();
            container.removeEventListener('scroll', handleScrollFallback);
        };
    }, []);

    const navLinks = [
        { id: 'features',      label: 'Platform' },
        { id: 'ai-agents',     label: 'AI Agents' },
        { id: 'pricing',       label: 'Pricing' },
        { id: 'qna',           label: 'Q&A' },
        { id: 'about',         label: 'About' },
    ];

    /* Smooth scroll */
    const scrollToSection = useCallback((id) => {
        const container = scrollContainerRef.current;
        if (!container) return;
        if (id === 'hero') {
            container.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        const el = container.querySelector(`#${id}`);
        if (el) {
            const containerRect = container.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            // Calculate absolute position relative to scroll container, minus header offset
            const offset = elRect.top - containerRect.top + container.scrollTop - 72;
            container.scrollTo({ top: offset, behavior: 'smooth' });
        }
    }, []);

    return (
        <div
            className="w-full h-screen flex flex-col relative overflow-hidden"
            style={{ backgroundColor: 'var(--bg-void)', color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}
            onMouseMove={handleMouseMove}
        >
            {/* ── Deep void base ── */}
            <div className="absolute inset-0 z-0" style={{ background: 'var(--bg-void)' }} />

            {/* ── Background image ── */}
            <div
                className="absolute inset-0 z-0"
                style={{
                    backgroundImage: 'url(/assets/hero_premium_bg.png)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center center',
                    backgroundRepeat: 'no-repeat',
                    opacity: 0.5,
                    maskImage: 'radial-gradient(ellipse 90% 80% at 50% 50%, black 0%, transparent 100%)',
                    WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 50%, black 0%, transparent 100%)',
                }}
            />

            {/* ── Mouse-reactive gold spotlight ── */}
            <div
                className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-700"
                style={{
                    background: `radial-gradient(ellipse 60% 50% at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(201,169,110,0.07) 0%, transparent 70%)`,
                }}
            />

            {/* ── Ambient top-center glow ── */}
            <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] z-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse at 50% 0%, rgba(201,169,110,0.09) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
            />

            {/* ── Grain texture overlay ── */}
            <div
                className="absolute inset-0 z-0 pointer-events-none opacity-[0.025]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'repeat',
                    backgroundSize: '200px 200px',
                }}
            />

            {/* ============================================================
                NAVBAR
               ============================================================ */}
            <nav
                className="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
                style={{
                    padding: navScrolled ? '12px 24px' : '18px 24px',
                    ...(navScrolled ? {
                        backgroundColor: 'rgba(6, 11, 20, 0.9)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        borderBottom: '1px solid rgba(201,169,110,0.12)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    } : {}),
                }}
            >
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 relative">
                    {/* Logo */}
                    <div
                        className="flex items-center gap-3 cursor-pointer group shrink-0"
                        onClick={() => scrollToSection('hero')}
                    >
                        <img
                            src="/assets/NoBGLogoNoName.png"
                            alt="DongAnh Capital"
                            className="h-9 w-9 object-contain transition-all duration-300 group-hover:opacity-80"
                            style={{ filter: 'drop-shadow(0 0 10px rgba(201,169,110,0.3))' }}
                        />
                        <span
                            className="hidden sm:block font-semibold text-sm transition-opacity duration-200 group-hover:opacity-80"
                            style={{
                                fontFamily: "'Outfit', sans-serif",
                                letterSpacing: '0.2em',
                                textTransform: 'uppercase',
                                color: 'var(--text-primary)',
                            }}
                        >
                            DongAnh<span style={{ color: 'var(--gold-primary)' }}> Capital</span>
                        </span>
                    </div>

                    {/* Desktop nav — glass pill */}
                    <div
                        className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-1 text-sm font-medium px-6 py-2.5 rounded-full"
                        style={{
                            background: 'rgba(14, 23, 41, 0.75)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            border: '1px solid rgba(201,169,110,0.14)',
                        }}
                    >
                        {navLinks.map((link) => (
                            <button
                                key={link.id}
                                onClick={() => scrollToSection(link.id)}
                                className="relative px-4 py-2 rounded-full transition-all duration-200 cursor-pointer"
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    color: activeSection === link.id ? 'var(--gold-primary)' : 'var(--text-secondary)',
                                    fontWeight: activeSection === link.id ? 600 : 400,
                                    background: activeSection === link.id ? 'rgba(201,169,110,0.08)' : 'transparent',
                                    border: 'none',
                                }}
                            >
                                {link.label}
                            </button>
                        ))}
                    </div>

                    {/* CTA + Auth + Hamburger */}
                    <div className="flex items-center gap-2 shrink-0">
                        {!authLoading && (
                            isAuthenticated ? (
                                <button
                                    className="hidden md:flex items-center gap-2 whitespace-nowrap btn-primary cursor-pointer"
                                    style={{ padding: '10px 22px', fontSize: '13px' }}
                                    onClick={() => onTabChange && onTabChange('analyst')}
                                >
                                    <Bot size={14} />
                                    View AI Signals
                                </button>
                            ) : (
                                <>
                                    <button
                                        className="hidden md:flex items-center gap-2 whitespace-nowrap btn-ghost cursor-pointer"
                                        style={{ padding: '9px 18px', fontSize: '13px' }}
                                        onClick={() => onTabChange && onTabChange('login')}
                                    >
                                        <LogIn size={14} />
                                        Sign In
                                    </button>
                                    <button
                                        className="hidden md:flex items-center gap-2 whitespace-nowrap btn-primary cursor-pointer"
                                        style={{ padding: '10px 20px', fontSize: '13px' }}
                                        onClick={() => onTabChange && onTabChange('register')}
                                    >
                                        Start Free
                                    </button>
                                </>
                            )
                        )}
                        <button
                            className="md:hidden flex items-center justify-center w-10 h-10 rounded-full cursor-pointer"
                            style={{
                                border: '1px solid rgba(201,169,110,0.2)',
                                background: 'rgba(14, 23, 41, 0.8)',
                                color: 'var(--text-primary)',
                                backdropFilter: 'blur(12px)',
                            }}
                            onClick={() => setIsMobileMenuOpen(v => !v)}
                            aria-label="Toggle menu"
                        >
                            {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── Mobile nav dropdown ── */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="fixed top-[60px] left-0 right-0 z-50 md:hidden flex flex-col overflow-hidden"
                        style={{
                            background: 'rgba(6, 11, 20, 0.97)',
                            backdropFilter: 'blur(20px)',
                            borderBottom: '1px solid rgba(201,169,110,0.12)',
                        }}
                    >
                        <div className="px-6 py-3 flex flex-col gap-1">
                            {navLinks.map((link) => (
                                <button
                                    key={link.id}
                                    onClick={() => { scrollToSection(link.id); setIsMobileMenuOpen(false); }}
                                    className="text-left px-4 py-3.5 rounded-xl text-base font-medium transition-colors cursor-pointer"
                                    style={{
                                        fontFamily: "'Outfit', sans-serif",
                                        color: activeSection === link.id ? 'var(--gold-primary)' : 'var(--text-secondary)',
                                        background: activeSection === link.id ? 'rgba(201,169,110,0.06)' : 'transparent',
                                        border: 'none',
                                    }}
                                >
                                    {link.label}
                                </button>
                            ))}
                            {authLoading ? null : isAuthenticated ? (
                                <button
                                    onClick={() => { onTabChange && onTabChange('analyst'); setIsMobileMenuOpen(false); }}
                                    className="mt-2 w-full py-3.5 px-5 rounded-full font-semibold flex items-center justify-center gap-2 btn-primary cursor-pointer"
                                    style={{ fontSize: '15px' }}
                                >
                                    <Bot size={16} />
                                    View AI Signals
                                </button>
                            ) : (
                                <div className="mt-2 flex flex-col gap-2">
                                    <button
                                        onClick={() => { onTabChange && onTabChange('register'); setIsMobileMenuOpen(false); }}
                                        className="w-full py-3.5 px-5 rounded-full font-semibold flex items-center justify-center gap-2 btn-primary cursor-pointer"
                                        style={{ fontSize: '15px' }}
                                    >
                                        Start Free
                                    </button>
                                    <button
                                        onClick={() => { onTabChange && onTabChange('login'); setIsMobileMenuOpen(false); }}
                                        className="w-full py-3 px-5 rounded-full font-medium flex items-center justify-center gap-2 btn-ghost cursor-pointer"
                                        style={{ fontSize: '14px' }}
                                    >
                                        <LogIn size={16} />
                                        Sign In
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ============================================================
                SCROLL CONTAINER
               ============================================================ */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative z-10">

                {/* ── HERO SECTION ── */}
                <div
                    id="hero"
                    className="relative flex flex-col items-center justify-center"
                    style={{ minHeight: '100dvh' }}
                >
                    {/* Floating particles */}
                    <FloatingParticles />

                    {/* Bottom fade */}
                    <div
                        className="absolute bottom-0 left-0 right-0 h-64 z-10 pointer-events-none"
                        style={{ background: 'linear-gradient(to top, var(--bg-void) 0%, transparent 100%)' }}
                    />

                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="relative z-20 flex flex-col items-center text-center w-full max-w-5xl mx-auto px-5 sm:px-8"
                        style={{ paddingTop: '120px', paddingBottom: '80px' }}
                    >
                        {/* ── Overline label ── */}
                        <motion.div variants={itemVariants} className="flex items-center gap-3 mb-8">
                            <motion.div
                                animate={{ scaleX: [0, 1] }}
                                transition={{ duration: 0.8, delay: 0.3 }}
                                style={{ width: '32px', height: '1px', background: 'var(--gold-primary)', opacity: 0.6 }}
                            />
                            <motion.span
                                animate={{ opacity: [0, 1] }}
                                transition={{ duration: 1, delay: 0.5 }}
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    letterSpacing: '0.28em',
                                    textTransform: 'uppercase',
                                    color: 'var(--gold-primary)',
                                }}
                            >
                                AI Intelligence for Vietnamese Markets
                            </motion.span>
                            <motion.div
                                animate={{ scaleX: [0, 1] }}
                                transition={{ duration: 0.8, delay: 0.3 }}
                                style={{ width: '32px', height: '1px', background: 'var(--gold-primary)', opacity: 0.6, transformOrigin: 'right' }}
                            />
                        </motion.div>

                        {/* ── Main headline ── */}
                        <motion.h1 variants={itemVariants} className="mb-7 cursor-default">
                            <span
                                className="block"
                                style={{
                                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                                    fontSize: 'clamp(38px, 6.5vw, 80px)',
                                    fontWeight: 600,
                                    lineHeight: 1.04,
                                    color: 'var(--text-primary)',
                                    letterSpacing: '-0.02em',
                                }}
                            >
                                Make trading AI agents
                            </span>
                            <span
                                className="block"
                                style={{
                                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                                    fontSize: 'clamp(40px, 7.5vw, 88px)',
                                    fontWeight: 700,
                                    lineHeight: 1.04,
                                    letterSpacing: '-0.02em',
                                    paddingBottom: '6px',
                                    background: 'linear-gradient(135deg, var(--gold-bright, #E8C97A), var(--gold-primary, #C9A96E))',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                }}
                            >
                                your unfair advantage
                            </span>
                        </motion.h1>

                        {/* ── Subtitle ── */}
                        <motion.p
                            variants={itemVariants}
                            className="max-w-[580px] mx-auto mb-3 leading-relaxed cursor-default"
                            style={{
                                fontFamily: "'Outfit', sans-serif",
                                fontSize: 'clamp(14px, 2.2vw, 18px)',
                                fontWeight: 400,
                                color: 'var(--text-secondary)',
                                lineHeight: 1.7,
                            }}
                        >
                            An AI Agent that tracks market news, learns your trading style, suggests trades tailored to your taste, and executes with your approval — across 400+ Vietnamese equities.
                        </motion.p>

                        {/* ── Trust micro-line ── */}
                        <motion.p
                            variants={itemVariants}
                            className="mb-9 cursor-default"
                            style={{
                                fontFamily: "'Outfit', sans-serif",
                                fontSize: '12px',
                                color: 'var(--text-muted)',
                                letterSpacing: '0.04em',
                            }}
                        >
                            No credit card · No hidden fees · Free forever
                        </motion.p>

                        {/* ── Dual CTA ── */}
                        <motion.div variants={itemVariants} className="flex flex-col items-center gap-3 mb-14">
                            <div className="flex flex-wrap items-center justify-center gap-3">
                                <motion.button
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => onTabChange && onTabChange(isAuthenticated ? 'analyst' : 'register')}
                                    className="group flex items-center gap-2.5 btn-primary cursor-pointer"
                                    style={{ padding: '14px 32px', fontSize: '15px' }}
                                >
                                    <Bot size={16} />
                                    {(!authLoading && isAuthenticated) ? 'Meet Your AI Agent' : 'Start Free — No Card'}
                                    <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                                </motion.button>

                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => scrollToSection('how-it-works')}
                                    className="flex items-center gap-2 btn-secondary cursor-pointer"
                                    style={{ padding: '13px 28px', fontSize: '14px' }}
                                >
                                    How It Works ↓
                                </motion.button>
                            </div>
                            {!authLoading && !isAuthenticated && (
                                <button
                                    onClick={() => onTabChange && onTabChange('login')}
                                    className="cursor-pointer transition-colors"
                                    style={{ background: 'none', border: 'none', fontFamily: "'Outfit', sans-serif", fontSize: '13px', color: 'var(--text-muted)' }}
                                >
                                    Already have an account?{' '}
                                    <span style={{ color: 'var(--gold-primary)', fontWeight: 500 }}>Sign In →</span>
                                </button>
                            )}
                        </motion.div>

                        {/* ── Stats row ── */}
                        <motion.div
                            variants={itemVariants}
                            className="flex flex-wrap justify-center items-center gap-0"
                            style={{
                                background: 'rgba(14, 23, 41, 0.7)',
                                backdropFilter: 'blur(16px)',
                                border: '1px solid rgba(201,169,110,0.13)',
                                borderRadius: '16px',
                                padding: '20px 32px',
                            }}
                        >
                            {[
                                { ref: stocksCounter.ref, value: `${stocksCounter.count}+`, label: 'Stocks Monitored' },
                                { ref: null, value: 'Real-time', label: 'Market Intelligence' },
                                { ref: modelsCounter.ref, value: modelsCounter.count.toString(), label: 'AI Models' },
                                { ref: accuracyCounter.ref, value: `${accuracyCounter.count}%`, label: 'Avg. Signal Score' },
                            ].map((stat, i, arr) => (
                                <React.Fragment key={i}>
                                    <div ref={stat.ref} className="flex flex-col items-center px-6 sm:px-8 py-2">
                                        <motion.span
                                            animate={{ textShadow: ['0 0 0px rgba(201,169,110,0)', '0 0 20px rgba(201,169,110,0.4)', '0 0 0px rgba(201,169,110,0)'] }}
                                            transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
                                            style={{
                                                fontFamily: "'DM Mono', monospace",
                                                fontSize: 'clamp(20px, 3vw, 26px)',
                                                fontWeight: 500,
                                                color: 'var(--gold-primary)',
                                                lineHeight: 1,
                                            }}
                                        >
                                            {stat.value}
                                        </motion.span>
                                        <p className="type-label mt-2" style={{ whiteSpace: 'nowrap' }}>
                                            {stat.label}
                                        </p>
                                    </div>
                                    {i < arr.length - 1 && (
                                        <div
                                            className="hidden sm:block h-10 w-px"
                                            style={{ background: 'rgba(201,169,110,0.15)' }}
                                        />
                                    )}
                                </React.Fragment>
                            ))}
                        </motion.div>

                        {/* ── Art deco divider ── */}
                        <motion.div variants={itemVariants} className="mt-10 flex items-center gap-4" style={{ opacity: 0.25 }}>
                            <div style={{ width: '56px', height: '1px', background: 'linear-gradient(to right, transparent, var(--gold-primary))' }} />
                            <StarMark size={12} />
                            <div style={{ width: '56px', height: '1px', background: 'linear-gradient(to left, transparent, var(--gold-primary))' }} />
                        </motion.div>

                        {/* ── Scroll cue ── */}
                        <motion.div
                            variants={itemVariants}
                            className="mt-8 flex flex-col items-center gap-2"
                            style={{ opacity: 0.35 }}
                        >
                            <motion.div
                                animate={{ y: [0, 7, 0] }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                            >
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <path d="M10 4v12M5 11l5 5 5-5" stroke="var(--gold-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </motion.div>
                        </motion.div>
                    </motion.div>
                </div>

                {/* ── Content sections below hero ── */}
                <div className="relative z-20" style={{ backgroundColor: 'var(--bg-base)' }}>
                    <MarqueeTicker />
                    <HowItWorksSection />
                    <SocialProofSection />
                    <FeaturesSection />
                    <AIAgentSection onTabChange={onTabChange} />
                    <AIAdvantageSection onTabChange={onTabChange} />
                    <TestimonialsSection />
                    <FutureSection />
                    <PricingSection onTabChange={onTabChange} />
                    <QAndASection />
                    <AboutUsSection />
                    <FooterSection onTabChange={onTabChange} />
                </div>
            </div>

            {/* ── Back to top button ── */}
            <AnimatePresence>
                {showBackToTop && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => scrollToSection('hero')}
                        className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full flex items-center justify-center shadow-lg cursor-pointer"
                        style={{
                            background: 'rgba(14, 23, 41, 0.9)',
                            border: '1px solid rgba(201,169,110,0.25)',
                            color: 'var(--gold-primary)',
                            backdropFilter: 'blur(12px)',
                        }}
                        aria-label="Back to top"
                    >
                        <ChevronUp size={20} />
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LandingPage;