/**
 * Lazy registry for legal documents.
 *
 * Each entry is a dynamic import, so Vite emits one small async chunk per
 * document per language and none of them touch the entry bundle. Only the
 * document actually being viewed is downloaded.
 */

const LOADERS = {
    terms: {
        vi: () => import('./vi/terms.js'),
        en: () => import('./en/terms.js'),
    },
    privacy: {
        vi: () => import('./vi/privacy.js'),
        en: () => import('./en/privacy.js'),
    },
    disclaimer: {
        vi: () => import('./vi/disclaimer.js'),
        en: () => import('./en/disclaimer.js'),
    },
    cookies: {
        vi: () => import('./vi/cookies.js'),
        en: () => import('./en/cookies.js'),
    },
    about: {
        vi: () => import('./vi/about.js'),
        en: () => import('./en/about.js'),
    },
    contact: {
        vi: () => import('./vi/contact.js'),
        en: () => import('./en/contact.js'),
    },
};

/**
 * Resolve a legal document. Falls back to Vietnamese if a translation is
 * missing — Vietnamese is the operative version, so it is the safe default,
 * and a missing English file must never blank the page.
 *
 * @returns {Promise<object|null>} the document, or null if the slug is unknown.
 */
export async function loadLegalDoc(slug, locale) {
    const entry = LOADERS[slug];
    if (!entry) return null;
    const load = entry[locale] || entry.vi;
    const mod = await load();
    return mod.default ?? null;
}

export default loadLegalDoc;
