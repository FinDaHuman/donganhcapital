import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import Spline from '@splinetool/react-spline';
import { FeaturesSection, CoursesSection, FutureSection, QAndASection, AboutUsSection } from './LandingSections';

const LandingPage = ({ onTabChange }) => {
    const [activeSection, setActiveSection] = useState('hero');

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.15,
                delayChildren: 0.1
            }
        },
        exit: { opacity: 0, transition: { duration: 0.3 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 30 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
    };

    const navLinks = [
        { id: 'features', label: 'Features' },
        { id: 'courses', label: 'Courses' },
        { id: 'future', label: 'Future' },
        { id: 'qna', label: 'Q&A' },
        { id: 'about', label: 'About us' }
    ];

    const renderSection = () => {
        switch (activeSection) {
            case 'features': return <FeaturesSection key="features" />;
            case 'courses': return <CoursesSection key="courses" />;
            case 'future': return <FutureSection key="future" />;
            case 'qna': return <QAndASection key="qna" />;
            case 'about': return <AboutUsSection key="about" />;
            default:
                return (
                    <motion.div
                        key="hero"
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="flex flex-col items-center text-center max-w-5xl mx-auto w-full relative z-20 mt-auto mb-12 pointer-events-auto"
                    >
                        {/* Badges Row */}
                        <motion.div variants={itemVariants} className="flex flex-wrap justify-center gap-3 mb-10">
                            <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-xs font-semibold tracking-wide uppercase text-gray-200">
                                <span className="text-gray-400">REAL-TIME MARKET DATA</span>
                            </div>
                            <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-xs font-semibold tracking-wide uppercase text-gray-200">
                                <span className="text-gray-400">VIETNAM STOCKS</span>
                            </div>
                            <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-xs font-semibold tracking-wide uppercase text-gray-200">
                                <span className="text-gray-400">SMART ANALYTICS</span>
                            </div>
                        </motion.div>

                        {/* Headline */}
                        <motion.h1 variants={itemVariants} className="text-5xl sm:text-7xl md:text-[80px] font-bold leading-[1.05] tracking-tighter mb-8 cursor-default bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400">
                            Where Market Data<br />Meets Smart Investing
                        </motion.h1>

                        {/* Subtext */}
                        <motion.p variants={itemVariants} className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed font-medium cursor-default">
                            Track multiple Vietnamese stocks and derivatives in real time, analyze market trends, and make smarter investment decisions with powerful financial insights.
                        </motion.p>
                    </motion.div>
                );
        }
    };

    return (
        <div className="w-full min-h-screen bg-[#000000] text-white flex flex-col relative overflow-hidden font-sans">

            {/* Background Spline Animation */}
            <div className="absolute inset-0 z-0">
                <Spline scene="https://prod.spline.design/KtfPeH8BYpGVHFCB/scene.splinecode" />
            </div>

            {/* Navbar */}
            <nav className="fixed top-0 left-0 right-0 z-50 px-6 md:px-12 py-5 flex items-center justify-between">
                <div
                    className="text-white font-medium text-xl tracking-tight flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setActiveSection('hero')}
                >
                    <div className="w-8 h-8 bg-blue-600 text-white flex items-center justify-center font-bold text-lg">D</div>
                    DongAnh Capital
                </div>

                <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-300 px-8 py-3 rounded-full border border-white/10 bg-white/5 backdrop-blur-md">
                    {navLinks.map((link) => (
                        <button
                            key={link.id}
                            onClick={() => setActiveSection(link.id)}
                            className={`transition-colors duration-300 relative ${activeSection === link.id ? 'text-blue-400 font-semibold drop-shadow-[0_0_8px_rgba(37,99,235,0.8)]' : 'hover:text-white'}`}
                        >
                            {link.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-4">
                    <button className="px-5 py-2.5 text-sm font-medium rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition-all cursor-pointer flex items-center gap-2" onClick={() => onTabChange && onTabChange('dashboard')}>
                        Get Started for Free
                        <ArrowRight size={16} />
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className={`flex-1 flex flex-col items-center relative z-10 px-4 pt-[120px] pb-24 min-h-[100dvh] overflow-y-auto ${activeSection === 'hero' ? 'justify-end pointer-events-none' : 'justify-start'}`}>
                <AnimatePresence mode="wait">
                    {renderSection()}
                </AnimatePresence>
            </main>
        </div>
    );
};

export default LandingPage;
