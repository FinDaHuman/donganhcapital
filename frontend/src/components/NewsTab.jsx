import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { SkeletonCard } from './SkeletonLoader';
import { Newspaper, X, ArrowUpRight, ExternalLink, RefreshCw } from 'lucide-react';
import { StarMark } from './StarMark';

const GOLD = '#C9A96E';
const SURFACE = '#0E1729';

const CATEGORY_LABELS = {
    chung_khoan: 'Chứng khoán',
    doanh_nghiep: 'Doanh nghiệp',
    tai_chinh_nh: 'Tài chính - Ngân hàng',
    bat_dong_san: 'Bất động sản',
    hang_hoa: 'Hàng hóa',
    vi_mo: 'Vĩ mô',
};

const CATEGORY_ORDER = ['chung_khoan', 'doanh_nghiep', 'tai_chinh_nh', 'bat_dong_san', 'hang_hoa', 'vi_mo'];

const IMPACT_CONFIG = {
    Positive: { label: 'Tích cực', color: '#4DB882' },
    Negative: { label: 'Tiêu cực', color: '#E05555' },
    Neutral: { label: 'Trung lập', color: GOLD },
};

// ── Date helpers ─────────────────────────────────────────────────────────────
// published_at is mixed type/format (ISO Date or "dd/mm/yyyy - hh:mm"); fall
// back to created_at (always a reliable date) if it can't be parsed.
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

// ── Scoped styles (gold top-edge hover per design system) ────────────────────
const STYLE = `
.dac-news-card{position:relative;background:${SURFACE};border:1px solid rgba(201,169,110,0.15);border-radius:16px;transition:border-color .3s ease,box-shadow .3s ease,background .3s ease;cursor:pointer;overflow:hidden}
.dac-news-card::before{content:'';position:absolute;top:-1px;left:20%;right:20%;height:2px;border-radius:0 0 2px 2px;background:linear-gradient(90deg,transparent,${GOLD},transparent);opacity:0;transition:opacity .4s ease}
.dac-news-card:hover{border-color:rgba(201,169,110,0.35);box-shadow:0 8px 40px rgba(0,0,0,0.65),0 0 0 1px rgba(201,169,110,0.1);background:#132035}
.dac-news-card:hover::before{opacity:1}
.dac-tk{transition:background .15s ease,border-color .15s ease,color .15s ease}
.dac-tk:hover{background:rgba(201,169,110,0.16)!important;border-color:rgba(201,169,110,0.45)!important;color:${GOLD}!important}
.dac-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dac-clamp-3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dac-chip{transition:background .15s ease,color .15s ease,border-color .15s ease}
`;

// ── Small pieces ─────────────────────────────────────────────────────────────
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

// ── News card ────────────────────────────────────────────────────────────────
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
                            <span className="dac-clamp-2 text-[13px] leading-relaxed" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>
                                {s}
                            </span>
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

// ── Detail modal ─────────────────────────────────────────────────────────────
const NewsDetailModal = ({ article, loading, onClose, onSelectStock }) => {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    }, [onClose]);

    const when = article ? relativeVN(parseNewsDate(article.published_at, article.created_at)) : '';
    const metrics = article?.key_metrics ? Object.entries(article.key_metrics) : [];

    return (
        <div
            className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-0 sm:p-6"
            style={{ background: 'rgba(6,11,20,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={onClose}
        >
            <div
                className="relative w-full sm:max-w-3xl max-h-full sm:max-h-[88vh] flex flex-col"
                style={{ background: SURFACE, border: `1px solid rgba(201,169,110,0.18)`, borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}
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
                        <RefreshCw size={22} className="animate-spin" style={{ color: GOLD }} />
                        <span className="text-sm" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>Đang tải bài viết…</span>
                    </div>
                ) : (
                    <div className="overflow-y-auto p-6 sm:p-8">
                        <div className="flex items-center gap-2 mb-4 pr-10">
                            <CategoryChip id={article.category} />
                            <ImpactBadge impact={article.impact} />
                            <span className="text-[11px]" style={{ color: '#4E617A', fontFamily: "'DM Mono', monospace" }}>{when}</span>
                        </div>

                        <h2 className="text-2xl font-bold leading-tight mb-5" style={{ color: '#EDE8DA', fontFamily: "'Outfit', sans-serif" }}>
                            {article.title}
                        </h2>

                        {article.summary?.length > 0 && (
                            <div className="mb-6 p-4 rounded-2xl" style={{ background: 'rgba(201,169,110,0.05)', border: '1px solid rgba(201,169,110,0.14)' }}>
                                <div className="mb-3"><SectionLabel>Tóm tắt AI</SectionLabel></div>
                                <ul className="space-y-2">
                                    {article.summary.map((s, i) => (
                                        <li key={i} className="flex gap-2.5 items-start">
                                            <span className="mt-1.5 shrink-0"><StarMark size={10} color={GOLD} /></span>
                                            <span className="text-[14px] leading-relaxed" style={{ color: '#EDE8DA', fontFamily: "'Outfit', sans-serif" }}>{s}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

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

                        {article.tickers?.length > 0 && (
                            <div className="mb-6">
                                <TickerChips tickers={article.tickers} onSelectStock={(t) => { onClose(); onSelectStock?.(t); }} />
                            </div>
                        )}

                        {article.raw_text && (
                            <p className="text-[15px] leading-[1.8] whitespace-pre-line" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>
                                {article.raw_text}
                            </p>
                        )}

                        {article.source_url && (
                            <a
                                href={article.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 mt-7 px-5 py-2.5 rounded-full text-sm font-medium cursor-pointer"
                                style={{ background: 'transparent', color: GOLD, border: `1px solid ${GOLD}40`, fontFamily: "'Outfit', sans-serif" }}
                            >
                                Xem bài gốc trên CafeF <ExternalLink size={14} />
                            </a>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Sign-in gate ─────────────────────────────────────────────────────────────
const SignInPrompt = ({ onTabChange }) => (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}>
            <Newspaper size={28} style={{ color: GOLD }} />
        </div>
        <div>
            <h3 className="text-xl font-bold mb-2" style={{ color: '#EDE8DA', fontFamily: "'Outfit', sans-serif" }}>
                Đăng nhập để đọc Bản tin Thị trường
            </h3>
            <p className="text-sm max-w-sm" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>
                Tin tức tài chính cập nhật cùng tóm tắt AI — miễn phí cho mọi thành viên đã đăng nhập.
            </p>
        </div>
        <div className="flex gap-3">
            <button
                onClick={() => onTabChange('login')}
                className="px-6 py-2.5 rounded-full text-sm font-medium cursor-pointer"
                style={{ color: GOLD, background: 'transparent', border: `1px solid ${GOLD}35`, fontFamily: "'Outfit', sans-serif" }}
            >
                Đăng nhập
            </button>
            <button
                onClick={() => onTabChange('register')}
                className="px-6 py-2.5 rounded-full text-sm font-semibold cursor-pointer"
                style={{ color: '#0A1020', background: `linear-gradient(135deg, ${GOLD}, #E8C97A)`, border: 'none', fontFamily: "'Outfit', sans-serif" }}
            >
                Đăng ký miễn phí
            </button>
        </div>
    </div>
);

// ── Main tab ─────────────────────────────────────────────────────────────────
const NewsTab = ({ onSelectStock, onTabChange }) => {
    const { isAuthenticated, authApi } = useAuth();

    const [items, setItems] = useState([]);
    const [nextCursor, setNextCursor] = useState(null);
    const [category, setCategory] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);

    const [detailOpen, setDetailOpen] = useState(false);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const fetchPage = useCallback(async (cat, cursor = null, append = false) => {
        const params = new URLSearchParams();
        if (cat) params.set('category', cat);
        if (cursor) params.set('cursor', cursor);
        const res = await authApi.get(`/api/news?${params.toString()}`);
        const data = res.data || { items: [], next_cursor: null };
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setNextCursor(data.next_cursor);
    }, [authApi]);

    // Initial + category-change load
    useEffect(() => {
        if (!isAuthenticated) { setLoading(false); return; }
        let active = true;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                await fetchPage(category, null, false);
            } catch (err) {
                if (active && err.response?.status !== 401) setError('Không thể tải tin tức. Vui lòng thử lại.');
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [isAuthenticated, category, fetchPage]);

    const handleLoadMore = async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            await fetchPage(category, nextCursor, true);
        } catch {
            /* keep existing items; button stays for retry */
        } finally {
            setLoadingMore(false);
        }
    };

    const openArticle = async (item) => {
        setDetailOpen(true);
        setDetail(null);
        setDetailLoading(true);
        try {
            const res = await authApi.get(`/api/news/${item.id}`);
            setDetail(res.data);
        } catch {
            // Fall back to the list payload we already have.
            setDetail({ ...item, raw_text: item.preview || '', key_metrics: {} });
        } finally {
            setDetailLoading(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="flex-1 w-full flex flex-col" style={{ background: '#000' }}>
                <style>{STYLE}</style>
                <SignInPrompt onTabChange={onTabChange} />
            </div>
        );
    }

    return (
        <div className="flex-1 w-full overflow-y-auto" style={{ background: '#000' }}>
            <style>{STYLE}</style>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                {/* Header */}
                <div className="mb-6">
                    <div className="mb-2"><SectionLabel>Bản tin</SectionLabel></div>
                    <h2 className="text-2xl font-bold" style={{ color: '#EDE8DA', fontFamily: "'Outfit', sans-serif" }}>
                        Tin tức Thị trường
                    </h2>
                    <p className="text-sm mt-1" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>
                        Tin tài chính chọn lọc, kèm tóm tắt AI — cập nhật hằng ngày.
                    </p>
                </div>

                {/* Category filter */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {[{ id: '', label: 'Tất cả' }, ...CATEGORY_ORDER.map((id) => ({ id, label: CATEGORY_LABELS[id] }))].map((c) => {
                        const active = category === c.id;
                        return (
                            <button
                                key={c.id || 'all'}
                                onClick={() => setCategory(c.id)}
                                className="dac-chip px-3.5 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    background: active ? 'rgba(201,169,110,0.15)' : 'rgba(255,255,255,0.03)',
                                    color: active ? GOLD : '#94A3BC',
                                    border: active ? `1px solid ${GOLD}55` : '1px solid rgba(255,255,255,0.07)',
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
                                setLoading(true);
                                setError(null);
                                fetchPage(category)
                                    .catch(() => setError('Không thể tải tin tức. Vui lòng thử lại.'))
                                    .finally(() => setLoading(false));
                            }}
                            className="px-5 py-2.5 rounded-full text-sm font-medium cursor-pointer"
                            style={{ color: GOLD, background: 'transparent', border: `1px solid ${GOLD}40`, fontFamily: "'Outfit', sans-serif" }}
                        >
                            Thử lại
                        </button>
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                        <Newspaper size={32} style={{ color: '#4E617A' }} />
                        <p className="text-sm" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>Chưa có tin tức trong mục này.</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {items.map((item) => (
                                <NewsCard key={item.id} item={item} onSelectStock={onSelectStock} onOpen={openArticle} />
                            ))}
                        </div>

                        {nextCursor && (
                            <div className="flex justify-center mt-8">
                                <button
                                    onClick={handleLoadMore}
                                    disabled={loadingMore}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium cursor-pointer"
                                    style={{ color: GOLD, background: 'transparent', border: `1px solid ${GOLD}33`, fontFamily: "'Outfit', sans-serif", opacity: loadingMore ? 0.6 : 1 }}
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
                />
            )}
        </div>
    );
};

export default NewsTab;
