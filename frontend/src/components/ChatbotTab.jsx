import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Bot, Send, Sparkles, Lock, RefreshCw } from 'lucide-react';

const GOLD = '#C9A96E';
const SURFACE = '#0E1729';

const MAX_HISTORY = 12;   // turns kept client-side & forwarded to the backend
const MAX_CHARS = 2000;

const SUGGESTIONS = [
    'Phân tích triển vọng cổ phiếu FPT',
    'Thị trường ngân hàng đang có gì đáng chú ý?',
    'Nên lưu ý gì khi VNINDEX biến động mạnh?',
];

// ── Sign-in gate ─────────────────────────────────────────────────────────────
const SignInPrompt = ({ onTabChange }) => (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}>
            <Bot size={28} style={{ color: GOLD }} />
        </div>
        <div>
            <h3 className="text-xl font-bold mb-2" style={{ color: '#EDE8DA', fontFamily: "'Outfit', sans-serif" }}>
                Đăng nhập để dùng Trợ lý Đầu tư AI
            </h3>
            <p className="text-sm max-w-sm" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>
                Trợ lý AI phân tích tin tức và cổ phiếu dành cho thành viên Pro/Premium.
            </p>
        </div>
        <div className="flex gap-3">
            <button onClick={() => onTabChange('login')} className="px-6 py-2.5 rounded-full text-sm font-medium cursor-pointer"
                style={{ color: GOLD, background: 'transparent', border: `1px solid ${GOLD}35`, fontFamily: "'Outfit', sans-serif" }}>
                Đăng nhập
            </button>
            <button onClick={() => onTabChange('register')} className="px-6 py-2.5 rounded-full text-sm font-semibold cursor-pointer"
                style={{ color: '#0A1020', background: `linear-gradient(135deg, ${GOLD}, #E8C97A)`, border: 'none', fontFamily: "'Outfit', sans-serif" }}>
                Đăng ký miễn phí
            </button>
        </div>
    </div>
);

// ── Free-tier upgrade gate ───────────────────────────────────────────────────
const UpgradeGate = ({ onTabChange, user, claimProTrial }) => {
    const [claiming, setClaiming] = useState(false);
    const [msg, setMsg] = useState('');
    const canClaim = user && !user.pro_trial_claimed;

    const handleClaim = async () => {
        setClaiming(true);
        const res = await claimProTrial();
        if (res.success) {
            setMsg('Đã kích hoạt dùng thử! Đang tải lại…');
            setTimeout(() => window.location.reload(), 1200);
        } else {
            setMsg(res.error || 'Không thể kích hoạt dùng thử.');
            setClaiming(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}>
                <Lock size={24} style={{ color: GOLD }} />
            </div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase"
                style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}>
                Pro Feature
            </span>
            <h3 className="text-lg font-bold" style={{ color: '#EDE8DA', fontFamily: "'Outfit', sans-serif" }}>
                Trợ lý Đầu tư AI
            </h3>
            <p className="text-sm max-w-sm" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>
                Trò chuyện với AI để phân tích tin tức và cổ phiếu, dựa trên dữ liệu thị trường thực tế của DongAnh Capital.
                Gói Pro: 20 lượt/ngày · Premium: không giới hạn.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
                {canClaim && (
                    <button onClick={handleClaim} disabled={claiming}
                        className="w-full py-3 rounded-xl font-semibold text-sm cursor-pointer"
                        style={{ background: `linear-gradient(135deg, ${GOLD}, #E8C97A)`, color: '#0A1020', border: 'none', fontFamily: "'Outfit', sans-serif", opacity: claiming ? 0.7 : 1 }}>
                        {claiming ? 'Đang kích hoạt…' : 'Dùng thử Pro miễn phí 1 tuần'}
                    </button>
                )}
                {msg && <p className="text-xs" style={{ color: msg.includes('tải lại') ? '#4ade80' : '#f87171' }}>{msg}</p>}
                <button onClick={() => onTabChange('checkout', { plan: 'pro', period: 'monthly' })}
                    className="w-full py-2.5 rounded-xl font-medium text-sm cursor-pointer"
                    style={{ background: canClaim ? 'transparent' : `linear-gradient(135deg, ${GOLD}, #E8C97A)`, color: canClaim ? GOLD : '#0A1020', border: canClaim ? `1px solid ${GOLD}35` : 'none', fontFamily: "'Outfit', sans-serif" }}>
                    Nâng cấp Pro
                </button>
            </div>
        </div>
    );
};

// ── Message bubble ───────────────────────────────────────────────────────────
const Bubble = ({ role, content }) => {
    const isUser = role === 'user';
    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
                className="max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl text-[14px] leading-relaxed whitespace-pre-line"
                style={{
                    fontFamily: "'Outfit', sans-serif",
                    background: isUser ? 'rgba(201,169,110,0.14)' : SURFACE,
                    color: isUser ? '#EDE8DA' : '#EDE8DA',
                    border: isUser ? `1px solid ${GOLD}33` : '1px solid rgba(255,255,255,0.07)',
                    borderBottomRightRadius: isUser ? 4 : 16,
                    borderBottomLeftRadius: isUser ? 16 : 4,
                }}
            >
                {content}
            </div>
        </div>
    );
};

// ── Main tab ─────────────────────────────────────────────────────────────────
const ChatbotTab = ({ onTabChange }) => {
    const { user, isAuthenticated, authApi, claimProTrial, refreshUser } = useAuth();
    const isPro = user?.subscription_tier === 'pro' || user?.subscription_tier === 'premium';
    const isPremium = user?.subscription_tier === 'premium';

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [quota, setQuota] = useState(null); // { used, limit }

    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, sending]);

    // Load current quota for the chip (Pro only — Premium is unlimited).
    useEffect(() => {
        if (!isAuthenticated || !isPro || isPremium) return;
        let active = true;
        (async () => {
            try {
                const res = await authApi.get('/api/chat/quota');
                if (active) setQuota({ used: res.data?.used ?? 0, limit: res.data?.limit ?? null });
            } catch (err) {
                // Expired cached-Pro user gets 403 here — re-sync auth so the gate
                // flips to "upgrade" immediately rather than after the first send.
                if (active && err?.response?.status === 403) refreshUser();
                // other errors are non-fatal: the chip just won't show
            }
        })();
        return () => { active = false; };
    }, [isAuthenticated, isPro, isPremium, authApi]);

    const send = useCallback(async (text) => {
        const content = (text ?? input).trim();
        if (!content || sending) return;

        const prior = messages;   // snapshot for rollback if the send fails
        setMessages([...messages, { role: 'user', content }].slice(-MAX_HISTORY));
        setInput('');
        setSending(true);
        setError(null);

        try {
            const res = await authApi.post('/api/chat/message', { messages: [...prior, { role: 'user', content }].slice(-MAX_HISTORY) });
            const reply = res.data?.reply || '';
            setMessages((prev) => [...prev, { role: 'assistant', content: reply }].slice(-MAX_HISTORY));
            if (res.data?.quota) setQuota({ used: res.data.quota.used, limit: res.data.quota.limit });
        } catch (err) {
            const status = err.response?.status;
            // Roll back the optimistic user turn so a failed prompt is never carried
            // as hidden context on the next send; restore it to the input for retry —
            // but only if the user hasn't already started composing a new prompt.
            setMessages(prior);
            setInput((cur) => (cur ? cur : content));
            if (status === 429) {
                const d = err.response?.data?.detail;
                setError((d && d.message) || 'Bạn đã dùng hết lượt trò chuyện hôm nay. Nâng cấp Premium để dùng không giới hạn.');
                setQuota((q) => (q ? { ...q, used: q.limit ?? q.used } : q));
            } else if (status === 403) {
                // Subscription likely expired mid-session — re-sync auth so the
                // upgrade gate renders instead of leaving the chat enabled.
                setError('Phiên đăng ký đã thay đổi. Đang cập nhật…');
                await refreshUser();
            } else {
                setError('Trợ lý đang bận, vui lòng thử lại sau giây lát.');
            }
        } finally {
            setSending(false);
        }
    }, [input, sending, messages, authApi, refreshUser]);

    const onKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    };

    // ── Gates ────────────────────────────────────────────────────────────────
    if (!isAuthenticated) {
        return <div className="flex-1 w-full flex flex-col" style={{ background: '#000' }}><SignInPrompt onTabChange={onTabChange} /></div>;
    }
    if (!isPro) {
        return <div className="flex-1 w-full flex flex-col" style={{ background: '#000' }}><UpgradeGate onTabChange={onTabChange} user={user} claimProTrial={claimProTrial} /></div>;
    }

    const remaining = quota && quota.limit != null ? Math.max(quota.limit - quota.used, 0) : null;

    // ── Pro / Premium chat ───────────────────────────────────────────────────
    return (
        <div className="flex-1 w-full flex flex-col min-h-0" style={{ background: '#000' }}>
            {/* Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}>
                        <Bot size={18} style={{ color: GOLD }} />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-[15px] font-bold truncate" style={{ color: '#EDE8DA', fontFamily: "'Outfit', sans-serif" }}>Trợ lý Đầu tư AI</h2>
                        <p className="text-[11px] truncate" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>Phân tích tin tức &amp; cổ phiếu — dựa trên dữ liệu thị trường</p>
                    </div>
                </div>
                {isPremium ? (
                    <span className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30`, fontFamily: "'Outfit', sans-serif" }}>
                        Không giới hạn
                    </span>
                ) : remaining != null && (
                    <span className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,0.04)', color: remaining > 0 ? '#94A3BC' : '#E05555', border: '1px solid rgba(255,255,255,0.08)', fontFamily: "'DM Mono', monospace" }}>
                        Còn {remaining}/{quota.limit} hôm nay
                    </span>
                )}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
                <div className="max-w-3xl mx-auto flex flex-col gap-4">
                    {messages.length === 0 && !sending && (
                        <div className="flex flex-col items-center justify-center gap-5 py-12 text-center">
                            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}25` }}>
                                <Sparkles size={24} style={{ color: GOLD }} />
                            </div>
                            <p className="text-sm max-w-md" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>
                                Hỏi bất cứ điều gì về thị trường, một mã cổ phiếu, hay một tin tức gần đây.
                            </p>
                            <div className="flex flex-col gap-2 w-full max-w-md">
                                {SUGGESTIONS.map((s) => (
                                    <button key={s} onClick={() => send(s)}
                                        className="text-left px-4 py-2.5 rounded-xl text-[13px] cursor-pointer transition-colors"
                                        style={{ background: 'rgba(255,255,255,0.03)', color: '#EDE8DA', border: '1px solid rgba(255,255,255,0.07)', fontFamily: "'Outfit', sans-serif" }}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} />)}

                    {sending && (
                        <div className="flex justify-start">
                            <div className="px-4 py-3 rounded-2xl flex items-center gap-2" style={{ background: SURFACE, border: '1px solid rgba(255,255,255,0.07)', borderBottomLeftRadius: 4 }}>
                                <RefreshCw size={14} className="animate-spin" style={{ color: GOLD }} />
                                <span className="text-[13px]" style={{ color: '#94A3BC', fontFamily: "'Outfit', sans-serif" }}>Đang soạn câu trả lời…</span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex justify-center">
                            <p className="text-[13px] text-center px-4 py-2 rounded-xl" style={{ color: '#E05555', background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.2)', fontFamily: "'Outfit', sans-serif" }}>{error}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Composer */}
            <div className="shrink-0 px-4 sm:px-6 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="max-w-3xl mx-auto flex items-end gap-2">
                    <textarea
                        rows={1}
                        value={input}
                        maxLength={MAX_CHARS}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Nhập câu hỏi của bạn…"
                        className="flex-1 resize-none rounded-2xl px-4 py-3 text-[14px] focus:outline-none"
                        style={{ background: '#0C1828', color: '#EDE8DA', border: '1px solid rgba(255,255,255,0.08)', fontFamily: "'Outfit', sans-serif", maxHeight: 140 }}
                    />
                    <button
                        onClick={() => send()}
                        disabled={sending || !input.trim()}
                        aria-label="Gửi"
                        className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center cursor-pointer"
                        style={{ background: (sending || !input.trim()) ? 'rgba(201,169,110,0.25)' : `linear-gradient(135deg, ${GOLD}, #E8C97A)`, color: '#0A1020', border: 'none', opacity: (sending || !input.trim()) ? 0.6 : 1 }}
                    >
                        <Send size={17} />
                    </button>
                </div>
                <p className="max-w-3xl mx-auto mt-2 text-[11px]" style={{ color: '#4E617A', fontFamily: "'Outfit', sans-serif" }}>
                    Thông tin tham khảo, không phải khuyến nghị đầu tư. Đầu tư luôn có rủi ro.
                </p>
            </div>
        </div>
    );
};

export default ChatbotTab;
