import React from 'react';
import { useLocale } from '../context/LocaleContext';
import { LEGAL_LINKS } from '../legal/routes';
import { COMPANY } from '../legal/company';

/**
 * The footer for every route except the landing page (which keeps its own
 * richer FooterSection). Before this existed, the legal links were reachable
 * only from the landing page — every other screen had no footer at all.
 *
 * Two modes:
 *   compact — a slim bar for the product tabs, whose panes are full-viewport
 *             `flex-1 … overflow-hidden` layouts that a tall footer would visibly
 *             squeeze. 36px is imperceptible; 200px is not.
 *   full    — used on the chrome-less pages (auth, profile, legal), where there
 *             is normal page flow and the identity block matters most.
 */

const COPY = {
    vi: {
        notAdvice: 'Không phải khuyến nghị đầu tư',
        disclaimerFull:
            'DongAnh Capital là dự án nghiên cứu học thuật phi thương mại. Chúng tôi không phải công ty chứng khoán và ' +
            'không có giấy phép của UBCKNN. Mọi nội dung chỉ mang tính tham khảo, không phải khuyến nghị đầu tư. ' +
            'Đầu tư chứng khoán có rủi ro mất vốn.',
        rights: 'Bảo lưu mọi quyền.',
    },
    en: {
        notAdvice: 'Not investment advice',
        disclaimerFull:
            'DongAnh Capital is a non-commercial academic research project. We are not a securities company and hold no ' +
            'licence from the State Securities Commission of Vietnam. Everything here is informational only, not ' +
            'investment advice. Investing carries the risk of capital loss.',
        rights: 'All rights reserved.',
    },
};

const LinkButton = ({ slug, label, onTabChange, style }) => (
    <a
        href={`/${slug}`}
        onClick={(e) => {
            e.preventDefault();
            onTabChange && onTabChange(slug);
        }}
        className="transition-colors hover:opacity-80"
        style={{ color: 'var(--text-muted)', textDecoration: 'none', ...style }}
    >
        {label}
    </a>
);

const LegalFooter = ({ onTabChange, compact = false }) => {
    const { locale, setLocale } = useLocale();
    const t = COPY[locale] || COPY.vi;
    const year = new Date().getFullYear();

    if (compact) {
        // The bar still scrolls if a locale's labels overrun it, but the
        // scrollbar chrome is hidden — on a 412px screen the visible track read
        // as the page itself being cut off. The notAdvice label drops below sm
        // to buy the links room; the Disclaimer link carries the same message.
        return (
            <footer
                className="w-full shrink-0 flex items-center justify-between gap-4 px-4 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{
                    height: 36,
                    background: '#060B14',
                    borderTop: '1px solid rgba(201,169,110,0.1)',
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: 11,
                }}
            >
                <span className="hidden sm:inline" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {t.notAdvice}
                </span>
                <nav className="flex items-center gap-3 sm:gap-4" style={{ whiteSpace: 'nowrap' }}>
                    {LEGAL_LINKS.map(({ slug, vi, en }) => (
                        <LinkButton
                            key={slug}
                            slug={slug}
                            label={locale === 'vi' ? vi : en}
                            onTabChange={onTabChange}
                        />
                    ))}
                </nav>
            </footer>
        );
    }

    return (
        <footer
            className="w-full shrink-0 px-4 py-8"
            style={{
                background: '#060B14',
                borderTop: '1px solid rgba(201,169,110,0.1)',
                fontFamily: "'Outfit', sans-serif",
            }}
        >
            <div className="max-w-5xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-6">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                            {COMPANY.tradingName}
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                            {locale === 'vi' ? COMPANY.natureVi : COMPANY.natureEn}
                            <br />
                            {locale === 'vi' ? COMPANY.locationVi : COMPANY.locationEn}
                            <br />
                            <a href={`mailto:${COMPANY.email}`} style={{ color: 'var(--gold-primary)', textDecoration: 'none' }}>
                                {COMPANY.email}
                            </a>
                        </p>
                    </div>

                    <div className="flex flex-col items-start sm:items-end gap-3">
                        <div
                            className="flex items-center rounded-lg overflow-hidden"
                            style={{ border: '1px solid rgba(201,169,110,0.25)' }}
                        >
                            {[{ code: 'vi', label: 'VN' }, { code: 'en', label: 'EN' }].map(({ code, label }) => (
                                <button
                                    key={code}
                                    type="button"
                                    onClick={() => setLocale(code)}
                                    aria-pressed={locale === code}
                                    aria-label={code === 'vi' ? 'Tiếng Việt' : 'English'}
                                    className="px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors"
                                    style={{
                                        background: locale === code ? 'rgba(201,169,110,0.15)' : 'transparent',
                                        color: locale === code ? 'var(--gold-primary)' : 'var(--text-muted)',
                                        border: 'none',
                                        fontFamily: "'Outfit', sans-serif",
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <nav className="flex flex-wrap gap-x-4 gap-y-1.5 sm:justify-end" style={{ fontSize: 12 }}>
                            {LEGAL_LINKS.map(({ slug, vi, en }) => (
                                <LinkButton
                                    key={slug}
                                    slug={slug}
                                    label={locale === 'vi' ? vi : en}
                                    onTabChange={onTabChange}
                                />
                            ))}
                        </nav>
                    </div>
                </div>

                <p
                    className="text-xs leading-relaxed pt-5"
                    style={{ color: 'var(--text-muted)', borderTop: '1px solid rgba(201,169,110,0.08)' }}
                >
                    {t.disclaimerFull}
                </p>
                <p className="text-xs mt-3" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                    © {year} {COMPANY.tradingName}. {t.rights}
                </p>
            </div>
        </footer>
    );
};

export default LegalFooter;
