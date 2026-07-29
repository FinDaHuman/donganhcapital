import React, { useEffect, useState } from 'react';
import {
    ArrowLeft, FileText, Shield, AlertTriangle, Cookie, Building2, Mail,
} from 'lucide-react';
import { useLocale } from '../context/LocaleContext';
import { loadLegalDoc } from '../legal';
import { legalLabel } from '../legal/routes';

/**
 * One component renders all six legal pages, so they cannot drift apart and the
 * VI/EN toggle lives in exactly one place.
 *
 * The visual treatment is carried over verbatim from the original
 * TermsOfServicePage: gold radial gradient behind the header, max-w-3xl column,
 * back button, icon chip, spaced section list.
 */

const ICONS = {
    terms: FileText,
    privacy: Shield,
    disclaimer: AlertTriangle,
    cookies: Cookie,
    about: Building2,
    contact: Mail,
};

const DESCRIPTIONS = {
    terms: 'Terms of use for DongAnh Capital — a free, non-commercial market research tool.',
    privacy: 'How DongAnh Capital collects, uses and protects your personal data.',
    disclaimer: 'DongAnh Capital is not a licensed investment advisory service. Model outputs are not recommendations.',
    cookies: 'The cookies DongAnh Capital uses, and why.',
    about: 'DongAnh Capital is a non-commercial academic research project on machine learning and Vietnamese equities.',
    contact: 'How to reach DongAnh Capital, and how complaints and data requests are handled.',
};

const BACK_LABEL = {
    vi: { register: 'Quay lại đăng ký', home: 'Quay lại trang chủ' },
    en: { register: 'Back to Sign Up', home: 'Back to Home' },
};

/** Update <title>, meta description and canonical for this slug. */
const useDocumentHead = (slug, title) => {
    useEffect(() => {
        if (!title) return;
        const previous = document.title;
        document.title = `${title} — DongAnh Capital`;

        const setMeta = (selector, attr, value) => {
            const el = document.head.querySelector(selector);
            if (el) el.setAttribute(attr, value);
            return el?.getAttribute(attr);
        };
        const prevDesc = setMeta('meta[name="description"]', 'content', DESCRIPTIONS[slug] || '');
        const prevCanonical = setMeta('link[rel="canonical"]', 'href', `https://www.donganhcapital.com/${slug}`);

        return () => {
            document.title = previous;
            if (prevDesc != null) setMeta('meta[name="description"]', 'content', prevDesc);
            if (prevCanonical != null) setMeta('link[rel="canonical"]', 'href', prevCanonical);
        };
    }, [slug, title]);
};

const LocaleToggle = ({ locale, setLocale }) => (
    <div
        className="flex items-center rounded-lg overflow-hidden shrink-0"
        style={{ border: '1px solid rgba(201,169,110,0.25)' }}
    >
        {[
            { code: 'vi', label: 'VN' },
            { code: 'en', label: 'EN' },
        ].map(({ code, label }) => {
            const active = locale === code;
            return (
                <button
                    key={code}
                    type="button"
                    onClick={() => setLocale(code)}
                    aria-pressed={active}
                    aria-label={code === 'vi' ? 'Tiếng Việt' : 'English'}
                    className="px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
                    style={{
                        background: active ? 'rgba(201,169,110,0.15)' : 'transparent',
                        color: active ? 'var(--gold-primary)' : 'var(--text-muted)',
                        border: 'none',
                        fontFamily: "'Outfit', sans-serif",
                        letterSpacing: '0.06em',
                    }}
                >
                    {label}
                </button>
            );
        })}
    </div>
);

const Section = ({ section }) => (
    <section>
        <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            {section.heading}
        </h2>
        {section.body?.map((paragraph, i) => (
            <p key={i} className={i > 0 ? 'mt-3' : undefined}>{paragraph}</p>
        ))}
        {section.list && (
            <ul className="list-disc pl-5 mt-3 space-y-1.5">
                {section.list.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
        )}
        {section.note && (
            <p
                className="mt-4 px-4 py-3 rounded-xl text-xs leading-relaxed"
                style={{
                    background: 'rgba(201,169,110,0.06)',
                    border: '1px solid rgba(201,169,110,0.18)',
                    color: 'var(--text-secondary)',
                }}
            >
                {section.note}
            </p>
        )}
        {section.email && (
            <p className="mt-3 font-medium" style={{ color: 'var(--gold-primary)' }}>{section.email}</p>
        )}
    </section>
);

const LegalPage = ({ slug, onTabChange, returnTo = 'home' }) => {
    const { locale, setLocale } = useLocale();
    const [doc, setDoc] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [slug]);

    useEffect(() => {
        let alive = true;
        setFailed(false);
        loadLegalDoc(slug, locale)
            .then((loaded) => {
                if (!alive) return;
                if (loaded) setDoc(loaded);
                else setFailed(true);
            })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [slug, locale]);

    useDocumentHead(slug, doc?.title);

    const Icon = ICONS[slug] || FileText;
    const back = BACK_LABEL[locale] || BACK_LABEL.vi;
    const backLabel = returnTo === 'register' ? back.register : back.home;

    return (
        <div
            className="w-full min-h-screen py-12 px-4 relative"
            style={{ backgroundColor: 'var(--bg-void)', fontFamily: "'Outfit', sans-serif" }}
        >
            <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] z-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse at 50% 0%, rgba(201,169,110,0.06) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
            />

            <div className="max-w-3xl mx-auto relative z-10">
                <div className="flex items-center justify-between gap-4 mb-8">
                    <button
                        onClick={() => onTabChange && onTabChange(returnTo)}
                        className="flex items-center gap-2 text-sm cursor-pointer transition-colors"
                        style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
                    >
                        <ArrowLeft size={16} /> {backLabel}
                    </button>
                    <LocaleToggle locale={locale} setLocale={setLocale} />
                </div>

                <div className="mb-10 flex items-center gap-4">
                    <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.25)' }}
                    >
                        <Icon size={24} style={{ color: 'var(--gold-primary)' }} />
                    </div>
                    <div>
                        <h1
                            className="text-3xl font-bold"
                            style={{ color: 'var(--text-primary)', fontFamily: "'Cormorant Garamond', serif" }}
                        >
                            {doc?.title || legalLabel(slug, locale)}
                        </h1>
                        {doc?.updated && (
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                {locale === 'vi' ? 'Cập nhật lần cuối' : 'Last updated'}: {doc.updated}
                                {doc.version ? ` · v${doc.version}` : ''}
                            </p>
                        )}
                    </div>
                </div>

                {failed && (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        {locale === 'vi'
                            ? 'Không tải được nội dung. Vui lòng thử lại hoặc liên hệ support@donganhcapital.com.'
                            : 'This content could not be loaded. Please try again or contact support@donganhcapital.com.'}
                    </p>
                )}

                {!doc && !failed && (
                    <div className="space-y-4" aria-busy="true">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-20 rounded-xl animate-pulse"
                                style={{ background: 'rgba(255,255,255,0.03)' }}
                            />
                        ))}
                    </div>
                )}

                {doc && (
                    <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {doc.lead && (
                            <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                {doc.lead}
                            </p>
                        )}
                        {doc.sections?.map((section, i) => <Section key={i} section={section} />)}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LegalPage;
