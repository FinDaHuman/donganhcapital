import React from 'react';
import { motion } from 'framer-motion';
import {
    Activity, TrendingUp, BarChart3, LineChart, PieChart,
    PlayCircle, Lock, Calendar, Globe, Server, Database,
    ChevronDown, ChevronUp, MapPin, Users, Mail, Phone, Youtube, Facebook, ShieldCheck
} from 'lucide-react';

const sectionVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: "easeOut", staggerChildren: 0.1 }
    },
    exit: { opacity: 0, y: -20, transition: { duration: 0.4 } }
};

const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

// --- FEATURES SECTION ---
export const FeaturesSection = () => {
    return (
        <motion.div
            variants={sectionVariants} initial="hidden" animate="visible" exit="exit"
            className="w-full max-w-6xl mx-auto px-4 py-8 md:py-16"
        >
            <div className="text-center mb-16">
                <motion.h2 variants={itemVariants} className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white">Institutional-Grade Intelligence</motion.h2>
                <motion.p variants={itemVariants} className="text-gray-400 text-lg max-w-2xl mx-auto">Uncover hidden market dynamics with our proprietary real-time analytics engine, designed exclusively for the Vietnamese market.</motion.p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Feature 1 */}
                <motion.div variants={itemVariants} className="col-span-1 md:col-span-2 relative group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-6 sm:p-8 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <Activity className="text-blue-500 mb-6" size={32} />
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 tracking-tight">Real-Time Market Data Feed</h3>
                    <p className="text-gray-400 leading-relaxed mb-6">Direct low-latency connections to HOSE, HNX, and UPCoM ensuring you receive millisecond-accurate pricing, volume, and order book dynamics before the wider retail market.</p>
                </motion.div>

                {/* Feature 2 */}
                <motion.div variants={itemVariants} className="col-span-1 relative group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-8 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <LineChart className="text-cyan-400 mb-6" size={32} />
                    <h3 className="text-xl font-bold text-white mb-3 tracking-tight">Advanced Charting</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">Integrated TradingView technology overlaid with custom proprietary indicators.</p>
                </motion.div>

                {/* Feature 3 */}
                <motion.div variants={itemVariants} className="col-span-1 relative group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-8 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <Database className="text-purple-400 mb-6" size={32} />
                    <h3 className="text-xl font-bold text-white mb-3 tracking-tight">Derivatives Tracker</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">Monitor VN30 futures contracts with built-in basis and premium/discount analytics.</p>
                </motion.div>

                {/* Feature 4 */}
                <motion.div variants={itemVariants} className="col-span-1 md:col-span-2 relative group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-6 sm:p-8 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <ShieldCheck className="text-emerald-400 mb-6" size={32} />
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 tracking-tight">Smart Portfolio Analytics</h3>
                    <p className="text-gray-400 leading-relaxed">Sync your brokerage accounts securely to run risk-adjusted return models, Monte Carlo simulations, and automated rebalancing alerts tailored to your personal strategy.</p>
                </motion.div>
            </div>
        </motion.div>
    );
};

// --- COURSES SECTION ---
export const CoursesSection = () => {
    const placeholders = [1, 2, 3, 4, 5, 6];

    return (
        <motion.div
            variants={sectionVariants} initial="hidden" animate="visible" exit="exit"
            className="w-full max-w-6xl mx-auto px-4 py-8 md:py-16"
        >
            <div className="flex flex-col items-center text-center pb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/30 text-blue-400 border border-blue-500/20 text-xs font-semibold uppercase tracking-wider mb-4">
                    <Lock size={12} /> Exclusively for Members
                </div>
                <motion.h2 variants={itemVariants} className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white">Masterclass Academy</motion.h2>
                <motion.p variants={itemVariants} className="text-gray-400 text-lg max-w-2xl mx-auto">Advanced trading strategies, quantitative analysis, and market psychology taught by industry veterans. Content unlocking soon.</motion.p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {placeholders.map((item) => (
                    <motion.div key={item} variants={itemVariants} className="relative rounded-xl border border-white/5 bg-black/20 backdrop-blur-sm overflow-hidden group">
                        <div className="aspect-video bg-gray-900/50 flex flex-col items-center justify-center border-b border-white/5 relative overflow-hidden rounded-t-xl">
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
                            <PlayCircle size={48} className="text-gray-600 z-20 group-hover:text-blue-500 transition-colors duration-300" />
                            <div className="absolute top-3 right-3 bg-black/60 px-2 py-1 rounded text-xs text-gray-400 font-mono z-20 border border-white/10">XX:XX</div>
                        </div>
                        <div className="p-5">
                            <div className="w-16 h-1 bg-gray-800 rounded mb-4"></div>
                            <h4 className="text-gray-300 font-medium tracking-tight mb-2 opacity-50">Curriculum Module {item}</h4>
                            <p className="text-gray-600 text-sm">Deploying soon. Our faculty is currently crafting institutional-grade educational materials.</p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
};

// --- FUTURE ROADMAP SECTION ---
export const FutureSection = () => {
    return (
        <motion.div
            variants={sectionVariants} initial="hidden" animate="visible" exit="exit"
            className="w-full max-w-4xl mx-auto px-4 py-8 md:py-16"
        >
            <div className="text-center mb-16">
                <motion.h2 variants={itemVariants} className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white">Strategic Roadmap</motion.h2>
                <motion.p variants={itemVariants} className="text-gray-400 text-lg mx-auto">DongAnh Capital is continuously evolving. Here is what our engineering team is building next.</motion.p>
            </div>

            <div className="relative border-l border-gray-800 ml-4 md:ml-8 space-y-12 pb-8">
                <motion.div variants={itemVariants} className="relative pl-8">
                    <div className="absolute -left-2 top-1.5 w-4 h-4 rounded-full bg-blue-500 ring-4 ring-black"></div>
                    <div className="flex items-center gap-2 text-blue-400 text-sm font-semibold tracking-wider mb-1"><Calendar size={14} /> Q3 2026</div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">AI-Driven Portfolio Generation</h3>
                    <p className="text-gray-400 text-base leading-relaxed max-w-2xl bg-black/30 p-4 rounded-lg border border-white/5 backdrop-blur-sm">Our proprietary LLM will automatically construct diversified, risk-optimized portfolios based on your qualitative inputs, macroeconomic forecasts, and real-time Vietnam market conditions.</p>
                </motion.div>

                <motion.div variants={itemVariants} className="relative pl-8">
                    <div className="absolute -left-2 top-1.5 w-4 h-4 rounded-full bg-gray-700 ring-4 ring-black"></div>
                    <div className="flex items-center gap-2 text-gray-500 text-sm font-semibold tracking-wider mb-1"><Calendar size={14} /> Q4 2026</div>
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-300 mb-2">Options & Warrants Pricing Engine</h3>
                    <p className="text-gray-500 text-base leading-relaxed max-w-2xl">Advanced Black-Scholes and binomial tree models integrated directly into the dashboard for instantaneous implied volatility surface mapping of covered warrants.</p>
                </motion.div>

                <motion.div variants={itemVariants} className="relative pl-8">
                    <div className="absolute -left-2 top-1.5 w-4 h-4 rounded-full bg-gray-800 ring-4 ring-black"></div>
                    <div className="flex items-center gap-2 text-gray-600 text-sm font-semibold tracking-wider mb-1"><Calendar size={14} /> Q1 2027</div>
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-500 mb-2">Automated Execution Algorithms</h3>
                    <p className="text-gray-600 text-base leading-relaxed max-w-2xl">Connect directly to partner brokerages via FIX protocol to deploy TWAP, VWAP, and custom algorithmic execution strategies with zero manual intervention.</p>
                </motion.div>
            </div>
        </motion.div>
    );
};

// --- Q&A SECTION ---
export const QAndASection = () => {
    const [openIndex, setOpenIndex] = React.useState(0);

    const faqs = [
        {
            q: "How fast is the data update rate?",
            a: "Our infrastructure relies on direct, dedicated connections to the Vietnam stock exchanges. Price updates, order book shifts, and volume changes are reflected on the platform in real-time, matching institutional latency parameters."
        },
        {
            q: "Do I need coding experience to use the AI features?",
            a: "No. The DongAnh Capital platform is engineered for investors, not software developers. All artificial intelligence models, predictive analytics, and complex data querying are exposed through an intuitive, natural language interface."
        },
        {
            q: "What markets are currently supported?",
            a: "We currently provide exclusive, hyper-accurate coverage of the Vietnamese financial markets, including HOSE, HNX, UPCoM, and the VN30 derivatives market. International market expansion is planned for late 2027."
        },
        {
            q: "How secure is my portfolio data?",
            a: "We utilize bank-grade AES-256 encryption at rest and TLS 1.3 in transit. We do not sell your trading data, and connected brokerage credentials are never stored on our operational servers."
        }
    ];

    return (
        <motion.div
            variants={sectionVariants} initial="hidden" animate="visible" exit="exit"
            className="w-full max-w-3xl mx-auto px-4 py-8 md:py-16"
        >
            <div className="text-center mb-12">
                <motion.h2 variants={itemVariants} className="text-4xl font-bold tracking-tight mb-4 text-white">Frequently Asked Questions</motion.h2>
                <div className="w-12 h-1 bg-blue-600 mx-auto rounded"></div>
            </div>

            <div className="space-y-4">
                {faqs.map((faq, index) => (
                    <motion.div
                        key={index} variants={itemVariants}
                        className={`rounded-xl border transition-colors duration-300 overflow-hidden ${openIndex === index ? 'bg-white/10 border-white/20' : 'bg-black/40 border-white/5 hover:bg-white/5'}`}
                    >
                        <button
                            className="w-full px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between text-left focus:outline-none"
                            onClick={() => setOpenIndex(openIndex === index ? -1 : index)}
                        >
                            <span className="font-medium text-base sm:text-lg text-white pr-4">{faq.q}</span>
                            {openIndex === index ? <ChevronUp className="text-blue-400 shrink-0" /> : <ChevronDown className="text-gray-500 shrink-0" />}
                        </button>
                        {openIndex === index && (
                            <div className="px-6 pb-6 text-gray-400 leading-relaxed border-t border-white/5 pt-4">
                                {faq.a}
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
};

// --- ABOUT US SECTION ---
export const AboutUsSection = () => {
    return (
        <motion.div
            variants={sectionVariants} initial="hidden" animate="visible" exit="exit"
            className="w-full max-w-5xl mx-auto px-4 py-8 md:py-16"
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">

                {/* Left Column: Origins & Team */}
                <motion.div variants={itemVariants} className="flex flex-col justify-center">
                    <div className="inline-flex items-center gap-2 text-blue-400 font-semibold tracking-wider text-sm uppercase mb-4">
                        <Globe size={16} /> Our Origins
                    </div>
                    <h2 className="text-4xl font-bold tracking-tight mb-6 text-white leading-tight">Built by Quants, <br />Designed for Investors.</h2>
                    <p className="text-gray-400 text-lg mb-8 leading-relaxed">
                        DongAnh Capital was founded with a singular mission: to democratize institutional-grade financial analytics for the Vietnamese market.
                        We believe that sophisticated data shouldn't be gated behind enterprise terminals.
                    </p>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="bg-black/30 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                            <span className="text-3xl font-black text-white mb-1">2</span>
                            <span className="text-xs text-gray-500 font-semibold tracking-wide uppercase">AI Developers</span>
                        </div>
                        <div className="bg-black/30 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                            <span className="text-3xl font-black text-white mb-1">2</span>
                            <span className="text-xs text-gray-500 font-semibold tracking-wide uppercase">Data Analysts</span>
                        </div>
                        <div className="bg-black/30 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                            <span className="text-3xl font-black text-white mb-1">1</span>
                            <span className="text-xs text-gray-500 font-semibold tracking-wide uppercase">Fullstack Dev</span>
                        </div>
                        <div className="bg-black/30 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                            <span className="text-3xl font-black text-white mb-1">1</span>
                            <span className="text-xs text-gray-500 font-semibold tracking-wide uppercase">Marketing Base</span>
                        </div>
                    </div>
                </motion.div>

                {/* Right Column: Contact & Location */}
                <motion.div variants={itemVariants} className="bg-white/5 border border-white/10 rounded-3xl p-5 sm:p-8 backdrop-blur-md relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

                    <div>
                        <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                            <MapPin className="text-blue-500" /> Headquarters
                        </h3>
                        <p className="text-xl text-gray-300 font-medium mb-2">FU Hola</p>
                        <p className="text-gray-500 mb-10 text-sm">Vietnam</p>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold tracking-wider text-gray-500 uppercase mb-4">Connect Directly</h4>

                        <a href="#" className="flex items-center gap-4 p-4 rounded-xl bg-black/40 border border-white/5 hover:border-blue-500/30 hover:bg-white/5 transition-all group">
                            <div className="bg-white/10 p-2 rounded-lg group-hover:bg-blue-600 transition-colors text-white"><Phone size={20} /></div>
                            <div>
                                <p className="text-xs text-gray-500 font-medium">Direct Line</p>
                                <p className="text-white font-medium">+84 (xxx) xxx-xxxx</p>
                            </div>
                        </a>

                        <a href="#" className="flex items-center gap-4 p-4 rounded-xl bg-black/40 border border-white/5 hover:border-blue-500/30 hover:bg-white/5 transition-all group">
                            <div className="bg-white/10 p-2 rounded-lg group-hover:bg-blue-600 transition-colors text-white"><Mail size={20} /></div>
                            <div>
                                <p className="text-xs text-gray-500 font-medium">Institutional Inquiries</p>
                                <p className="text-white font-medium">contact@donganhcapital.com</p>
                            </div>
                        </a>
                    </div>

                    <div className="flex items-center gap-3 mt-8 pt-8 border-t border-white/10">
                        <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-blue-600 transition-all">
                            <Facebook size={18} />
                        </a>
                        <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-red-600 transition-all">
                            <Youtube size={18} />
                        </a>
                    </div>
                </motion.div>

            </div>
        </motion.div>
    );
};
