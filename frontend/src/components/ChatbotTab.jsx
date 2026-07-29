import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Bot, Send, RotateCcw } from 'lucide-react';
import { StarMark } from './StarMark';
import RichText from './RichText';

/* ── Constants ──────────────────────────────────────────────────────────────── */
const MAX_HISTORY = 12;   // turns kept client-side & forwarded to the backend
const MAX_CHARS = 2000;
const SEND_TIMEOUT = 30_000;
const COLD_START_TIMEOUT = 55_000; // first chat can include Render cold start

const SUGGESTIONS = [
    'Phân tích triển vọng cổ phiếu FPT',
    'Thị trường ngân hàng đang có gì đáng chú ý?',
    'Nên lưu ý gì khi VNINDEX biến động mạnh?',
];

/* ── Animation variants ─────────────────────────────────────────────────────── */
const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const bubbleVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.97 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

/* ── Stable message ID generator ────────────────────────────────────────────── */
let _msgIdCounter = 0;
const nextMsgId = () => `msg-${++_msgIdCounter}-${Date.now()}`;

/* ── Message bubble ───────────────────────────────────────────────────────── */
const Bubble = ({ role, content }) => {
    const isUser = role === 'user';
    return (
        <motion.div
            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            variants={bubbleVariants} initial="hidden" animate="visible"
        >
            <div className={isUser ? 'chat-bubble-user' : 'chat-bubble-ai'}>
                {isUser ? <span className="whitespace-pre-line">{content}</span> : <RichText text={content} />}
            </div>
        </motion.div>
    );
};

/* ── Flanking gold label (section label motif) ────────────────────────────── */
const FlankLabel = ({ children }) => (
    <div className="flex items-center justify-center gap-4">
        <div style={{ height: 1, flex: '0 0 40px', background: 'linear-gradient(to right, transparent, var(--gold-primary))' }} />
        <span style={{
            fontFamily: "'Outfit', sans-serif", fontSize: 10, fontWeight: 600,
            letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold-primary)', whiteSpace: 'nowrap',
        }}>
            {children}
        </span>
        <div style={{ height: 1, flex: '0 0 40px', background: 'linear-gradient(to left, transparent, var(--gold-primary))' }} />
    </div>
);

/* ── Auto-resizing textarea hook ──────────────────────────────────────────── */
const useAutoResize = (value) => {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, [value]);
    return ref;
};

/* ── Main tab ─────────────────────────────────────────────────────────────── */
const ChatbotTab = ({ onTabChange }) => {
    const { authApi, refreshUser } = useAuth();
    // App.jsx has already established a signed-in, verified session, and there
    // are no paid tiers any more — so there is nothing left to gate on here.
    // The daily message quota is whatever the server reports; the client no
    // longer tries to predict it from a subscription tier.

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    // false only when the backend says the failure is a configuration
    // problem — retrying that can never succeed, so we stop implying it might.
    const [retryable, setRetryable] = useState(true);
    const [quota, setQuota] = useState(null); // { used, limit }

    const scrollRef = useRef(null);
    const textareaRef = useAutoResize(input);
    const hasSentRef = useRef(false); // tracks if at least one message succeeded (cold-start heuristic)

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, sending]);

    // Load the current quota for the chip. A null limit means unlimited.
    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const res = await authApi.get('/api/chat/quota');
                if (active) setQuota({ used: res.data?.used ?? 0, limit: res.data?.limit ?? null });
            } catch (err) {
                // A 403 means the session no longer qualifies — re-sync auth so the
                // gate reacts immediately rather than after the first send.
                if (active && err?.response?.status === 403) refreshUser();
                // other errors are non-fatal: the chip just won't show
            }
        })();
        return () => { active = false; };
    }, [authApi, refreshUser]);

    // Use a ref for messages to avoid re-creating `send` on every message change
    const messagesRef = useRef(messages);
    messagesRef.current = messages;

    const send = useCallback(async (text) => {
        const content = (text ?? input).trim();
        if (!content || sending) return;

        const prior = messagesRef.current; // snapshot for rollback
        const userMsg = { id: nextMsgId(), role: 'user', content };
        setMessages([...prior, userMsg].slice(-MAX_HISTORY));
        setInput('');
        setSending(true);
        setError(null);
        setRetryable(true);

        // First chat can include Render cold start. Do not retry POSTs here:
        // chat sends consume quota and call Gemini, so duplicate requests are costly.
        const isFirstRequest = !hasSentRef.current;
        const timeout = isFirstRequest ? COLD_START_TIMEOUT : SEND_TIMEOUT;

        try {
            const res = await authApi.post(
                '/api/chat/message',
                { messages: [...prior, { role: 'user', content }].slice(-MAX_HISTORY) },
                { timeout },
            );
            const reply = res.data?.reply || '';
            const assistantMsg = { id: nextMsgId(), role: 'assistant', content: reply };
            setMessages((prev) => [...prev, assistantMsg].slice(-MAX_HISTORY));
            if (res.data?.quota) setQuota({ used: res.data.quota.used, limit: res.data.quota.limit });
            hasSentRef.current = true;
        } catch (err) {
            const status = err.response?.status;
            const isTimeout = err.code === 'ECONNABORTED';

            // Roll back the optimistic user turn so a failed prompt is never carried
            // as hidden context on the next send; restore it to the input for retry.
            setMessages(prior);
            setInput((cur) => (cur ? cur : content));
            if (status === 429) {
                const d = err.response?.data?.detail;
                setError((d && d.message)
                    || 'Bạn đã dùng hết lượt trò chuyện hôm nay. Vui lòng quay lại vào ngày mai.');
                setQuota((q) => (q ? { ...q, used: q.limit ?? q.used } : q));
            } else if (status === 403) {
                // Subscription likely expired mid-session — re-sync auth
                setError('Phiên đăng ký đã thay đổi. Đang cập nhật…');
                await refreshUser();
            } else if (isTimeout) {
                setError(isFirstRequest
                    ? 'Server có thể vẫn đang khởi động. Vui lòng thử lại sau giây lát.'
                    : 'Server phản hồi quá lâu. Vui lòng thử lại.');
            } else {
                // The backend distinguishes a busy/throttled model from a broken
                // configuration. Surfacing that matters: telling someone to retry
                // a request that can never succeed is how a dead API key stayed
                // invisible in production for days.
                const d = err.response?.data?.detail;
                setError((d && d.message) || 'Trợ lý đang bận, vui lòng thử lại sau giây lát.');
                setRetryable(d?.retryable !== false);
            }
        } finally {
            setSending(false);
        }
    }, [input, sending, authApi, refreshUser]);

    const clearChat = useCallback(() => {
        setMessages([]);
        setError(null);
        setRetryable(true);
    }, []);

    const onKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    };

    const remaining = quota && quota.limit != null ? Math.max(quota.limit - quota.used, 0) : null;

    // ── Pro / Premium chat ───────────────────────────────────────────────────
    return (
        <div className="flex-1 w-full flex flex-col min-h-0" style={{ background: 'var(--bg-base)' }}>
            {/* Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 flex items-center justify-between gap-3 chat-divider-bottom">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'var(--gold-dim)', border: '1px solid rgba(201,169,110,0.2)' }}>
                        <Bot size={18} style={{ color: 'var(--gold-primary)' }} />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-[15px] font-bold truncate" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                            Trợ lý Đầu tư AI
                        </h2>
                        <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif" }}>
                            Phân tích tin tức &amp; cổ phiếu — dựa trên dữ liệu thị trường
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* New Chat button */}
                    {messages.length > 0 && (
                        <button onClick={clearChat} aria-label="Cuộc trò chuyện mới" className="chat-icon-btn">
                            <RotateCcw size={14} />
                        </button>
                    )}

                    {/* Daily quota badge — hidden when the server reports no limit */}
                    {remaining != null && (
                        <span className="chat-quota-badge" style={{ color: remaining > 0 ? 'var(--text-secondary)' : 'var(--error)' }}>
                            Còn <span className="chat-quota-value">{remaining}/{quota.limit}</span> hôm nay
                        </span>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
                <div className="max-w-3xl mx-auto flex flex-col gap-4">

                    {/* Empty state */}
                    {messages.length === 0 && !sending && (
                        <motion.div
                            className="flex flex-col items-center justify-center gap-5 py-12 text-center"
                            variants={containerVariants} initial="hidden" animate="visible"
                        >
                            <motion.div variants={itemVariants}>
                                <FlankLabel>Trợ lý Đầu tư AI</FlankLabel>
                            </motion.div>
                            <motion.div variants={itemVariants}
                                className="w-14 h-14 rounded-full flex items-center justify-center"
                                style={{
                                    background: 'var(--gold-dim)',
                                    border: '1px solid rgba(201,169,110,0.2)',
                                    boxShadow: '0 0 30px -8px rgba(201,169,110,0.2)',
                                }}
                            >
                                <StarMark size={24} color="var(--gold-primary)" />
                            </motion.div>
                            <motion.p variants={itemVariants} className="text-sm max-w-md" style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif" }}>
                                Hỏi bất cứ điều gì về thị trường, một mã cổ phiếu, hay một tin tức gần đây.
                            </motion.p>
                            <motion.div variants={itemVariants} className="flex flex-col gap-2 w-full max-w-md">
                                {SUGGESTIONS.map((s) => (
                                    <button key={s} onClick={() => send(s)} className="chat-suggestion">
                                        {s}
                                    </button>
                                ))}
                            </motion.div>
                        </motion.div>
                    )}

                    {/* Message list */}
                    <AnimatePresence mode="popLayout">
                        {messages.map((m) => <Bubble key={m.id} role={m.role} content={m.content} />)}
                    </AnimatePresence>

                    {/* Typing indicator */}
                    <AnimatePresence>
                        {sending && (
                            <motion.div
                                className="flex justify-start"
                                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                aria-live="polite" aria-label="AI đang soạn câu trả lời"
                            >
                                <div className="chat-typing">
                                    <StarMark size={14} color="var(--gold-primary)" className="star-spin" />
                                    <span className="text-[13px]" style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif" }}>
                                        Đang soạn câu trả lời…
                                    </span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Error */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                className="flex justify-center"
                                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            >
                                <p className="chat-error" style={!retryable ? { opacity: 0.95 } : undefined}>
                                    {error}
                                    {!retryable && (
                                        <span style={{ display: 'block', marginTop: 4, opacity: 0.75, fontSize: '0.9em' }}>
                                            Thử lại sẽ không khắc phục được sự cố này.
                                        </span>
                                    )}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Composer */}
            <div className="shrink-0 px-4 sm:px-6 py-4 chat-divider-top">
                <div className="max-w-3xl mx-auto flex items-end gap-2">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={input}
                        maxLength={MAX_CHARS}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Nhập câu hỏi của bạn…"
                        className="chat-input flex-1"
                        style={{ maxHeight: 140 }}
                    />
                    <button
                        onClick={() => send()}
                        // Blocked outright when the backend reported a configuration
                        // failure: every further send would burn a Gemini call and
                        // fail identically.
                        disabled={sending || !input.trim() || !retryable}
                        aria-label="Gửi"
                        className="chat-send-btn"
                    >
                        <Send size={17} />
                    </button>
                </div>
                <p className="max-w-3xl mx-auto mt-2 text-[11px]" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
                    Thông tin tham khảo, không phải khuyến nghị đầu tư. Đầu tư luôn có rủi ro.
                </p>
            </div>
        </div>
    );
};

export default ChatbotTab;
