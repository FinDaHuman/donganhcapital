import React, { useState, useEffect, lazy, Suspense } from 'react';
import Header from './components/Header';
import { getPrediction, getTickers } from './services/stock_api';
import LandingPage from './components/LandingPage';
import ErrorBoundary from './components/ErrorBoundary';
import { Search, X, Mail, ArrowLeft } from 'lucide-react';
import { SkeletonChart } from './components/SkeletonLoader';
import { useAuth } from './context/AuthContext';
import { useAccess } from './hooks/useAccess';
import { AccessGuard } from './components/AccessGate';
import LegalFooter from './components/LegalFooter';
import CookieConsent from './components/CookieConsent';
import ReconsentModal from './components/ReconsentModal';
import { LEGAL_TABS } from './legal/routes';

// Route-level code splitting: every view except the landing page (the first
// paint for new visitors) loads on demand. This keeps heavy chart libraries —
// plotly (DataAnalystTab) and lightweight-charts (Dashboard, StockChart) —
// out of the entry bundle.
const Dashboard = lazy(() => import('./components/Dashboard'));
const StockChart = lazy(() => import('./components/StockChart'));
const AIAnalystTab = lazy(() => import('./components/AIAnalystTab'));
const DataAnalystTab = lazy(() => import('./components/DataAnalystTab'));
const LTRSignalsTab = lazy(() => import('./components/LTRSignalsTab'));
const BCDSignalsTab = lazy(() => import('./components/BCDSignalsTab'));
const ReportsTab = lazy(() => import('./components/ReportsTab'));
const NewsTab = lazy(() => import('./components/NewsTab'));
const ChatbotTab = lazy(() => import('./components/ChatbotTab'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
// One component serves every legal route; the document itself is a further
// lazy import inside it, one small chunk per slug per language.
const LegalPage = lazy(() => import('./pages/LegalPage'));

// Shown while a lazy route chunk downloads (fast after first visit — chunks are cached)
const TabFallback = () => (
    <div className="flex-1 w-full p-6 flex flex-col" style={{ background: 'var(--bg-void)', minHeight: '600px' }}>
        <SkeletonChart className="flex-1 w-full h-full" />
    </div>
);

// Every navigable tab. Anything else in the URL path falls back to 'home' so a
// mistyped or stale link renders the landing page instead of a blank screen.
// (Single source of truth for both the initial render and popstate handling.)
const KNOWN_TABS = new Set([
    'home', 'dashboard', 'chart', 'analyst', 'data-analyst', 'ltr-signals', 'bcd-signals',
    'reports', 'news', 'chatbot', 'login', 'auth/google/callback', 'register',
    'profile', 'reset-password', 'verify-email',
    // terms, privacy, disclaimer, cookies, about, contact — spread so adding a
    // legal page in legal/routes.js wires the route, the footer link and the
    // chrome-less set all at once.
    ...LEGAL_TABS,
]);

// Pages that render full-bleed without the app Header.
const CHROMELESS_TABS = new Set([
    'home', 'login', 'register', 'auth/google/callback', 'profile',
    'reset-password', 'verify-email',
    ...LEGAL_TABS,
]);

// Product tabs, all of which require a signed-in account with a verified
// email. Everything outside this set is either public (home, privacy, terms)
// or part of getting an account into a usable state (login, register, profile,
// verify-email, reset-password) and must stay reachable.
//
// The guard is applied here rather than inside each tab so a new tab cannot
// ship without it — Dashboard, Chart, AI Analyst and Data Analyst had all
// shipped with no gate at all.
const GATED_TABS = new Set([
    'dashboard', 'chart', 'analyst', 'data-analyst',
    'ltr-signals', 'bcd-signals', 'reports', 'news', 'chatbot',
]);

// Human-readable tab names for the chart "Back to …" affordance. Mirrors the
// labels in Header.jsx navTabs (single source of truth for the origin label).
// Deliberately has no 'chart' entry — you never return to the chart from the
// chart, and the call sites fall back to 'Dashboard'.
const TAB_LABELS = {
    dashboard: 'Dashboard', analyst: 'AI Analyst', 'data-analyst': 'Data Analyst',
    news: 'News', chatbot: 'AI Chat', 'ltr-signals': 'LTR Signals', 'bcd-signals': 'BCD Signals',
    reports: 'Reports', home: 'Home',
};

// What the access gate calls each tab ("Sign in to access …"). Same names plus
// the chart, which TAB_LABELS intentionally omits.
const GATED_TAB_LABELS = { ...TAB_LABELS, chart: 'Charts' };

// Derive the active tab from the current URL: path first (e.g. /news), then the
// ?tab= query fallback, else 'home'. Unknown paths resolve to 'home'.
const tabFromLocation = () => {
    // Strip leading and trailing slashes only — inner slashes must survive so
    // 'auth/google/callback' still resolves. A trailing slash (/terms/) used to
    // fall through to 'home'.
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const queryTab = new URLSearchParams(window.location.search).get('tab');
    const tab = path || queryTab || 'home';
    return KNOWN_TABS.has(tab) ? tab : 'home';
};

function App() {
    const { user, resendVerification } = useAuth();
    const { canUseApp, authLoading } = useAccess();
    const [dismissedVerify, setDismissedVerify] = useState(false);
    const [resendVerifyLoading, setResendVerifyLoading] = useState(false);
    const [resendVerifyMsg, setResendVerifyMsg] = useState('');

    const handleResendVerify = async () => {
        setResendVerifyLoading(true);
        setResendVerifyMsg('');
        const result = await resendVerification();
        setResendVerifyLoading(false);
        setResendVerifyMsg(result.success ? 'Verification email sent! Check your inbox.' : result.error);
    };

    // Show the email verification banner for unverified email/password accounts,
    // but not on auth pages or the verify-email page itself.
    const showVerifyBanner =
        user &&
        user.auth_provider === 'email' &&
        !user.email_verified &&
        !dismissedVerify;

    // Initial tab is derived from the URL (clamped to a known tab).
    const [activeTab, setActiveTab] = useState(tabFromLocation);
    const [policyReturnTo, setPolicyReturnTo] = useState('home');

    // Navigate to a tab and reflect it in the URL.
    const handleTabChange = (tab, data) => {
        if (LEGAL_TABS.has(tab)) {
            setPolicyReturnTo(data?.returnTo || 'home');
        }
        setActiveTab(tab);
        // Update URL path without reloading page
        const newUrl = tab === 'home' ? '/' : `/${tab}`;
        window.history.pushState({ path: newUrl }, '', newUrl);
        window.scrollTo(0, 0);
    };

    // Keep the rendered tab in sync with the browser Back/Forward buttons.
    // handleTabChange pushes history entries, but the resulting popstate events
    // were previously unhandled — so navigating Back changed the URL while the
    // UI stayed put. Re-derive the tab from the URL on each pop (no pushState
    // here: the history entry already exists).
    useEffect(() => {
        const onPopState = () => {
            setActiveTab(tabFromLocation());
            window.scrollTo(0, 0);
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);
    const [selectedTicker, setSelectedTicker] = useState(null);
    // The tab the user was on when they opened a chart, so we can offer a
    // "Back to …" affordance that returns them to where they came from.
    const [chartReturnTo, setChartReturnTo] = useState('dashboard');
    const [predictionData, setPredictionData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    // Stock List State
    const [stockList, setStockList] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchStocks = async () => {
            try {
                const res = await getTickers();
                // res is { count: N, stocks: [...] }
                if (res && res.stocks) {
                    setStockList(res.stocks.sort());
                }
            } catch (e) {
                console.error("Failed to load stocks");
            }
        };
        // Initial load
        fetchStocks();
        // Refresh every 120 seconds (reduced for free-tier backend)
        const interval = setInterval(fetchStocks, 120000);
        return () => clearInterval(interval);
    }, []);

    const handleSelectStock = async (ticker) => {
        // Only record origin + push history when arriving from another tab.
        // Switching tickers while already on the chart (in-chart search,
        // News-modal chips) must preserve the original origin and avoid
        // stacking duplicate /chart history entries.
        if (activeTab !== 'chart') {
            setChartReturnTo(activeTab);
            window.history.pushState({ path: '/chart' }, '', '/chart');
            window.scrollTo(0, 0);
        }
        setSearchTerm(''); // Clear search term when selected
        setSelectedTicker(ticker);
        setActiveTab('chart');
        setPredictionData(null); // Clear previous data to show loading screen
        setError(null);
        setLoading(true);
        try {
            const data = await getPrediction(ticker);
            setPredictionData(data);
        } catch (e) {
            console.error("Fetch error:", e);
            setError(`Failed to load data for ${ticker}. Please try again.`);
        } finally {
            setLoading(false);
        }
    };

    // Return from the chart to the tab the user came from. Routed through the
    // canonical navigator so it pushes history + scrolls like every other nav.
    const handleChartBack = () => handleTabChange(chartReturnTo);

    // Realtime Polling for VN30F1M
    useEffect(() => {
        let isActive = true;
        let intervalId;
        if (activeTab === 'chart' && selectedTicker === 'VN30F1M') {
            intervalId = setInterval(async () => {
                try {
                    const data = await getPrediction('VN30F1M');
                    if (isActive && data != null) {
                        setPredictionData(data);
                    }
                } catch (e) {
                    console.error("Fetch error during VN30F1M polling:", e);
                }
            }, 60000); // every 60s
        }
        return () => {
            isActive = false;
            if (intervalId) clearInterval(intervalId);
        };
    }, [activeTab, selectedTicker]);

    // Filter stocks
    const filteredStocks = stockList.filter(s => s.includes(searchTerm.toUpperCase()));

    return (
        <div className="w-full min-h-screen flex flex-col overflow-hidden text-gray-200 font-sans" style={{ backgroundColor: '#000' }}>
            {/* Email verification nudge banner — shown for unverified email/password accounts */}
            {showVerifyBanner && activeTab !== 'home' && activeTab !== 'login' && activeTab !== 'register' && activeTab !== 'verify-email' && activeTab !== 'reset-password' && (
                <div
                    className="w-full flex flex-col items-center justify-center gap-1 px-4 py-2"
                    style={{
                        background: 'rgba(59,130,246,0.07)',
                        borderBottom: '1px solid rgba(59,130,246,0.18)',
                        fontFamily: "'Outfit', sans-serif",
                    }}
                >
                    <div className="flex items-center gap-2.5">
                        <Mail size={13} style={{ color: '#60a5fa', flexShrink: 0 }} />
                        <span className="text-xs" style={{ color: '#93c5fd' }}>
                            Please verify your email to secure your account.{' '}
                            <button
                                onClick={handleResendVerify}
                                disabled={resendVerifyLoading}
                                className="underline cursor-pointer"
                                style={{ background: 'none', border: 'none', color: '#60a5fa', fontFamily: "'Outfit', sans-serif", fontSize: 'inherit', opacity: resendVerifyLoading ? 0.6 : 1 }}
                            >
                                {resendVerifyLoading ? 'Sending…' : 'Resend email →'}
                            </button>
                        </span>
                        <button
                            onClick={() => setDismissedVerify(true)}
                            className="ml-auto cursor-pointer"
                            style={{ background: 'none', border: 'none', color: '#60a5fa', opacity: 0.5, flexShrink: 0, fontSize: '16px', lineHeight: 1, padding: 0 }}
                            aria-label="Dismiss"
                        >
                            <X size={13} />
                        </button>
                    </div>
                    {resendVerifyMsg && (
                        <span className="text-xs" style={{ color: '#93c5fd' }}>{resendVerifyMsg}</span>
                    )}
                </div>
            )}

            {!CHROMELESS_TABS.has(activeTab) && <Header activeTab={activeTab} onTabChange={handleTabChange} />}

            <div className="flex-1 flex flex-col w-full min-h-0 relative">
                <main className="flex-1 overflow-hidden relative flex flex-col min-h-0" style={{ backgroundColor: '#000' }}>
                    <Suspense fallback={<TabFallback />}>

                    {activeTab === 'home' && (
                        <div className="h-full w-full overflow-hidden">
                        <LandingPage onTabChange={handleTabChange} />
                        </div>
                    )}

                    {GATED_TABS.has(activeTab) && !canUseApp && (
                        // While the session is still resolving, show the same
                        // skeleton a lazy chunk uses — gating on a not-yet-known
                        // session would flash the sign-in screen at users who
                        // are in fact signed in.
                        authLoading ? <TabFallback /> : (
                            <AccessGuard
                                onTabChange={handleTabChange}
                                feature={GATED_TAB_LABELS[activeTab] || 'this feature'}
                            />
                        )
                    )}

                    {activeTab === 'dashboard' && canUseApp && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <ErrorBoundary>
                                <Dashboard onSelectStock={handleSelectStock} />
                            </ErrorBoundary>
                        </div>
                    )}

                    {activeTab === 'chart' && canUseApp && (
                        <div className="flex-1 w-full flex flex-row min-h-[400px] overflow-hidden">
                            {/* Main Chart Area */}
                            <div className="flex-1 flex flex-col border-r border-gray-800 min-w-0 min-h-0 overflow-hidden">
                                {/* Chart Container */}
                                <div className="flex-1 relative bg-black min-h-0 overflow-hidden">
                                    {loading ? (
                                        <div className="absolute inset-0 p-6 z-10 flex flex-col" style={{ background: 'var(--bg-void)' }}>
                                            <SkeletonChart className="flex-1 w-full h-full" />
                                        </div>
                                    ) : error ? (
                                        <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 z-10" style={{ background: 'var(--bg-void)' }}>
                                            <div className="text-red-400 font-medium tracking-wide bg-red-500/10 px-4 py-2 rounded border border-red-500/20 shadow break-words max-w-md text-center">{error}</div>
                                            <div className="flex gap-4 mt-2">
                                                <button 
                                                    onClick={() => handleSelectStock(selectedTicker)}
                                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded transition-colors"
                                                >
                                                    Retry
                                                </button>
                                                <button
                                                    onClick={() => { setError(null); setSelectedTicker(null); }}
                                                    className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded transition-colors"
                                                >
                                                    Back to Search
                                                </button>
                                                <button
                                                    onClick={handleChartBack}
                                                    className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded transition-colors"
                                                >
                                                    ← Back to {TAB_LABELS[chartReturnTo] || 'Dashboard'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : predictionData ? (
                                        <StockChart
                                            history={predictionData.history}
                                            forecast={predictionData.forecast}
                                            livePrice={predictionData.live_price}
                                            liveChangePct={predictionData.live_change_pct}
                                            showSMA={true}
                                            showRSI={true}
                                            lowerBound={predictionData.lower_bound}
                                            upperBound={predictionData.upper_bound}
                                            ticker={selectedTicker}
                                            stockList={stockList}
                                            onSelectStock={handleSelectStock}
                                            onBack={handleChartBack}
                                            backLabel={TAB_LABELS[chartReturnTo] || 'Dashboard'}
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center bg-[#111213]/80 backdrop-blur-sm z-20">
                                            <div className="w-[calc(100vw-2rem)] max-w-[450px] bg-[#1a1c1e] border border-[#2a2e39] rounded-2xl shadow-2xl flex flex-col max-h-[60vh] overflow-hidden">
                                                <div className="px-5 pt-4 pb-2 flex items-center">
                                                    <button
                                                        onClick={handleChartBack}
                                                        className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                                                    >
                                                        <ArrowLeft size={16} />
                                                        Back to {TAB_LABELS[chartReturnTo] || 'Dashboard'}
                                                    </button>
                                                </div>
                                                <div className="p-5 border-b border-[#2a2e39] flex items-center gap-3 bg-[#151719]">
                                                    <Search size={20} className="text-gray-500" />
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        placeholder="Search stock ticker to view chart..."
                                                        className="flex-1 bg-transparent border-none text-white focus:outline-none text-lg placeholder-gray-600"
                                                        value={searchTerm}
                                                        onChange={(e) => setSearchTerm(e.target.value)}
                                                    />
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-gray-800 bg-[#1a1c1e]">
                                                    {filteredStocks.map(s => (
                                                        <div
                                                            key={s}
                                                            onClick={() => handleSelectStock(s)}
                                                            className="px-4 py-3 mb-1 cursor-pointer rounded-xl hover:bg-[#25282c] text-gray-200 flex justify-between items-center transition-all bg-[#1e2024]/50 border border-transparent hover:border-[#3a3e49]"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-lg bg-[#25282c] flex items-center justify-center font-bold text-gray-400">
                                                                    {s.charAt(0)}
                                                                </div>
                                                                <span className="font-bold text-lg text-white tracking-wide">{s}</span>
                                                            </div>
                                                            <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-md uppercase tracking-wider">Select</span>
                                                        </div>
                                                    ))}
                                                    {filteredStocks.length === 0 && (
                                                        <div className="p-10 text-center text-gray-500 flex flex-col items-center gap-3">
                                                            <Search size={32} className="text-gray-600 opacity-50" />
                                                            <span>No stocks found matching "{searchTerm}"</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'analyst' && canUseApp && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <ErrorBoundary>
                                <AIAnalystTab onSelectStock={handleSelectStock} />
                            </ErrorBoundary>
                        </div>
                    )}

                    {activeTab === 'data-analyst' && canUseApp && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <ErrorBoundary>
                                <DataAnalystTab onSelectStock={handleSelectStock} stockList={stockList} />
                            </ErrorBoundary>
                        </div>
                    )}

                    {activeTab === 'ltr-signals' && canUseApp && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <ErrorBoundary>
                                <LTRSignalsTab onSelectStock={handleSelectStock} onTabChange={handleTabChange} />
                            </ErrorBoundary>
                        </div>
                    )}

                    {activeTab === 'bcd-signals' && canUseApp && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <ErrorBoundary>
                                <BCDSignalsTab onSelectStock={handleSelectStock} onTabChange={handleTabChange} />
                            </ErrorBoundary>
                        </div>
                    )}

                    {activeTab === 'reports' && canUseApp && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <ErrorBoundary>
                                <ReportsTab onTabChange={handleTabChange} />
                            </ErrorBoundary>
                        </div>
                    )}

                    {activeTab === 'news' && canUseApp && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <ErrorBoundary>
                                <NewsTab onSelectStock={handleSelectStock} onTabChange={handleTabChange} />
                            </ErrorBoundary>
                        </div>
                    )}

                    {activeTab === 'chatbot' && canUseApp && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <ErrorBoundary>
                                <ChatbotTab onTabChange={handleTabChange} />
                            </ErrorBoundary>
                        </div>
                    )}

                    {(activeTab === 'login' || activeTab === 'auth/google/callback') && (
                        <ErrorBoundary>
                            <AuthPage onTabChange={handleTabChange} initialMode="login" />
                        </ErrorBoundary>
                    )}

                    {activeTab === 'register' && (
                        <ErrorBoundary>
                            <AuthPage onTabChange={handleTabChange} initialMode="register" />
                        </ErrorBoundary>
                    )}

                    {activeTab === 'profile' && (
                        <ProfilePage onTabChange={handleTabChange} />
                    )}

                    {activeTab === 'reset-password' && (
                        <ResetPasswordPage onTabChange={handleTabChange} />
                    )}

                    {activeTab === 'verify-email' && (
                        <VerifyEmailPage onTabChange={handleTabChange} />
                    )}

                    {LEGAL_TABS.has(activeTab) && (
                        <LegalPage slug={activeTab} onTabChange={handleTabChange} returnTo={policyReturnTo} />
                    )}

                    </Suspense>
                </main>

                {/* The landing page keeps its own richer FooterSection; every other
                    route gets this one, so the legal pages are always one click
                    away. Gated product tabs get the slim bar — their panes are
                    full-viewport overflow-hidden layouts that a tall footer would
                    visibly squeeze. */}
                {activeTab !== 'home' && (
                    <LegalFooter
                        onTabChange={handleTabChange}
                        compact={GATED_TABS.has(activeTab)}
                    />
                )}
            </div>

            <CookieConsent onTabChange={handleTabChange} activeTab={activeTab} />

            {/* Gated on GATED_TABS only, so a user asked to accept the terms can
                still navigate to /terms and /privacy to actually read them. */}
            {user?.needs_reconsent && GATED_TABS.has(activeTab) && (
                <ReconsentModal onTabChange={handleTabChange} />
            )}
        </div>
    );
}

export default App;
