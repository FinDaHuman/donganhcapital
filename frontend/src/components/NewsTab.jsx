import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { SkeletonCard } from './SkeletonLoader';
import { Newspaper, Globe, X, ArrowUpRight, ExternalLink, RefreshCw, Sparkles, Lock } from 'lucide-react';
import { StarMark } from './StarMark';
import RichText from './RichText';
import { SignInGate } from './AccessGate';

const GOLD = '#C9A96E';
const SURFACE = '#0E1729';
const MACRO_BLUE = '#5B9BD5';

// ── VN news constants ─────────────────────────────────────────────────────────
const CATEGORY_LABELS = {
    chung_khoan: 'Chứng khoán',
    doanh_nghiep: 'Doanh nghiệp',
    tai_chinh_nh: 'Tài chính - Ngân hàng',
    bat_dong_san: 'Bất động sản',
    hang_hoa: 'Hàng hóa',
    vi_mo: 'Vĩ mô',
};
const CATEGORY_ORDER = ['chung_khoan', 'doanh_nghiep', 'tai_chinh_nh', 'bat_dong_san', 'hang_hoa', 'vi_mo'];

// ── Macro news constants ──────────────────────────────────────────────────────
const TOPIC_LABELS = { InterestRate: 'Lãi suất', Debt: 'Nợ công', Other: 'Đa dạng' };
const TOPIC_ORDER = ['InterestRate', 'Debt', 'Other'];

const SOURCE_COLORS = {
    'Fed': '#60A5FA',
    'AP Economy': '#86EFAC',
    'World Bank': '#FCA5A5',
};

// ── Shared ────────────────────────────────────────────────────────────────────
const IMPACT_CONFIG = {
    Positive: { label: 'Tích cực', color: '#4DB882' },
    Negative: { label: 'Tiêu cực', color: '#E05555' },
    Neutral: { label: 'Trung lập', color: GOLD },
};

// ── Date helpers ──────────────────────────────────────────────────────────────
function parseNewsDate(publishedAt, createdAt) {
    let d = publishedAt ? new Date(publishedAt) : null;
    if ((!d || isNaN(d.getTime())) && typeof publishedAt === 'string') {
        const m = publishedAt.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s*-\s*(\d{2}):(\d{2}))?/);
        if (m) d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
    }
    if (!d || isNaN(d.getTime())) d = createdAt ? new Date(createdAt) : null;
    return d && !isNaN(d.getTime()) ? d : null;
}

function relativeVN(date) {
    if (!date) return '';
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return 'Vừa xong';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} phút trước`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ trước`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} ngày trước`;
    return date.toLocaleDateString('vi-VN');
}

// ── Scoped styles ─────────────────────────────────────────────────────────────
const STYLE = `
.dac-news-card{position:relative;background:${SURFACE};border:1px solid rgba(201,169,110,0.15);border-radius:16px;transition:border-color .3s ease,box-shadow .3s ease,background .3s ease;cursor:pointer;overflow:hidden}
.dac-news-card::before{content:'';position:absolute;top:-1px;left:20%;right:20%;height:2px;border-radius:0 0 2px 2px;background:linear-gradient(90deg,transparent,${GOLD},transparent);opacity:0;transition:opacity .4s ease}
.dac-news-card:hover{border-color:rgba(201,169,110,0.35);box-shadow:0 8px 40px rgba(0,0,0,0.65),0 0 0 1px rgba(201,169,110,0.1);background:#132035}
.dac-news-card:hover::before{opacity:1}
.dac-macro-card{position:relative;background:${SURFACE};border:1px solid rgba(91,155,213,0.15);border-radius:16px;transition:border-color .3s ease,box-shadow .3s ease,background .3s ease;cursor:pointer;overflow:hidden}
.dac-macro-card::before{content:'';position:absolute;top:-1px;left:20%;right:20%;height:2px;border-radius:0 0 2px 2px;background:linear-gradient(90deg,transparent,${MACRO_BLUE},transparent);opacity:0;transition:opacity .4s ease}
.dac-macro-card:hover{border-color:rgba(91,155,213,0.35);box-shadow:0 8px 40px rgba(0,0,0,0.65),0 0 0 1px rgba(91,155,213,0.1);background:#0f1e2e}
.dac-macro-card:hover::before{opacity:1}
.dac-tk{transition:background .15s ease,border-color .15s ease,color .15s ease}
.dac-tk:hover{background:rgba(201,169,110,0.16)!important;border-color:rgba(201,169,110,0.45)!important;color:${GOLD}!important}
.dac-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dac-clamp-3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dac-chip{transition:background .15s ease,color .15s ease,border-color .15s ease}
`;

// ── Small pieces ──────────────────────────────────────────────────────────────
const SectionLabel = ({ children }) => (
    <div className="flex items-center gap-3">
        <span style={{ height: 1, width: 28, background: `linear-gradient(to right, transparent, ${GOLD})` }} />
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: '0.26em', textTransform: 'uppercase', color: GOLD }}>
            {children}
        </span>
    </div>
);

const ImpactBadge = ({ impact }) => {
    const cfg = IMPACT_CONFIG[impact];
    if (!cfg) return null;
    return (
        <span
            className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
            style={{ background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}33`, fontFamily: "'Outfit', sans-serif" }}
        >
            {cfg.label}
        </span>
    );
};

const CategoryChip = ({ id }) => (
    <span
        className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
        style={{ background: 'rgba(201,169,110,0.08)', color: GOLD, border: '1px solid rgba(201,169,110,0.18)', fontFamily: "'Outfit', sans-serif" }}
    >
        {CATEGORY_LABELS[id] || id}
    </span>
);

const TopicChip = ({ id }) => (
    <span
        className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
        style={{ background: 'rgba(91,155,213,0.08)', color: MACRO_BLUE, border: '1px solid rgba(91,155,213,0.18)', fontFamily: "'Outfit', sans-serif" }}
    >
        {TOPIC_LABELS[id] || id}
    </span>
);

const SourceBadge = ({ source }) => {
    const color = SOURCE_COLORS[source] || MACRO_BLUE;
    return (
        <span
            className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider whitespace-nowrap"
            style={{ background: `${color}18`, color, border: `1px solid ${color}33`, fontFamily: "'Outfit', sans-serif" }}
        >
            {source}
        </span>
    );
};

const RegionTag = ({ region }) => {
    if (!region) return null;
    return (
        <span className="flex items-center gap-0.5 text-[10px]" style={{ color: '#4E617A', fontFamily: "'DM Mono', monospace" }}>
            <Globe size={9} />
            {region}
        </span>
    );
};

const TickerChips = ({ tickers, onSelectStock }) => {
    if (!tickers || tickers.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1.5 mt-3">
            {tickers.slice(0, 6).map((t) => (
                <button
                    key={t}
                    onClick={(e) => { e.stopPropagation(); onSelectStock?.(t); }}
                    className="dac-tk px-2 py-0.5 rounded-md text-xs font-medium cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.03)', color: '#94A3BC', border: '1px solid rgba(255,255,255,0.07)', fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em' }}
                >
                    {t}
                </button>
            ))}
        </div>
    );
};

// ── VN news card ──────────────────────────────────────────────────────────────
const NewsCard = ({ item, onSelectStock, onOpen }) => {
    const when = relativeVN(parseNewsDate(item.published_at, item.created_at));
    const hasSummary = item.summary && item.summary.length > 0;

    return (
        <article className="dac-news-card p-5 flex flex-col" onClick={() => onOpen(item)}>
            <div className="flex items-center justify-between gap-2 mb-3">
                <CategoryChip id={item.category} />
                <ImpactBadge impact={item.impact} />
            </div>
            <h3
                className="dac-clamp-2 text-[15px] font-semibold leading-snug mb-3"
                style={{ color: '#EDE8DA', fontFamily: "'Outfit', sans-serif" }}
            >
                {item.title}
            </h3>
            {hasSummary ? (
                <ul className="space-y-1.5 flex-1">
                    {item.summary.slice(0, 3).map((s, i) => (
                        <li key={i} className="flex gap-2 items-start">
                            <span className="mt-1.5 shrink-0"><StarMark size={9} color={GOLD} /></span>
                            <span className="dac-clamp-2 text-[13px] leading-relaxed" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>{s}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="dac-clamp-3 text-[13px] leading-relaxed flex-1" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>
                    {item.preview || ''}
                </p>
            )}
            <TickerChips tickers={item.tickers} onSelectStock={onSelectStock} />
            <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-[11px]" style={{ color: '#4E617A', fontFamily: "'DM Mono', monospace" }}>{when}</span>
                <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: GOLD, fontFamily: "'Outfit', sans-serif" }}>
                    Đọc thêm <ArrowUpRight size={13} />
                </span>
            </div>
        </article>
    );
};

// ── Macro news card ───────────────────────────────────────────────────────────
const MacroNewsCard = ({ item, onOpen }) => {
    const when = relativeVN(parseNewsDate(item.published_at, item.created_at));
    const hasSummary = item.summary && item.summary.length > 0;
    const displayTitle = item.title_vi || item.title;

    return (
        <article className="dac-macro-card p-5 flex flex-col" onClick={() => onOpen(item)}>
            <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                    <SourceBadge source={item.source} />
                    <RegionTag region={item.region} />
                </div>
                <ImpactBadge impact={item.impact} />
            </div>
            <h3
                className="dac-clamp-2 text-[15px] font-semibold leading-snug mb-3"
                style={{ color: '#EDE8DA', fontFamily: "'Outfit', sans-serif" }}
            >
                {displayTitle}
            </h3>
            {hasSummary ? (
                <ul className="space-y-1.5 flex-1">
                    {item.summary.slice(0, 3).map((s, i) => (
                        <li key={i} className="flex gap-2 items-start">
                            <span className="mt-1.5 shrink-0"><StarMark size={9} color={MACRO_BLUE} /></span>
                            <span className="dac-clamp-2 text-[13px] leading-relaxed" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>{s}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="dac-clamp-3 text-[13px] leading-relaxed flex-1" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>
                    {item.preview || ''}
                </p>
            )}
            <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-[11px]" style={{ color: '#4E617A', fontFamily: "'DM Mono', monospace" }}>{when}</span>
                <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: MACRO_BLUE, fontFamily: "'Outfit', sans-serif" }}>
                    Đọc thêm <ArrowUpRight size={13} />
                </span>
            </div>
        </article>
    );
};

// ── AI deep-analysis section (Pro/Premium, VN news only) ─────────────────────
const AnalysisSection = ({ article, onClose, onTabChange }) => {
    const { user, authApi, refreshUser } = useAuth();
    const bypass = user?.bypass_payment;
    const isPro = bypass
        ? user?.email_verified === true
        : user?.subscription_tier === 'pro' || user?.subscription_tier === 'premium';

    const [analysis, setAnalysis] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => { setAnalysis(null); setAnalyzing(false); setError(null); }, [article?.id]);

    const runAnalysis = async () => {
        setAnalyzing(true);
        setError(null);
        try {
            const res = await authApi.post('/api/chat/analyze-news', { url_hash: article.id }, { timeout: 30000 });
            setAnalysis(res.data?.analysis || '');
        } catch (err) {
            const status = err.response?.status;
            if (status === 429) {
                const d = err.response?.data?.detail;
                setError((d && d.message) || (bypass
                    ? 'Bạn đã dùng hết 5 lượt miễn phí hôm nay. Vui lòng quay lại vào ngày mai.'
                    : 'Bạn đã dùng hết lượt phân tích hôm nay. Nâng cấp Premium để dùng không giới hạn.'));
            } else if (status === 403) {
                setError('Phiên đăng ký đã thay đổi. Đang cập nhật…');
                await refreshUser();
            } else {
                setError('Trợ lý đang bận, vui lòng thử lại sau giây lát.');
            }
        } finally {
            setAnalyzing(false);
        }
    };

    if (!article?.id) return null;

    return (
        <div className="mb-6">
            {!analysis && (
                isPro ? (
                    <button
                        onClick={runAnalysis}
                        disabled={analyzing}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold cursor-pointer"
                        style={{ color: '#0A1020', background: `linear-gradient(135deg, ${GOLD}, #E8C97A)`, border: 'none', fontFamily: "'Outfit', sans-serif", opacity: analyzing ? 0.7 : 1 }}
                    >
                        {analyzing
                            ? <><RefreshCw size={14} className="animate-spin" /> Đang phân tích…</>
                            : <><Sparkles size={15} /> Phân tích chuyên sâu với AI</>}
                    </button>
                ) : (
                    <button
                        onClick={() => {
                            if (bypass) {
                                // In bypass mode, the locked state means unverified email — no checkout
                                onClose();
                            } else {
                                onClose(); onTabChange?.('checkout', { plan: 'pro', period: 'monthly' });
                            }
                        }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium cursor-pointer"
                        style={{ color: GOLD, background: 'transparent', border: `1px solid ${GOLD}40`, fontFamily: "'Outfit', sans-serif" }}
                    >
                        <Lock size={14} /> {bypass ? 'Xác thực email để sử dụng' : 'Phân tích AI chuyên sâu — Nâng cấp Pro'}
                    </button>
                )
            )}
            {error && (
                <p className="mt-2 text-sm" style={{ color: '#E05555', fontFamily: "'Outfit', sans-serif" }}>{error}</p>
            )}
            {analysis && (
                <div className="p-4 rounded-2xl" style={{ background: 'rgba(201,169,110,0.05)', border: '1px solid rgba(201,169,110,0.14)' }}>
                    <div className="mb-3"><SectionLabel>Phân tích AI</SectionLabel></div>
                    <RichText text={analysis} className="text-[14px] leading-relaxed" style={{ color: '#EDE8DA', fontFamily: "'Outfit', sans-serif" }} />
                    <p className="mt-3 text-[11px]" style={{ color: '#4E617A', fontFamily: "'Outfit', sans-serif" }}>
                        Thông tin tham khảo, không phải khuyến nghị đầu tư.
                    </p>
                </div>
            )}
        </div>
    );
};

// ── Detail modal (handles both VN and macro articles) ────────────────────────
const NewsDetailModal = ({ article, loading, onClose, onSelectStock, onTabChange, isMacro }) => {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    }, [onClose]);

    const when = article ? relativeVN(parseNewsDate(article.published_at, article.created_at)) : '';
    const metrics = article?.key_metrics ? Object.entries(article.key_metrics) : [];
    const displayTitle = isMacro ? (article?.title_vi || article?.title) : article?.title;
    const sourceLink = isMacro ? article?.url : article?.source_url;
    const bodyText = isMacro ? article?.full_translation_vi : article?.raw_text;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-0 sm:p-6"
            style={{ background: 'rgba(6,11,20,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={onClose}
        >
            <div
                className="relative w-full sm:max-w-3xl max-h-full sm:max-h-[88vh] flex flex-col"
                style={{
                    background: SURFACE,
                    border: `1px solid ${isMacro ? 'rgba(91,155,213,0.22)' : 'rgba(201,169,110,0.18)'}`,
                    borderRadius: 20,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    aria-label="Đóng"
                    className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#94A3BC' }}
                >
                    <X size={16} />
                </button>

                {loading || !article ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-24">
                        <RefreshCw size={22} className="animate-spin" style={{ color: isMacro ? MACRO_BLUE : GOLD }} />
                        <span className="text-sm" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>Đang tải bài viết…</span>
                    </div>
                ) : (
                    <div className="overflow-y-auto p-6 sm:p-8">
                        {/* Meta row */}
                        <div className="flex items-center gap-2 mb-4 pr-10 flex-wrap">
                            {isMacro ? (
                                <>
                                    <SourceBadge source={article.source} />
                                    <TopicChip id={article.topic} />
                                    <RegionTag region={article.region} />
                                </>
                            ) : (
                                <CategoryChip id={article.category} />
                            )}
                            <ImpactBadge impact={article.impact} />
                            <span className="text-[11px]" style={{ color: '#4E617A', fontFamily: "'DM Mono', monospace" }}>{when}</span>
                        </div>

                        {/* Title */}
                        <h2 className="text-2xl font-bold leading-tight mb-5" style={{ color: '#EDE8DA', fontFamily: "'Outfit', sans-serif" }}>
                            {displayTitle}
                        </h2>

                        {/* AI summary bullets */}
                        {article.summary?.length > 0 && (
                            <div className="mb-6 p-4 rounded-2xl" style={{ background: isMacro ? 'rgba(91,155,213,0.05)' : 'rgba(201,169,110,0.05)', border: `1px solid ${isMacro ? 'rgba(91,155,213,0.14)' : 'rgba(201,169,110,0.14)'}` }}>
                                <div className="mb-3"><SectionLabel>Tóm tắt AI</SectionLabel></div>
                                <ul className="space-y-2">
                                    {article.summary.map((s, i) => (
                                        <li key={i} className="flex gap-2.5 items-start">
                                            <span className="mt-1.5 shrink-0"><StarMark size={10} color={isMacro ? MACRO_BLUE : GOLD} /></span>
                                            <span className="text-[14px] leading-relaxed" style={{ color: '#EDE8DA', fontFamily: "'Outfit', sans-serif" }}>{s}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* AI deep analysis (VN news only) */}
                        {!isMacro && (
                            <AnalysisSection article={article} onClose={onClose} onTabChange={onTabChange} />
                        )}

                        {/* Key metrics */}
                        {metrics.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-6">
                                {metrics.map(([k, v]) => (
                                    <div key={k} className="px-3.5 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#4E617A', fontFamily: "'Outfit', sans-serif", letterSpacing: '0.12em' }}>{k}</div>
                                        <div className="text-sm" style={{ color: '#EDE8DA', fontFamily: "'DM Mono', monospace" }}>{String(v)}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Tickers (VN news only) */}
                        {!isMacro && article.tickers?.length > 0 && (
                            <div className="mb-6">
                                <TickerChips tickers={article.tickers} onSelectStock={(t) => { onClose(); onSelectStock?.(t); }} />
                            </div>
                        )}

                        {/* Body text */}
                        {bodyText && (
                            <p className="text-[15px] leading-[1.8] whitespace-pre-line mb-6" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>
                                {bodyText}
                            </p>
                        )}

                        {/* Source link */}
                        {sourceLink && (
                            <a
                                href={sourceLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 mt-1 px-5 py-2.5 rounded-full text-sm font-medium cursor-pointer"
                                style={{ background: 'transparent', color: isMacro ? MACRO_BLUE : GOLD, border: `1px solid ${isMacro ? MACRO_BLUE : GOLD}40`, fontFamily: "'Outfit', sans-serif" }}
                            >
                                {isMacro ? 'Xem bài gốc' : 'Xem bài gốc trên CafeF'} <ExternalLink size={14} />
                            </a>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Main tab ──────────────────────────────────────────────────────────────────
const NewsTab = ({ onSelectStock, onTabChange }) => {
    const { isAuthenticated, authApi } = useAuth();

    // 'vn' = CafeF Vietnamese market news, 'macro' = world macro news
    const [source, setSource] = useState('vn');
    const [filter, setFilter] = useState('');       // category (vn) or topic (macro)
    const [items, setItems] = useState([]);
    const [nextCursor, setNextCursor] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);

    const [detailOpen, setDetailOpen] = useState(false);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailIsMacro, setDetailIsMacro] = useState(false);
    const requestSeq = useRef(0);

    const fetchPage = useCallback(async (src, activeFilter, cursor = null) => {
        const params = new URLSearchParams();
        if (activeFilter) params.set(src === 'macro' ? 'topic' : 'category', activeFilter);
        if (cursor) params.set('cursor', cursor);
        const base = src === 'macro' ? '/api/macro-news' : '/api/news';
        const res = await authApi.get(`${base}?${params.toString()}`);
        return res.data || { items: [], next_cursor: null };
    }, [authApi]);

    const handleSourceChange = (newSource) => {
        if (newSource === source) return;
        setSource(newSource);
        setFilter('');
        setItems([]);
        setNextCursor(null);
    };

    useEffect(() => {
        if (!isAuthenticated) { setLoading(false); return; }
        let active = true;
        const seq = ++requestSeq.current;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await fetchPage(source, filter);
                if (active && seq === requestSeq.current) {
                    setItems(data.items || []);
                    setNextCursor(data.next_cursor || null);
                }
            } catch (err) {
                if (active && err.response?.status !== 401) setError('Không thể tải tin tức. Vui lòng thử lại.');
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [isAuthenticated, source, filter, fetchPage]);

    const handleLoadMore = async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        const seq = requestSeq.current;
        try {
            const data = await fetchPage(source, filter, nextCursor);
            if (seq === requestSeq.current) {
                setItems((prev) => [...prev, ...(data.items || [])]);
                setNextCursor(data.next_cursor || null);
            }
        } catch {
            /* keep existing items */
        } finally {
            setLoadingMore(false);
        }
    };

    const openArticle = async (item) => {
        const isMacro = source === 'macro';
        setDetailOpen(true);
        setDetailIsMacro(isMacro);
        setDetail(null);
        setDetailLoading(true);
        try {
            const endpoint = isMacro ? `/api/macro-news/${item.id}` : `/api/news/${item.id}`;
            const res = await authApi.get(endpoint);
            setDetail(res.data);
        } catch {
            setDetail({ ...item, raw_text: item.preview || '', full_translation_vi: item.preview || '', key_metrics: {} });
        } finally {
            setDetailLoading(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="flex-1 w-full flex flex-col" style={{ background: '#000' }}>
                <style>{STYLE}</style>
                <SignInGate
                    onTabChange={onTabChange}
                    icon={Newspaper}
                    title="Sign In to Read Market News"
                    description="Curated financial news with AI summaries — free for all signed-in members."
                />
            </div>
        );
    }

    const isMacro = source === 'macro';
    const accentColor = isMacro ? MACRO_BLUE : GOLD;

    // Build filter chips based on active source
    const filterChips = isMacro
        ? [{ id: '', label: 'Tất cả' }, ...TOPIC_ORDER.map((id) => ({ id, label: TOPIC_LABELS[id] }))]
        : [{ id: '', label: 'Tất cả' }, ...CATEGORY_ORDER.map((id) => ({ id, label: CATEGORY_LABELS[id] }))];

    return (
        <div className="flex-1 w-full overflow-y-auto" style={{ background: '#000' }}>
            <style>{STYLE}</style>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

                {/* Source toggle */}
                <div className="flex gap-2 mb-6">
                    {[
                        { key: 'vn', icon: '🇻🇳', label: 'Thị trường Việt Nam' },
                        { key: 'macro', icon: '🌍', label: 'Vĩ mô Thế giới' },
                    ].map(({ key, icon, label }) => {
                        const active = source === key;
                        const color = key === 'macro' ? MACRO_BLUE : GOLD;
                        return (
                            <button
                                key={key}
                                onClick={() => handleSourceChange(key)}
                                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold cursor-pointer transition-all"
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    background: active ? `${color}18` : 'rgba(255,255,255,0.03)',
                                    color: active ? color : '#94A3BC',
                                    border: active ? `1px solid ${color}55` : '1px solid rgba(255,255,255,0.07)',
                                }}
                            >
                                <span>{icon}</span>
                                {label}
                            </button>
                        );
                    })}
                </div>

                {/* Header */}
                <div className="mb-6">
                    <div className="mb-2"><SectionLabel>Bản tin</SectionLabel></div>
                    <h2 className="text-2xl font-bold" style={{ color: '#EDE8DA', fontFamily: "'Outfit', sans-serif" }}>
                        {isMacro ? 'Vĩ mô Thế giới' : 'Tin tức Thị trường'}
                    </h2>
                    <p className="text-sm mt-1" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>
                        {isMacro
                            ? 'Tin kinh tế vĩ mô toàn cầu từ Fed, World Bank, AP — tóm tắt tiếng Việt.'
                            : 'Tin tài chính chọn lọc, kèm tóm tắt AI — cập nhật hằng ngày.'}
                    </p>
                </div>

                {/* Filter chips */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {filterChips.map((c) => {
                        const active = filter === c.id;
                        return (
                            <button
                                key={c.id || 'all'}
                                onClick={() => setFilter(c.id)}
                                className="dac-chip px-3.5 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    background: active ? `${accentColor}15` : 'rgba(255,255,255,0.03)',
                                    color: active ? accentColor : '#94A3BC',
                                    border: active ? `1px solid ${accentColor}55` : '1px solid rgba(255,255,255,0.07)',
                                }}
                            >
                                {c.label}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} className="h-52" />)}
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                        <p className="text-sm" style={{ color: '#E05555', fontFamily: "'Outfit', sans-serif" }}>{error}</p>
                        <button
                            onClick={() => {
                                const seq = ++requestSeq.current;
                                setLoading(true);
                                setError(null);
                                fetchPage(source, filter)
                                    .then((data) => {
                                        if (seq === requestSeq.current) {
                                            setItems(data.items || []);
                                            setNextCursor(data.next_cursor || null);
                                        }
                                    })
                                    .catch(() => setError('Không thể tải tin tức. Vui lòng thử lại.'))
                                    .finally(() => setLoading(false));
                            }}
                            className="px-5 py-2.5 rounded-full text-sm font-medium cursor-pointer"
                            style={{ color: accentColor, background: 'transparent', border: `1px solid ${accentColor}40`, fontFamily: "'Outfit', sans-serif" }}
                        >
                            Thử lại
                        </button>
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                        {isMacro ? <Globe size={32} style={{ color: '#4E617A' }} /> : <Newspaper size={32} style={{ color: '#4E617A' }} />}
                        <p className="text-sm" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>Chưa có tin tức trong mục này.</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {items.map((item) =>
                                isMacro
                                    ? <MacroNewsCard key={item.id} item={item} onOpen={openArticle} />
                                    : <NewsCard key={item.id} item={item} onSelectStock={onSelectStock} onOpen={openArticle} />
                            )}
                        </div>

                        {nextCursor && (
                            <div className="flex justify-center mt-8">
                                <button
                                    onClick={handleLoadMore}
                                    disabled={loadingMore}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium cursor-pointer"
                                    style={{ color: accentColor, background: 'transparent', border: `1px solid ${accentColor}33`, fontFamily: "'Outfit', sans-serif", opacity: loadingMore ? 0.6 : 1 }}
                                >
                                    {loadingMore && <RefreshCw size={14} className="animate-spin" />}
                                    {loadingMore ? 'Đang tải…' : 'Xem thêm'}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {detailOpen && (
                <NewsDetailModal
                    article={detail}
                    loading={detailLoading}
                    onClose={() => setDetailOpen(false)}
                    onSelectStock={onSelectStock}
                    onTabChange={onTabChange}
                    isMacro={detailIsMacro}
                />
            )}
        </div>
    );
};

export default NewsTab;
