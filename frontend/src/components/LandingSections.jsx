import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity, TrendingUp, BarChart3, LineChart, PieChart,
    Lock, Calendar, Globe, Server, Database,
    ChevronDown, ChevronUp, MapPin, Users, Mail, Phone, Facebook, ShieldCheck,
    CheckCircle2, Clock, Sparkles, Send, ArrowRight,
    Bot, Brain, Target, Shield, Zap, BarChart2, Eye, Cpu
} from 'lucide-react';

const sectionVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: "easeOut", staggerChildren: 0.1 }
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

// --- FEATURES SECTION ---
export const FeaturesSection = () => {
    return (
        <motion.div
            id="features"
            variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }}
            className="w-full max-w-6xl mx-auto px-4 py-16 md:py-24"
        >
            <div className="text-center mb-16">
                <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/30 text-blue-400 border border-blue-500/20 text-xs font-semibold uppercase tracking-wider mb-4">
                    <Zap size={12} /> Platform Capabilities
                </motion.div>
                <motion.h2 variants={itemVariants} className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white">Powerful Market Intelligence</motion.h2>
                <motion.p variants={itemVariants} className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto">Uncover hidden market dynamics with our real-time analytics engine, built exclusively for the Vietnamese market.</motion.p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                {/* Feature 1 */}
                <motion.div variants={itemVariants} className="col-span-1 md:col-span-2 relative group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-6 sm:p-8 overflow-hidden card-glow transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <Activity className="text-blue-500 mb-4 sm:mb-6" size={32} />
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 tracking-tight">Real-Time Market Data Feed</h3>
                    <p className="text-gray-400 leading-relaxed mb-6 text-sm sm:text-base">Near real-time data from HOSE, HNX, and UPCoM — covering price, volume, and order book dynamics during market hours.</p>
                </motion.div>

                {/* Feature 2 */}
                <motion.div variants={itemVariants} className="col-span-1 relative group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-6 sm:p-8 overflow-hidden card-glow transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <LineChart className="text-cyan-400 mb-4 sm:mb-6" size={32} />
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-3 tracking-tight">Advanced Charting</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">Professional-grade charting powered by custom technical indicators and advanced overlays.</p>
                </motion.div>

                {/* Feature 3 */}
                <motion.div variants={itemVariants} className="col-span-1 relative group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-6 sm:p-8 overflow-hidden card-glow transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <Database className="text-purple-400 mb-4 sm:mb-6" size={32} />
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-3 tracking-tight">Derivatives Tracker</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">Monitor VN30 futures contracts with built-in basis and premium/discount analytics.</p>
                </motion.div>

                {/* Feature 4 — Smart Portfolio */}
                <motion.div variants={itemVariants} className="col-span-1 md:col-span-2 relative group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-6 sm:p-8 overflow-hidden card-glow transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="flex items-center gap-3 mb-4 sm:mb-6">
                        <ShieldCheck className="text-emerald-400" size={32} />
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold uppercase tracking-wider">
                            <Clock size={10} /> Coming Soon
                        </span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 tracking-tight">Smart Portfolio Analytics</h3>
                    <p className="text-gray-400 leading-relaxed text-sm sm:text-base">Analyze portfolio risk and return characteristics with built-in analytics tools. Brokerage sync coming soon.</p>
                </motion.div>
            </div>
        </motion.div>
    );
};

// --- AI ADVANTAGE SECTION — Premium marketing showcase ---
export const AIAdvantageSection = ({ onTabChange }) => {
    const advantages = [
        {
            icon: Target,
            iconColor: 'text-blue-400',
            glowColor: 'from-blue-600/15',
            title: 'Predictive Signals',
            description: 'Our AI scans every Vietnamese equity daily, identifying high-probability opportunities before the crowd moves.',
            stat: '400+',
            statLabel: 'Stocks scanned daily',
        },
        {
            icon: Brain,
            iconColor: 'text-purple-400',
            glowColor: 'from-purple-600/15',
            title: 'Market Sentiment Engine',
            description: 'Real-time sentiment analysis across 6 proprietary models, giving you conviction when others hesitate.',
            stat: '6',
            statLabel: 'AI models deployed',
        },
        {
            icon: Shield,
            iconColor: 'text-emerald-400',
            glowColor: 'from-emerald-600/15',
            title: 'Risk Intelligence',
            description: 'Automated TP/SL calculation and portfolio risk scoring — institutional-grade tools at zero cost.',
            stat: '24/7',
            statLabel: 'Automated monitoring',
        },
    ];

    return (
        <motion.div
            id="ai-advantage"
            variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }}
            className="w-full max-w-6xl mx-auto px-4 py-16 md:py-24"
        >
            {/* Section header */}
            <div className="text-center mb-16">
                <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-900/30 text-purple-400 border border-purple-500/20 text-xs font-semibold uppercase tracking-wider mb-4">
                    <Bot size={12} /> AI Trading Agents
                </motion.div>
                <motion.h2 variants={itemVariants} className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white">
                    While Others Guess,<br /><span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">You Know</span>
                </motion.h2>
                <motion.p variants={itemVariants} className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto">
                    Our AI agents work around the clock — analyzing, predicting, and alerting — so every decision you make is backed by data, not gut feeling.
                </motion.p>
            </div>

            {/* AI Brain image + feature cards layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center mb-16">
                {/* Left: AI visualization image */}
                <motion.div variants={itemVariants} className="relative order-2 lg:order-1">
                    <div className="relative rounded-2xl overflow-hidden border border-white/10 dashboard-preview-glow">
                        <img
                            src="/assets/ai_brain_trading.png"
                            alt="AI Trading Intelligence Visualization"
                            className="w-full h-auto object-cover rounded-2xl"
                            loading="lazy"
                        />
                        {/* Scan line overlay */}
                        <div className="absolute inset-0 scan-line pointer-events-none rounded-2xl" />
                        {/* Gradient overlay for blending */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none rounded-2xl" />
                    </div>
                    {/* Floating signal badge */}
                    <div className="absolute -bottom-3 -right-3 sm:bottom-4 sm:right-4 bg-black/80 backdrop-blur-md border border-blue-500/30 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg">
                        <div className="w-3 h-3 rounded-full bg-emerald-400 signal-pulse" />
                        <div>
                            <p className="text-xs text-gray-400">Signal Generated</p>
                            <p className="text-sm font-bold text-white">VNM — BUY 87.2%</p>
                        </div>
                    </div>
                </motion.div>

                {/* Right: Advantage cards */}
                <div className="flex flex-col gap-4 order-1 lg:order-2">
                    {advantages.map((adv, i) => (
                        <motion.div
                            key={i}
                            variants={itemVariants}
                            className="relative group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 sm:p-6 overflow-hidden card-glow transition-all duration-300"
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br ${adv.glowColor} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
                            <div className="relative flex items-start gap-4">
                                <div className="shrink-0 w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                    <adv.icon className={adv.iconColor} size={22} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-bold text-white mb-1.5 tracking-tight">{adv.title}</h3>
                                    <p className="text-gray-400 text-sm leading-relaxed mb-3">{adv.description}</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl font-black text-white">{adv.stat}</span>
                                        <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{adv.statLabel}</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Dashboard preview showcase */}
            <motion.div variants={itemVariants} className="relative">
                <div className="text-center mb-8">
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">See It in Action</h3>
                    <p className="text-gray-400 text-sm">Real AI signals. Real market data. Real results.</p>
                </div>
                <div className="relative rounded-2xl overflow-hidden border border-white/10 dashboard-preview-glow mx-auto max-w-4xl">
                    <img
                        src="/assets/dashboard_preview.png"
                        alt="DongAnh Capital AI Dashboard Preview"
                        className="w-full h-auto object-cover rounded-2xl"
                        loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none rounded-2xl" />
                    {/* CTA overlay */}
                    <div className="absolute inset-0 flex items-end justify-center pb-6 sm:pb-10">
                        <button
                            onClick={() => onTabChange && onTabChange('dashboard')}
                            className="group px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-semibold rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2.5 transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm"
                        >
                            Start Getting Signals
                            <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

// --- FUTURE ROADMAP SECTION ---
export const FutureSection = () => {
    return (
        <motion.div
            id="future"
            variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }}
            className="w-full max-w-4xl mx-auto px-4 py-16 md:py-24"
        >
            <div className="text-center mb-16">
                <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10 text-xs font-semibold uppercase tracking-wider mb-4">
                    <Calendar size={12} /> Roadmap
                </motion.div>
                <motion.h2 variants={itemVariants} className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white">Strategic Roadmap</motion.h2>
                <motion.p variants={itemVariants} className="text-gray-400 text-base sm:text-lg mx-auto">DongAnh Capital is continuously evolving. Here is what our engineering team is building next.</motion.p>
            </div>

            <div className="relative border-l border-gray-800 ml-4 md:ml-8 space-y-10 sm:space-y-12 pb-8">
                {/* Completed — Q1 2026 */}
                <motion.div variants={itemVariants} className="relative pl-6 sm:pl-8">
                    <div className="absolute -left-2 top-1.5 w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-black"></div>
                    <div className="flex flex-wrap items-center gap-2 text-emerald-400 text-sm font-semibold tracking-wider mb-1">
                        <CheckCircle2 size={14} /> Q1 2026
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold uppercase tracking-wider">Completed</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Platform Launch</h3>
                    <p className="text-gray-400 text-sm sm:text-base leading-relaxed max-w-2xl">Released the DongAnh Capital platform with real-time market data, advanced charting, and derivatives tracking for the Vietnamese market.</p>
                </motion.div>

                {/* Completed — Q2 2026 */}
                <motion.div variants={itemVariants} className="relative pl-6 sm:pl-8">
                    <div className="absolute -left-2 top-1.5 w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-black"></div>
                    <div className="flex flex-wrap items-center gap-2 text-emerald-400 text-sm font-semibold tracking-wider mb-1">
                        <CheckCircle2 size={14} /> Q2 2026
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold uppercase tracking-wider">Completed</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">AI Signal Engine v1</h3>
                    <p className="text-gray-400 text-sm sm:text-base leading-relaxed max-w-2xl">Deployed six AI models for stock prediction, sentiment analysis, and market trend detection across 400+ Vietnamese equities.</p>
                </motion.div>

                {/* In Development — Q3 2026 */}
                <motion.div variants={itemVariants} className="relative pl-6 sm:pl-8">
                    <div className="absolute -left-2 top-1.5 w-4 h-4 rounded-full bg-blue-500 ring-4 ring-black animate-pulse"></div>
                    <div className="flex flex-wrap items-center gap-2 text-blue-400 text-sm font-semibold tracking-wider mb-1">
                        <Calendar size={14} /> Q3 2026
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold uppercase tracking-wider">In Development</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">AI-Driven Portfolio Generation</h3>
                    <p className="text-gray-400 text-sm sm:text-base leading-relaxed max-w-2xl bg-black/30 p-4 rounded-lg border border-white/5 backdrop-blur-sm">Our AI will automatically construct diversified, risk-optimized portfolios based on your inputs, macroeconomic forecasts, and real-time Vietnam market conditions.</p>
                </motion.div>

                {/* Planned — Q4 2026 */}
                <motion.div variants={itemVariants} className="relative pl-6 sm:pl-8">
                    <div className="absolute -left-2 top-1.5 w-4 h-4 rounded-full bg-gray-700 ring-4 ring-black"></div>
                    <div className="flex flex-wrap items-center gap-2 text-gray-400 text-sm font-semibold tracking-wider mb-1">
                        <Calendar size={14} /> Q4 2026
                        <span className="px-2 py-0.5 rounded-full bg-gray-700/20 text-gray-400 border border-gray-600/20 text-xs font-semibold uppercase tracking-wider">Planned</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-300 mb-2">Options & Warrants Pricing Engine</h3>
                    <p className="text-gray-400 text-sm sm:text-base leading-relaxed max-w-2xl">Advanced pricing models integrated directly into the dashboard for covered warrants valuation and analysis.</p>
                </motion.div>

                {/* Planned — Q1 2027 */}
                <motion.div variants={itemVariants} className="relative pl-6 sm:pl-8">
                    <div className="absolute -left-2 top-1.5 w-4 h-4 rounded-full bg-gray-800 ring-4 ring-black"></div>
                    <div className="flex flex-wrap items-center gap-2 text-gray-400 text-sm font-semibold tracking-wider mb-1">
                        <Calendar size={14} /> Q1 2027
                        <span className="px-2 py-0.5 rounded-full bg-gray-700/20 text-gray-400 border border-gray-600/20 text-xs font-semibold uppercase tracking-wider">Planned</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-400 mb-2">Automated Trade Execution</h3>
                    <p className="text-gray-400 text-sm sm:text-base leading-relaxed max-w-2xl">Automatically execute your trades at optimal prices through connected brokerages with zero manual intervention.</p>
                </motion.div>
            </div>

            {/* CTA */}
            <motion.div variants={itemVariants} className="text-center mt-12">
                <p className="text-gray-500 text-sm">Want to shape our roadmap? <a href="mailto:contact@donganhcapital.com" className="text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2">Join our community</a>.</p>
            </motion.div>
        </motion.div>
    );
};

// --- Q&A SECTION ---
export const QAndASection = () => {
    const [openIndex, setOpenIndex] = React.useState(0);

    const faqs = [
        {
            q: "How do the AI trading agents work?",
            a: "Our AI agents continuously analyze 400+ Vietnamese stocks using 6 proprietary models. They identify high-probability trading opportunities, calculate entry/exit prices, and generate actionable signals — all automatically, every trading day."
        },
        {
            q: "How fast is the data update rate?",
            a: "Data is updated in near real-time during market hours. Price updates, order book shifts, and volume changes are reflected on the platform with minimal delay from the Vietnam stock exchanges."
        },
        {
            q: "Do I need coding experience to use the AI features?",
            a: "No. The DongAnh Capital platform is designed for investors, not software developers. All AI models, predictive analytics, and data tools are accessible through an intuitive, point-and-click interface."
        },
        {
            q: "What markets are currently supported?",
            a: "We currently cover the Vietnamese financial markets, including HOSE, HNX, UPCoM, and the VN30 derivatives market. International market expansion is planned for late 2027."
        },
        {
            q: "How secure is my data?",
            a: "Your data is encrypted in transit and at rest using industry-standard protocols. We do not sell your data, and we follow security best practices for data storage and handling."
        },
        {
            q: "Is DongAnh Capital really free?",
            a: "Yes, completely free. No credit card required, no hidden fees. Our mission is to democratize financial analytics for the Vietnamese market. We plan to introduce optional premium features in the future, but the core platform will always remain free."
        },
        {
            q: "How accurate are the AI predictions?",
            a: "Our AI models provide analytical signals and trend indicators based on historical data and machine learning. They are tools to support your investment decisions, not guarantees of future performance. Always do your own research before making investment decisions."
        },
        {
            q: "Do I need to create an account?",
            a: "You can explore the dashboard and charting tools immediately without signing up. Creating a free account unlocks personalized features like watchlists, saved configurations, and AI-powered portfolio analysis."
        }
    ];

    return (
        <motion.div
            id="qna"
            variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }}
            className="w-full max-w-3xl mx-auto px-4 py-16 md:py-24"
        >
            <div className="text-center mb-12">
                <motion.h2 variants={itemVariants} className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 text-white">Frequently Asked Questions</motion.h2>
                <div className="w-12 h-1 bg-blue-600 mx-auto rounded"></div>
            </div>

            <div className="space-y-3 sm:space-y-4" role="region" aria-label="Frequently Asked Questions">
                {faqs.map((faq, index) => {
                    const isOpen = openIndex === index;
                    const panelId = `faq-panel-${index}`;
                    const buttonId = `faq-button-${index}`;

                    return (
                        <motion.div
                            key={index} variants={itemVariants}
                            className={`rounded-xl border transition-colors duration-300 overflow-hidden ${isOpen ? 'bg-white/10 border-white/20' : 'bg-black/40 border-white/5 hover:bg-white/5'}`}
                        >
                            <button
                                id={buttonId}
                                className="w-full px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-xl"
                                onClick={() => setOpenIndex(isOpen ? -1 : index)}
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                            >
                                <span className="font-medium text-base sm:text-lg text-white pr-4">{faq.q}</span>
                                {isOpen ? <ChevronUp className="text-blue-400 shrink-0" /> : <ChevronDown className="text-gray-500 shrink-0" />}
                            </button>
                            <AnimatePresence initial={false}>
                                {isOpen && (
                                    <motion.div
                                        id={panelId}
                                        role="region"
                                        aria-labelledby={buttonId}
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.3, ease: "easeInOut" }}
                                        className="overflow-hidden"
                                    >
                                        <div className="px-4 sm:px-6 pb-5 sm:pb-6 text-gray-400 leading-relaxed border-t border-white/5 pt-4 text-sm sm:text-base">
                                            {faq.a}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}
            </div>

            {/* Contact fallback */}
            <motion.div variants={itemVariants} className="text-center mt-8">
                <p className="text-gray-500 text-sm">Have another question? Reach out to us at <a href="mailto:contact@donganhcapital.com" className="text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2">contact@donganhcapital.com</a></p>
            </motion.div>
        </motion.div>
    );
};

// --- ABOUT US SECTION ---
export const AboutUsSection = () => {
    return (
        <motion.div
            id="about"
            variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }}
            className="w-full max-w-5xl mx-auto px-4 py-16 md:py-24"
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">

                {/* Left Column: Origins & Team */}
                <motion.div variants={itemVariants} className="flex flex-col justify-center">
                    <div className="inline-flex items-center gap-2 text-blue-400 font-semibold tracking-wider text-sm uppercase mb-4">
                        <Globe size={16} /> Our Origins
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6 text-white leading-tight">Built by Engineers, <br />Designed for Investors.</h2>
                    <p className="text-gray-400 text-base sm:text-lg mb-8 leading-relaxed">
                        DongAnh Capital was founded with a singular mission: to democratize financial analytics for the Vietnamese market.
                        We believe that sophisticated data shouldn't be gated behind enterprise terminals.
                    </p>

                    {/* Team stat */}
                    <div className="bg-black/30 border border-white/10 rounded-xl p-5 sm:p-6 mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-12 sm:w-14 h-12 sm:h-14 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                                <Users className="text-blue-400" size={24} />
                            </div>
                            <div>
                                <span className="text-3xl font-black text-white">6</span>
                                <p className="text-gray-400 text-sm mt-1 leading-relaxed">A lean team of engineers and analysts focused on one mission — making market intelligence accessible to everyone.</p>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Right Column: Contact & Location */}
                <motion.div variants={itemVariants} className="bg-white/5 border border-white/10 rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-md relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

                    <div>
                        <h3 className="text-xl sm:text-2xl font-bold text-white mb-6 flex items-center gap-3">
                            <MapPin className="text-blue-500" /> Headquarters
                        </h3>
                        <p className="text-sm sm:text-base text-gray-300 font-medium mb-2 leading-relaxed">Khu Giáo dục và Đào tạo - Khu Công nghệ cao Hòa Lạc</p>
                        <p className="text-gray-500 mb-8 sm:mb-10 text-xs sm:text-sm leading-relaxed">Km29 Đại lộ Thăng Long, Xã Hòa Lạc, TP. Hà Nội</p>
                    </div>

                    <div className="space-y-3 sm:space-y-4">
                        <h4 className="text-sm font-semibold tracking-wider text-gray-500 uppercase mb-3 sm:mb-4">Connect Directly</h4>

                        <a href="tel:0813221910" className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-black/40 border border-white/5 hover:border-blue-500/30 hover:bg-white/5 transition-all group">
                            <div className="bg-white/10 p-2 rounded-lg group-hover:bg-blue-600 transition-colors text-white"><Phone size={18} /></div>
                            <div>
                                <p className="text-xs text-gray-500 font-medium">Direct Line</p>
                                <p className="text-white font-medium text-sm sm:text-base">0813 221 910</p>
                            </div>
                        </a>

                        <a href="mailto:contact@donganhcapital.com" className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-black/40 border border-white/5 hover:border-blue-500/30 hover:bg-white/5 transition-all group">
                            <div className="bg-white/10 p-2 rounded-lg group-hover:bg-blue-600 transition-colors text-white"><Mail size={18} /></div>
                            <div>
                                <p className="text-xs text-gray-500 font-medium">Get in Touch</p>
                                <p className="text-white font-medium text-sm sm:text-base">contact@donganhcapital.com</p>
                            </div>
                        </a>
                    </div>

                    <div className="flex items-center gap-3 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/10">
                        <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-blue-600 transition-all" title="Facebook - Coming Soon">
                            <Facebook size={18} />
                        </a>
                    </div>
                </motion.div>

            </div>
        </motion.div>
    );
};

// --- FOOTER SECTION ---
export const FooterSection = () => {
    return (
        <footer className="w-full border-t border-white/5 bg-black/60 backdrop-blur-sm">
            <div className="max-w-6xl mx-auto px-4 py-10 sm:py-12">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 md:gap-12">
                    {/* Brand */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center font-bold text-lg rounded-lg">D</div>
                            <span className="text-white font-bold text-lg tracking-tight">DongAnh Capital</span>
                        </div>
                        <p className="text-gray-500 text-sm leading-relaxed">AI-powered trading agents for the Vietnamese market. Make AI your unfair advantage.</p>
                    </div>

                    {/* Contact */}
                    <div>
                        <h4 className="text-gray-300 font-semibold text-sm uppercase tracking-wider mb-4">Contact</h4>
                        <div className="space-y-2 text-sm">
                            <a href="mailto:contact@donganhcapital.com" className="text-gray-500 hover:text-blue-400 transition-colors block">contact@donganhcapital.com</a>
                            <a href="tel:0813221910" className="text-gray-500 hover:text-blue-400 transition-colors block">0813 221 910</a>
                        </div>
                    </div>

                    {/* Social */}
                    <div>
                        <h4 className="text-gray-300 font-semibold text-sm uppercase tracking-wider mb-4">Follow Us</h4>
                        <div className="flex items-center gap-3">
                            <a href="#" className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-blue-600 hover:border-blue-600 transition-all" title="Facebook - Coming Soon">
                                <Facebook size={16} />
                            </a>
                        </div>
                    </div>
                </div>

                <div className="mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-gray-600 text-xs">© {new Date().getFullYear()} DongAnh Capital. All rights reserved.</p>
                    <p className="text-gray-600 text-xs">Hà Nội, Việt Nam</p>
                </div>
            </div>
        </footer>
    );
};
