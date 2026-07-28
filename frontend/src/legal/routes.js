/**
 * The legal route table. `LEGAL_TABS` is spread into `KNOWN_TABS` in App.jsx and
 * is also what drives the footer link list and the chrome-less page set — so a
 * page added here is wired everywhere at once and cannot fall out of sync.
 */

/** Ordered — this is the render order in the footer. */
export const LEGAL_LINKS = [
    { slug: 'terms', vi: 'Điều khoản sử dụng', en: 'Terms of Use' },
    { slug: 'privacy', vi: 'Chính sách bảo mật', en: 'Privacy Policy' },
    { slug: 'disclaimer', vi: 'Miễn trừ trách nhiệm', en: 'Disclaimer' },
    { slug: 'cookies', vi: 'Chính sách cookie', en: 'Cookie Policy' },
    { slug: 'about', vi: 'Về dự án', en: 'About' },
    { slug: 'contact', vi: 'Liên hệ', en: 'Contact' },
];

export const LEGAL_TABS = new Set(LEGAL_LINKS.map((l) => l.slug));

/** Localised label for a slug, used by the footer and by LegalPage's <title>. */
export const legalLabel = (slug, locale) =>
    LEGAL_LINKS.find((l) => l.slug === slug)?.[locale === 'vi' ? 'vi' : 'en'] ?? slug;
