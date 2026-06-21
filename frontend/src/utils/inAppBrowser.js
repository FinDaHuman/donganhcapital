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
 * and (on Android) hand the URL off to Chrome via an intent: URL. iOS webviews
 * have no programmatic escape, so the UI guides the user to "Open in browser".
 */

const UA = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';

// UA fragments that uniquely identify a known social app's in-app browser.
// These tokens only appear inside those apps' webviews, so a match is safe —
// standalone Chrome/Safari never carry them, so we won't false-flag real
// browsers (which would otherwise break Google sign-in for everyone).
const NAMED_APPS = [
    // Messenger is checked before Facebook: its UA also carries the FBAN token,
    // so the more specific Messenger/Orca match must win for an accurate label.
    { re: /Messenger|MessengerForiOS|Orca-Android/i, label: 'Messenger' },
    { re: /FBAN|FBAV|FB_IAB|FB4A|FBIOS/i, label: 'Facebook' },
    { re: /Instagram/i, label: 'Instagram' },
    { re: /Twitter|TwitterAndroid/i, label: 'X' },
    { re: /\bZalo\b/i, label: 'Zalo' },
    { re: /\bLine\//i, label: 'Line' },
    { re: /TikTok|musical_ly|BytedanceWebview/i, label: 'TikTok' },
    { re: /LinkedInApp/i, label: 'LinkedIn' },
    { re: /Snapchat/i, label: 'Snapchat' },
];

/**
 * Detect whether the page is running inside an embedded in-app browser.
 * @returns {{ isInApp: boolean, label: string|null }} label names the host app
 *          when known (e.g. "Facebook"), or a generic label otherwise.
 */
export function detectInAppBrowser(ua = UA) {
    for (const app of NAMED_APPS) {
        if (app.re.test(ua)) return { isInApp: true, label: app.label };
    }
    // Generic Android WebView marker. Standalone browsers (Chrome, Firefox,
    // Samsung Internet, Edge) do NOT carry "; wv)", so this is a reliable
    // embedded-webview signal without false-flagging real browsers.
    if (/\bwv\b/.test(ua) && /Android/i.test(ua)) {
        return { isInApp: true, label: 'in-app browser' };
    }
    return { isInApp: false, label: null };
}

/** @returns {'ios'|'android'|'other'} */
export function getMobileOS(ua = UA) {
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'other';
}

/**
 * Try to reopen `url` in the system browser, escaping the webview.
 *
 * Android: hand off to Chrome via an intent: URL (falls back to the default
 * browser if Chrome isn't installed). Returns true — a handoff was attempted.
 * iOS / other: webviews offer no reliable programmatic escape, so this returns
 * false and the caller should show "Open in browser" instructions instead.
 *
 * @returns {boolean} whether an automatic escape was attempted.
 */
export function openInSystemBrowser(url) {
    if (getMobileOS() === 'android') {
        const noScheme = url.replace(/^https?:\/\//, '');
        const intentUrl =
            `intent://${noScheme}#Intent;scheme=https;` +
            `package=com.android.chrome;` +
            `S.browser_fallback_url=${encodeURIComponent(url)};end`;
        window.location.href = intentUrl;
        return true;
    }
    return false;
}
