export default {
    title: 'Cookie Policy',
    version: '2026-08-01',
    updated: '1 August 2026',
    lead:
        'The platform uses only the cookies strictly necessary for sign-in to work. We use no advertising cookies, do ' +
        'not track you across websites, and currently run no behavioural analytics of any kind.',
    sections: [
        {
            heading: '1. Cookies we set',
            body: ['The complete list — no other cookie is set:'],
            list: [
                'dac_access_token — your session token. httpOnly (unreadable by JavaScript), 15-minute lifetime.',
                'dac_refresh_token — used to renew your session. httpOnly, 7-day lifetime, sent only to the refresh endpoint.',
                'dac_session — contains only the value “1”, telling the interface this browser has a session. Carries no token and no personal data. 7-day lifetime.',
            ],
        },
        {
            heading: '2. Browser storage',
            body: [
                'Besides cookies, the platform keeps a few items in your browser’s localStorage. This data is never sent ' +
                'to our servers:',
            ],
            list: [
                'dac_locale — the language you chose for the legal pages',
                'dac_cookie_consent — your choice on the cookie notice',
                'Cached market data, so pages load faster on your next visit',
            ],
        },
        {
            heading: '3. Third-party cookies',
            body: [
                'We set no advertising or tracking cookies. If you choose to sign in with Google, Google may set its own ' +
                'cookies during authentication — that is governed by Google’s privacy policy.',
            ],
        },
        {
            heading: '4. Declining cookies',
            body: [
                'The cookies in section 1 are required for sign-in to function; they cannot be disabled individually while ' +
                'keeping a session. You can use most of the public platform without signing in, and you can delete cookies ' +
                'at any time in your browser settings.',
                'If we ever add analytics, it will only run after you have agreed on the cookie notice.',
            ],
        },
    ],
};
