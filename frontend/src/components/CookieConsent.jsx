import React, { useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import { readConsent, writeConsent } from '../utils/consent';

/**
 * Cookie notice.
 *
 * `position: fixed` keeps it out of document flow, so it causes zero layout
 * shift. There is deliberately no backdrop and no scroll lock: the platform
 * stays fully usable while the notice is visible, which is both better UX and
 * closer to what Vietnamese and EU guidance actually require (informed choice,
 * not a wall).
 */

const COPY = {
    vi: {
        text:
            'Chúng tôi chỉ dùng cookie cần thiết để đăng nhập hoạt động. Không có cookie quảng cáo và không theo dõi ' +
            'bạn giữa các website.',
        accept: 'Chấp nhận',
        necessary: 'Chỉ cookie cần thiết',
        more: 'Tìm hiểu thêm',
    },
    en: {
        text:
            'We use only the cookies required for sign-in to work. No advertising cookies, and no tracking across ' +
            'websites.',
        accept: 'Accept',
        necessary: 'Necessary only',
        more: 'Learn more',
    },
};

const CookieConsent = ({ onTabChange, activeTab }) => {
    // Lazy initialiser so the correct state is known in the first commit —
    // no flash of a banner that is about to be dismissed.
    const [open, setOpen] = useState(() => readConsent() === null);
    const { locale } = useLocale();
    const t = COPY[locale] || COPY.vi;

    if (!open) return null;
    // Don't cover the notice page the buttons link to.
    if (activeTab === 'cookies') return null;

    const decide = (analytics) => {
        writeConsent({ analytics });
        setOpen(false);
    };

    const btnBase = {
        padding: '7px 16px',
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: "'Outfit', sans-serif",
        whiteSpace: 'nowrap',
    };

    return (
        <div
            role="region"
            aria-label={locale === 'vi' ? 'Thông báo cookie' : 'Cookie notice'}
            className="fixed left-0 right-0 bottom-0 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
            style={{
                zIndex: 60,
                background: 'rgba(6,11,20,0.97)',
                borderTop: '1px solid rgba(201,169,110,0.2)',
                backdropFilter: 'blur(8px)',
                fontFamily: "'Outfit', sans-serif",
            }}
        >
            <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
                {t.text}{' '}
                <button
                    onClick={() => onTabChange && onTabChange('cookies')}
                    className="underline underline-offset-2 cursor-pointer"
                    style={{ background: 'none', border: 'none', color: 'var(--gold-primary)', font: 'inherit', padding: 0 }}
                >
                    {t.more}
                </button>
            </p>
            <div className="flex items-center gap-2 shrink-0">
                <button
                    onClick={() => decide(false)}
                    style={{
                        ...btnBase,
                        background: 'transparent',
                        border: '1px solid rgba(201,169,110,0.25)',
                        color: 'var(--text-muted)',
                    }}
                >
                    {t.necessary}
                </button>
                <button
                    onClick={() => decide(true)}
                    style={{
                        ...btnBase,
                        background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-bright, #E8C97A))',
                        border: 'none',
                        color: 'var(--bg-void)',
                    }}
                >
                    {t.accept}
                </button>
            </div>
        </div>
    );
};

export default CookieConsent;
