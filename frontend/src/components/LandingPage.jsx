import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Menu, X, Bot, Cpu, Sparkles, ChevronUp } from 'lucide-react';
import { FeaturesSection, AIAdvantageSection, FutureSection, QAndASection, AboutUsSection, FooterSection } from './LandingSections';

// Animated counter hook
const useCounter = (end, duration = 2000, startOnView = true) => {
    const [count, setCount] = useState(0);
    const [hasStarted, setHasStarted] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!startOnView) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting && !hasStarted) setHasStarted(true); },
            { threshold: 0.3 }
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [hasStarted, startOnView]);

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

// Floating particles component
const FloatingParticles = () => {
    const particles = Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${50 + Math.random() * 50}%`,
        delay: `${Math.random() * 8}s`,
        size: Math.random() > 0.5 ? '3px' : '2px',
    }));

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.map(p => (
                <div
                    key={p.id}
                    className="particle"
                    style={{
                        left: p.left,
                        top: p.top,
                        animationDelay: p.delay,
                        width: p.size,
                        height: p.size,
                    }}
                />
            ))}
        </div>
    );
};

const LandingPage = ({ onTabChange }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [activeSection, setActiveSection] = useState('hero');
    const [navScrolled, setNavScrolled] = useState(false);
    const [showBackToTop, setShowBackToTop] = useState(false);

    const scrollContainerRef = useRef(null);

    // Animated counters for hero stats
    const stocksCounter = useCounter(400, 2000);
    const modelsCounter = useCounter(6, 1500);

    // 3.2: Navbar backdrop on scroll + back-to-top visibility
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const handleScroll = () => {
            setNavScrolled(container.scrollTop > 100);
            setShowBackToTop(container.scrollTop > window.innerHeight * 0.8);
        };
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    // 3.1: IntersectionObserver to highlight active nav link on scroll
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const sectionIds = ['hero', 'features', 'ai-advantage', 'future', 'qna', 'about'];
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id || 'hero');
                    }
                }
            },
            { root: container, rootMargin: '-30% 0px -60% 0px', threshold: 0 }
        );

        sectionIds.forEach((id) => {
            const el = container.querySelector(`#${id}`);
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, []);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.15,
                delayChildren: 0.1
            }
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
    };

    const navLinks = [
        { id: 'features', label: 'Features' },
        { id: 'ai-advantage', label: 'AI Advantage' },
        { id: 'future', label: 'Roadmap' },
        { id: 'qna', label: 'Q&A' },
        { id: 'about', label: 'About' }
    ];

    // 3.1: Smooth scroll to section
    const scrollToSection = (id) => {
        const container = scrollContainerRef.current;
        if (!container) return;
        if (id === 'hero') {
            container.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        const el = container.querySelector(`#${id}`);
        if (el) {
            const offset = el.offsetTop - 80; // account for fixed nav
            container.scrollTo({ top: offset, behavior: 'smooth' });
        }
    };

    return (
        <div className="w-full h-screen bg-[#000000] text-white flex flex-col relative overflow-hidden font-sans">

            {/* Premium animated gradient background — replaces Spline globe */}
            <div className="absolute inset-0 z-0 hero-gradient-bg" />

            {/* Hero background image — faded for texture */}
            <div
                className="absolute inset-0 z-0 opacity-20"
                style={{
                    backgroundImage: 'url(/assets/hero_ai_trading.png)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center 40%',
                    backgroundRepeat: 'no-repeat',
                    maskImage: 'radial-gradient(ellipse at 50% 40%, black 20%, transparent 70%)',
                    WebkitMaskImage: 'radial-gradient(ellipse at 50% 40%, black 20%, transparent 70%)',
                }}
            />

            {/* Floating particles */}
            <FloatingParticles />

            {/* 3.2: Navbar with scroll-aware backdrop */}
            <nav className={`fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 md:px-12 py-4 md:py-5 flex items-center justify-between transition-all duration-300 ${navScrolled ? 'bg-black/80 backdrop-blur-lg border-b border-white/10' : ''}`}>
                {/* Logo */}
                <div
                    className="text-white font-medium text-lg md:text-xl tracking-tight flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => scrollToSection('hero')}
                >
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center font-bold text-lg rounded-lg">D</div>
                    <span className="hidden sm:inline">DongAnh Capital</span>
                    <span className="sm:hidden">DAC</span>
                </div>

                <div
                    onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                        e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
                    }}
                    className="group relative hidden md:flex items-center gap-8 text-sm font-medium text-gray-300 px-8 py-3 rounded-full bg-white/5 backdrop-blur-md border border-white/10"
                >
                    <div
                        className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full"
                        style={{
                            background: `radial-gradient(100px circle at var(--mouse-x) var(--mouse-y), rgba(96, 165, 250, 0.8), transparent 100%)`,
                            WebkitMask: `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
                            WebkitMaskComposite: `xor`,
                            maskComposite: `exclude`,
                            padding: `1px`,
                        }}
                    />
                    {navLinks.map((link) => (
                        <button
                            key={link.id}
                            onClick={() => scrollToSection(link.id)}
                            className={`transition-colors duration-300 relative ${activeSection === link.id ? 'text-blue-400 font-semibold drop-shadow-[0_0_8px_rgba(37,99,235,0.8)]' : 'hover:text-white'}`}
                        >
                            {link.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        className="hidden md:flex px-5 py-2.5 text-sm font-medium rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition-all cursor-pointer items-center gap-2 whitespace-nowrap"
                        onClick={() => onTabChange && onTabChange('dashboard')}
                    >
                        Get Started — Free
                        <ArrowRight size={16} />
                    </button>
                    {/* Hamburger — mobile only */}
                    <button
                        className="md:hidden flex items-center justify-center w-10 h-10 rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md"
                        onClick={() => setIsMobileMenuOpen(v => !v)}
                        aria-label="Toggle menu"
                    >
                        {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                </div>
            </nav>

            {/* Mobile nav dropdown */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="fixed top-[64px] left-0 right-0 z-50 md:hidden bg-black/95 backdrop-blur-md flex flex-col px-6 py-4 gap-1 overflow-hidden"
                    >
                        {navLinks.map((link) => (
                            <button
                                key={link.id}
                                onClick={() => { scrollToSection(link.id); setIsMobileMenuOpen(false); }}
                                className={`text-left py-3.5 text-lg font-medium border-b border-white/5 last:border-0 transition-colors ${activeSection === link.id ? 'text-blue-400' : 'text-gray-300'
                                    }`}
                            >
                                {link.label}
                            </button>
                        ))}
                        <button
                            onClick={() => { onTabChange && onTabChange('dashboard'); setIsMobileMenuOpen(false); }}
                            className="mt-4 w-full py-3.5 px-5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                            Get Started — Free <ArrowRight size={16} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* All sections rendered inline inside scroll container */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative z-10">

                {/* Hero Section */}
                <div id="hero" className="min-h-[100dvh] flex flex-col items-center relative">
                    {/* Dark overlay gradient below hero to separate from content */}
                    <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black to-transparent z-10 pointer-events-none"></div>

                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="flex flex-col items-center text-center max-w-5xl mx-auto w-full relative z-20 mt-auto mb-16 md:mb-24 pointer-events-auto px-4 sm:px-6"
                    >
                        {/* Badges */}
                        <motion.div variants={itemVariants} className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-8 sm:mb-10">
                            <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-xs font-semibold tracking-wide uppercase text-gray-200">
                                <Bot size={12} className="text-blue-400" />
                                <span className="text-gray-400">AI-POWERED SIGNALS</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-xs font-semibold tracking-wide uppercase text-gray-200">
                                <Cpu size={12} className="text-purple-400" />
                                <span className="text-gray-400">6 PROPRIETARY MODELS</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-xs font-semibold tracking-wide uppercase text-gray-200">
                                <Sparkles size={12} className="text-amber-400" />
                                <span className="text-gray-400">COMPLETELY FREE</span>
                            </div>
                        </motion.div>

                        {/* Main headline */}
                        <motion.h1 variants={itemVariants} className="text-3xl sm:text-5xl md:text-6xl lg:text-[72px] font-bold leading-[1.08] tracking-tighter mb-4 pb-2 cursor-default">
                            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400">Make Trading AI Agents</span>
                            <br />
                            <span className="text-shimmer">Your Unfair Advantage</span>
                        </motion.h1>

                        {/* Subtitle */}
                        <motion.p variants={itemVariants} className="text-sm sm:text-base md:text-lg text-gray-400 max-w-xl mx-auto mb-4 leading-relaxed font-medium cursor-default">
                            Our AI analyzes 400+ Vietnamese stocks daily so you don't have to. Proprietary signals, real-time intelligence, zero cost.
                        </motion.p>

                        {/* Free pricing statement */}
                        <motion.p variants={itemVariants} className="text-xs sm:text-sm text-gray-500 mb-8 cursor-default">
                            No credit card required. No hidden fees. Start in 30 seconds.
                        </motion.p>

                        {/* CTA button */}
                        <motion.div variants={itemVariants}>
                            <button
                                onClick={() => onTabChange && onTabChange('dashboard')}
                                className="group px-8 py-4 text-sm sm:text-base font-semibold rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2.5 transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98]"
                            >
                                Start Getting Signals
                                <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                            </button>
                        </motion.div>

                        {/* Social proof counters */}
                        <motion.div variants={itemVariants} className="flex flex-wrap justify-center gap-6 md:gap-10 mt-12 text-center">
                            <div ref={stocksCounter.ref}>
                                <span className="text-2xl md:text-3xl font-black text-white">{stocksCounter.count}+</span>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mt-1 font-semibold">Stocks Analyzed Daily</p>
                            </div>
                            <div className="w-px h-10 bg-white/10 hidden md:block"></div>
                            <div>
                                <span className="text-2xl md:text-3xl font-black text-white">Real-time</span>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mt-1 font-semibold">Market Intelligence</p>
                            </div>
                            <div className="w-px h-10 bg-white/10 hidden md:block"></div>
                            <div ref={modelsCounter.ref}>
                                <span className="text-2xl md:text-3xl font-black text-white">{modelsCounter.count}</span>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mt-1 font-semibold">AI Models</p>
                            </div>
                        </motion.div>
                    </motion.div>
                </div>

                {/* Dark section background for content below hero */}
                <div className="bg-black relative z-20">
                    <FeaturesSection />
                    <AIAdvantageSection onTabChange={onTabChange} />
                    <FutureSection />
                    <QAndASection />
                    <AboutUsSection />
                    <FooterSection />
                </div>
            </div>

            {/* Back to top button */}
            <AnimatePresence>
                {showBackToTop && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => scrollToSection('hero')}
                        className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-white/10 border border-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-all shadow-lg"
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