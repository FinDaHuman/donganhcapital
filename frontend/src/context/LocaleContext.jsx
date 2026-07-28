import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Language selection for the legal pages (and anything else that opts in).
 *
 * Deliberately ~40 lines of custom context rather than i18next: the only
 * bilingual content is whole-document legal prose with no interpolation and no
 * pluralisation, so none of i18next's machinery would earn its ~30 kB in the
 * entry chunk. If the whole app is ever translated, this becomes a thin wrapper
 * over `i18n.language` without any call site changing.
 *
 * Vietnamese is the default. The Vietnamese text is the legally operative
 * version for Vietnam, and it is what a Vietnamese regulator or user reads
 * first; English exists so foreign users can understand the same terms.
 */

export const LOCALES = ['vi', 'en'];
const STORAGE_KEY = 'dac_locale';

const detectLocale = () => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (LOCALES.includes(saved)) return saved;
    } catch {
        // Private mode / blocked storage — fall through to the default.
    }
    // Only a clearly non-Vietnamese browser tips us to English; anything
    // ambiguous stays on the Vietnamese default.
    try {
        const nav = (navigator.language || '').toLowerCase();
        if (nav && !nav.startsWith('vi')) return 'en';
    } catch {
        /* no navigator (SSR/tests) */
    }
    return 'vi';
};

const LocaleContext = createContext({ locale: 'vi', setLocale: () => {} });

export const LocaleProvider = ({ children }) => {
    // Lazy initialiser: resolved before the first paint, so the correct language
    // renders immediately instead of flashing the default and then switching.
    const [locale, setLocaleState] = useState(detectLocale);

    useEffect(() => {
        document.documentElement.lang = locale;
    }, [locale]);

    const setLocale = useCallback((next) => {
        if (!LOCALES.includes(next)) return;
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Not persisting is survivable; the session still switches.
        }
        setLocaleState(next);
    }, []);

    return (
        <LocaleContext.Provider value={{ locale, setLocale }}>
            {children}
        </LocaleContext.Provider>
    );
};

export const useLocale = () => useContext(LocaleContext);

export default LocaleContext;
