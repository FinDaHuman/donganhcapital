import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { LEGAL_VERSIONS } from '../legal/versions';

/**
 * Asks an existing user to accept the current Terms and Privacy Policy.
 *
 * Shown when `/api/auth/me` reports `needs_reconsent` — either because the
 * documents changed, or because the account predates consent capture entirely
 * (every account created before this feature is backfilled with a deliberately
 * stale version so it lands here).
 *
 * Rendered only over the gated product tabs, never over the legal pages
 * themselves: a user asked to accept the terms must be able to go and read them.
 */

const COPY = {
    vi: {
        title: 'Cập nhật điều khoản',
        body: 'Chúng tôi đã cập nhật Điều khoản sử dụng và Chính sách bảo mật. Vui lòng đọc và xác nhận để tiếp tục sử dụng nền tảng.',
        readTerms: 'Đọc Điều khoản sử dụng',
        readPrivacy: 'Đọc Chính sách bảo mật',
        agree: 'Tôi đã đọc và đồng ý với Điều khoản sử dụng và Chính sách bảo mật',
        accept: 'Xác nhận',
        saving: 'Đang lưu…',
        later: 'Để sau',
        error: 'Không lưu được. Vui lòng thử lại.',
    },
    en: {
        title: 'Updated terms',
        body: 'We have updated our Terms of Use and Privacy Policy. Please read and confirm to continue using the platform.',
        readTerms: 'Read the Terms of Use',
        readPrivacy: 'Read the Privacy Policy',
        agree: 'I have read and agree to the Terms of Use and the Privacy Policy',
        accept: 'Confirm',
        saving: 'Saving…',
        later: 'Later',
        error: 'Could not save. Please try again.',
    },
};

const ReconsentModal = ({ onTabChange }) => {
    const { authApi, refreshUser } = useAuth();
    const { locale } = useLocale();
    const [agreed, setAgreed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [dismissed, setDismissed] = useState(false);

    const t = COPY[locale] || COPY.vi;

    if (dismissed) return null;

    const submit = async () => {
        if (!agreed || saving) return;
        setSaving(true);
        setError('');
        try {
            await authApi.post('/api/auth/consent', {
                accepted_terms: true,
                accepted_privacy: true,
                terms_version: LEGAL_VERSIONS.terms,
                privacy_version: LEGAL_VERSIONS.privacy,
            });
            await refreshUser();
        } catch {
            setError(t.error);
            setSaving(false);
        }
    };

    const openDoc = (slug) => {
        // Dismiss rather than stack over the legal page — the user is going to
        // read; the prompt returns next time they open a product tab.
        setDismissed(true);
        onTabChange && onTabChange(slug);
    };

    return (
        <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: 70, background: 'rgba(6,11,20,0.8)', backdropFilter: 'blur(4px)' }}
            role="dialog"
            aria-modal="true"
            aria-label={t.title}
        >
            <div
                className="w-full max-w-md rounded-2xl p-6"
                style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid rgba(201,169,110,0.25)',
                    fontFamily: "'Outfit', sans-serif",
                }}
            >
                <div className="flex items-center gap-3 mb-4">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.25)' }}
                    >
                        <AlertTriangle size={18} style={{ color: 'var(--gold-primary)' }} />
                    </div>
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{t.title}</h2>
                </div>

                <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>{t.body}</p>

                <div className="flex flex-col gap-2 mb-4 text-sm">
                    <button
                        onClick={() => openDoc('terms')}
                        className="text-left underline underline-offset-2 cursor-pointer"
                        style={{ background: 'none', border: 'none', color: 'var(--gold-primary)', padding: 0, font: 'inherit' }}
                    >
                        {t.readTerms} →
                    </button>
                    <button
                        onClick={() => openDoc('privacy')}
                        className="text-left underline underline-offset-2 cursor-pointer"
                        style={{ background: 'none', border: 'none', color: 'var(--gold-primary)', padding: 0, font: 'inherit' }}
                    >
                        {t.readPrivacy} →
                    </button>
                </div>

                <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                        className="mt-0.5 cursor-pointer"
                        style={{ accentColor: 'var(--gold-primary)' }}
                    />
                    <span className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{t.agree}</span>
                </label>

                {error && <p className="text-xs mb-3" style={{ color: '#ef4444' }}>{error}</p>}

                <div className="flex items-center gap-3">
                    <button
                        onClick={submit}
                        disabled={!agreed || saving}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-opacity"
                        style={{
                            background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-bright, #E8C97A))',
                            color: 'var(--bg-void)',
                            border: 'none',
                            opacity: !agreed || saving ? 0.5 : 1,
                            cursor: !agreed || saving ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {saving ? t.saving : t.accept}
                    </button>
                    <button
                        onClick={() => setDismissed(true)}
                        className="px-4 py-2.5 rounded-xl text-sm cursor-pointer"
                        style={{ background: 'transparent', border: '1px solid rgba(201,169,110,0.2)', color: 'var(--text-muted)' }}
                    >
                        {t.later}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReconsentModal;
