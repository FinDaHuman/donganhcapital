import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import StockChart from './components/StockChart';
import AIAnalystTab from './components/AIAnalystTab';
import DataAnalystTab from './components/DataAnalystTab';
import LTRSignalsTab from './components/LTRSignalsTab';
import NewsTab from './components/NewsTab';
import ChatbotTab from './components/ChatbotTab';
import { getPrediction, getTickers } from './services/stock_api';
import LandingPage from './components/LandingPage';
import ErrorBoundary from './components/ErrorBoundary';
import { Search, AlertTriangle, X, Mail } from 'lucide-react';
import { SkeletonChart } from './components/SkeletonLoader';
import AuthPage from './pages/AuthPage';
import ProfilePage from './pages/ProfilePage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import CheckoutPage from './pages/CheckoutPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import { useAuth } from './context/AuthContext';

// Every navigable tab. Anything else in the URL path falls back to 'home' so a
// mistyped or stale link renders the landing page instead of a blank screen.
// (Single source of truth for both the initial render and popstate handling.)
const KNOWN_TABS = new Set([
    'home', 'dashboard', 'chart', 'analyst', 'data-analyst', 'ltr-signals',
    'news', 'chatbot', 'login', 'auth/google/callback', 'register', 'profile',
    'reset-password', 'verify-email', 'checkout', 'privacy', 'terms',
]);

// Derive the active tab from the current URL: path first (e.g. /news), then the
// ?tab= query fallback, else 'home'. Unknown paths resolve to 'home'.
const tabFromLocation = () => {
    const path = window.location.pathname.replace('/', '');
    const queryTab = new URLSearchParams(window.location.search).get('tab');
    const tab = path || queryTab || 'home';
    return KNOWN_TABS.has(tab) ? tab : 'home';
};

function App() {
    const { user, resendVerification } = useAuth();
    const [dismissedExpiry, setDismissedExpiry] = useState(false);
    const [dismissedVerify, setDismissedVerify] = useState(false);
    const [resendVerifyLoading, setResendVerifyLoading] = useState(false);
    const [resendVerifyMsg, setResendVerifyMsg] = useState('');

    // Compute expiry warning
    const expiryWarning = (() => {
        if (!user?.subscription_expires_at || !user?.subscription_tier || user.subscription_tier === 'free') return null;
        const daysLeft = Math.ceil((new Date(user.subscription_expires_at) - new Date()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 3 && daysLeft >= 0) {
            const isTrial = user.subscription_tier === 'pro' && user.subscription_period === 'trial';
            return { daysLeft, tier: user.subscription_tier, isTrial };
        }
        return null;
    })();

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
    const [checkoutPlan, setCheckoutPlan] = useState({ plan: 'pro', period: 'monthly' });

    // Handle checkout navigation with plan/period and update URL
    const handleTabChange = (tab, data) => {
        if (tab === 'checkout' && data) {
            setCheckoutPlan(data);
        }
        if (tab === 'terms' || tab === 'privacy') {
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
            {/* Subscription expiry warning banner */}
            {expiryWarning && !dismissedExpiry && activeTab !== 'home' && activeTab !== 'login' && activeTab !== 'register' && activeTab !== 'reset-password' && (
                <div
                    className="w-full flex items-center justify-center gap-3 px-4 py-2.5 text-sm"
                    style={{
                        background: 'rgba(234,179,8,0.08)',
                        borderBottom: '1px solid rgba(234,179,8,0.2)',
                        fontFamily: "'Outfit', sans-serif",
                    }}
                >
                    <AlertTriangle size={14} style={{ color: '#eab308', flexShrink: 0 }} />
                    <span style={{ color: '#eab308' }}>
                        {expiryWarning.isTrial ? (
                            <>Your <strong>free Pro trial</strong> ends in </>
                        ) : (
                            <>Your <strong style={{ textTransform: 'capitalize' }}>{expiryWarning.tier}</strong> plan expires in </>
                        )}
                        <strong>{expiryWarning.daysLeft} day{expiryWarning.daysLeft !== 1 ? 's' : ''}</strong>.{' '}
                        <button
                            onClick={() => handleTabChange('profile')}
                            className="cursor-pointer underline"
                            style={{ background: 'none', border: 'none', color: '#eab308', fontFamily: "'Outfit', sans-serif" }}
                        >
                            {expiryWarning.isTrial ? 'Keep Pro →' : 'Renew now →'}
                        </button>
                    </span>
                    <button
                        onClick={() => setDismissedExpiry(true)}
                        className="ml-auto cursor-pointer"
                        style={{ background: 'none', border: 'none', color: '#eab308', opacity: 0.6, flexShrink: 0 }}
                        aria-label="Dismiss"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
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
                            Please verify your email to claim your free Pro trial.{' '}
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

            {activeTab !== 'home' && activeTab !== 'login' && activeTab !== 'register' && activeTab !== 'profile' && activeTab !== 'checkout' && activeTab !== 'privacy' && activeTab !== 'terms' && activeTab !== 'reset-password' && activeTab !== 'verify-email' && <Header activeTab={activeTab} onTabChange={handleTabChange} />}

            <div className="flex-1 flex flex-col w-full min-h-0 relative">
                <main className="flex-1 overflow-hidden relative flex flex-col min-h-0" style={{ backgroundColor: '#000' }}>

                    {activeTab === 'home' && (
                        <div className="h-full w-full overflow-hidden">
                        <LandingPage onTabChange={handleTabChange} />
                        </div>
                    )}

                    {activeTab === 'dashboard' && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <ErrorBoundary>
                                <Dashboard onSelectStock={handleSelectStock} />
                            </ErrorBoundary>
                        </div>
                    )}

                    {activeTab === 'chart' && (
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
                                            </div>
                                        </div>
                                    ) : predictionData ? (
                                        <StockChart
                                            history={predictionData.history}
                                            forecast={predictionData.forecast}
                                            showSMA={true}
                                            showRSI={true}
                                            lowerBound={predictionData.lower_bound}
                                            upperBound={predictionData.upper_bound}
                                            ticker={selectedTicker}
                                            stockList={stockList}
                                            onSelectStock={handleSelectStock}
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center bg-[#111213]/80 backdrop-blur-sm z-20">
                                            <div className="w-[calc(100vw-2rem)] max-w-[450px] bg-[#1a1c1e] border border-[#2a2e39] rounded-2xl shadow-2xl flex flex-col max-h-[60vh] overflow-hidden">
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

                    {activeTab === 'analyst' && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <ErrorBoundary>
                                <AIAnalystTab onSelectStock={handleSelectStock} />
                            </ErrorBoundary>
                        </div>
                    )}

                    {activeTab === 'data-analyst' && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <ErrorBoundary>
                                <DataAnalystTab onSelectStock={handleSelectStock} stockList={stockList} />
                            </ErrorBoundary>
                        </div>
                    )}

                    {activeTab === 'ltr-signals' && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <ErrorBoundary>
                                <LTRSignalsTab onSelectStock={handleSelectStock} onTabChange={handleTabChange} />
                            </ErrorBoundary>
                        </div>
                    )}

                    {activeTab === 'news' && (
                        <div className="flex-1 w-full relative min-h-0 flex flex-col" style={{ minHeight: '600px' }}>
                            <ErrorBoundary>
                                <NewsTab onSelectStock={handleSelectStock} onTabChange={handleTabChange} />
                            </ErrorBoundary>
                        </div>
                    )}

                    {activeTab === 'chatbot' && (
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

                    {activeTab === 'checkout' && (
                        <CheckoutPage
                            onTabChange={handleTabChange}
                            plan={checkoutPlan.plan}
                            period={checkoutPlan.period}
                        />
                    )}

                    {activeTab === 'privacy' && (
                        <PrivacyPolicyPage onTabChange={handleTabChange} returnTo={policyReturnTo} />
                    )}

                    {activeTab === 'terms' && (
                        <TermsOfServicePage onTabChange={handleTabChange} returnTo={policyReturnTo} />
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;
