/**
 * In-app browser (embedded webview) detection + escape helpers.
 *
 * Why this exists
 * ---------------
 * Google refuses to render its OAuth consent screen inside an embedded webview
 * and returns the "disallowed_useragent" error ("This browser or app may not be
 * secure"). That webview is what Facebook, Messenger, Instagram, X, Zalo, etc.
 * use when a user taps a shared donganhcapital.com link. Email/password sign-in
 * is unaffected (it never touches Google) — which is exactly why only "Sign in
 * with Google" fails for users arriving from social apps, while direct/Google
 * traffic in a real browser works fine.
 *
 * Google's block is deliberate and cannot be disabled from our side. The only
 * working fix is to move the user into a real system browser (Chrome/Safari),
 * where the existing OAuth flow already works. These helpers detect the webview
 * and, only where reliable enough to attempt, hand the URL off via an Android
 * intent: URL. Many social webviews require manual "open in browser" handling.
 */

const UA = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';

// UA fragments that uniquely identify a known social app's in-app browser.
// These tokens only appear inside those apps' webviews, so a match is safe:
// standalone Chrome/Safari never carry them, so we won't false-flag real
// browsers (which would otherwise break Google sign-in for everyone).
//
// Some hosts, especially Meta apps, show their own "Can not load page" screen
// when a page navigates to an intent:// URL. Mark those as manual so the UI
// leads with copy/open-menu instructions instead of a broken automatic handoff.
const NAMED_APPS = [
    // Messenger is checked before Facebook: its UA also carries the FBAN token,
    // so the more specific Messenger/Orca match must win for an accurate label.
    { re: /Messenger|MessengerForiOS|Orca-Android/i, label: 'Messenger', manualOpen: true },
    { re: /FBAN|FBAV|FB_IAB|FB4A|FBIOS/i, label: 'Facebook', manualOpen: true },
    { re: /Instagram/i, label: 'Instagram', manualOpen: true },
    { re: /Twitter|TwitterAndroid/i, label: 'X', manualOpen: true },
    { re: /\bZalo\b/i, label: 'Zalo', manualOpen: true },
    { re: /\bLine\//i, label: 'Line', manualOpen: true },
    { re: /TikTok|musical_ly|BytedanceWebview/i, label: 'TikTok', manualOpen: true },
    { re: /LinkedInApp/i, label: 'LinkedIn', manualOpen: true },
    { re: /Snapchat/i, label: 'Snapchat', manualOpen: true },
];

/**
 * Detect whether the page is running inside an embedded in-app browser.
 * @returns {{ isInApp: boolean, label: string|null, manualOpen: boolean }}
 *          label names the host app when known (e.g. "Facebook"), or a generic
 *          label otherwise. manualOpen means the app is known to be unreliable
 *          for automatic intent:// handoff and should show user instructions.
 */
export function detectInAppBrowser(ua = UA) {
    for (const app of NAMED_APPS) {
        if (app.re.test(ua)) {
            return {
                isInApp: true,
                label: app.label,
                manualOpen: Boolean(app.manualOpen),
            };
        }
    }
    // Generic Android WebView marker. Standalone browsers (Chrome, Firefox,
    // Samsung Internet, Edge) do NOT carry "; wv)", so this is a reliable
    // embedded-webview signal without false-flagging real browsers.
    if (/\bwv\b/.test(ua) && /Android/i.test(ua)) {
        return { isInApp: true, label: 'in-app browser', manualOpen: false };
    }
    return { isInApp: false, label: null, manualOpen: false };
}

/** @returns {'ios'|'android'|'other'} */
export function getMobileOS(ua = UA) {
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'other';
}

export function buildAndroidIntentUrl(url) {
    const base = typeof window !== 'undefined'
        ? window.location.href
        : 'https://donganhcapital.com/';
    const target = new URL(url, base);
    const scheme = target.protocol.replace(':', '') || 'https';
    const path = `${target.host}${target.pathname}${target.search}`;

    return [
        `intent://${path}#Intent`,
        `scheme=${scheme}`,
        'action=android.intent.action.VIEW',
        'category=android.intent.category.BROWSABLE',
        `S.browser_fallback_url=${encodeURIComponent(target.href)}`,
        'end',
    ].join(';');
}

/**
 * Build the Android intent: URL for escaping `url` into the system browser,
 * or null when no reliable programmatic escape exists.
 *
 * Returns null on iOS/other (webviews offer no reliable escape) and for social
 * webviews marked `manualOpen` (e.g. Meta apps break intent:// handoff). In
 * those cases the caller should surface manual "open in browser" instructions.
 * The intent uses ACTION_VIEW without pinning a package, so the OS opens the
 * user's default browser; `S.browser_fallback_url` covers webviews that can't
 * handle the intent.
 */
export function getSystemBrowserUrl(url, ua = UA) {
    const detected = detectInAppBrowser(ua);
    if (getMobileOS(ua) !== 'android' || detected.manualOpen) return null;
    return buildAndroidIntentUrl(url);
}
