export default {
    title: 'Privacy Policy',
    version: '2026-08-01',
    updated: '1 August 2026',
    lead:
        'This policy explains what personal data we collect, why, who we share it with, how long we keep it, and what ' +
        'rights you have. It is written to comply with Vietnam’s Personal Data Protection Law No. 91/2025/QH15 and ' +
        'Decree 356/2025/NĐ-CP.',
    sections: [
        {
            heading: '1. Data controller',
            body: [
                'The data controller is the individual who operates DongAnh Capital — a non-commercial academic research ' +
                'project, not a company.',
                'Send any personal-data request to: support@donganhcapital.com',
            ],
        },
        {
            heading: '2. Personal data we collect',
            body: ['When you create an account and use the platform, we store:'],
            list: [
                'Your email address (required — used for sign-in and account verification)',
                'Your full name, if you provide one',
                'Your profile picture and Google account identifier, if you sign in with Google',
                'Your password as a bcrypt hash — we never store the plaintext',
                'Interface preferences (for example the risk profile you select to order what you see)',
                'Email verification status, account creation time and last update time',
                'A daily count of AI feature use, to enforce the shared quota',
                'A consent record: document version, timestamp and a hashed IP address',
            ],
            note:
                'We do NOT collect payment details, bank account numbers, national ID numbers, biometric data, location ' +
                'data, or any sensitive personal data as defined by Law 91/2025.',
        },
        {
            heading: '3. What we deliberately do NOT store',
            list: [
                'The content of your conversations with the AI assistant — chats are never persisted on our servers',
                'Raw IP addresses — only a salted hash is kept, and only in the consent record',
                'Your portfolio, orders, or any brokerage account data',
                'Card details or any payment instrument',
            ],
            note:
                'The application server does write technical access logs (path, timestamp, and the IP recorded by the ' +
                'hosting provider) under the platform’s default configuration. We do not analyse those logs to profile users.',
        },
        {
            heading: '4. Purposes and legal basis',
            list: [
                'Creating and maintaining your account — performance of our agreement with you',
                'Email verification, to stop throwaway accounts exhausting free API quotas — legitimate interest',
                'Sending required transactional email (verification, password reset) — performance of our agreement',
                'Enforcing AI feature quotas — legitimate interest in keeping the service available',
                'Recording proof of consent — legal obligation under Law 91/2025',
                'Sending announcement or feedback email — only with your consent, withdrawable at any time',
            ],
        },
        {
            heading: '5. Processors and cross-border transfers',
            body: [
                'The platform runs entirely on free-tier infrastructure from international providers. This means your ' +
                'personal data is stored and processed outside Vietnam. The full list:',
            ],
            list: [
                'Neon (PostgreSQL) — stores all account data',
                'Render — runs the application server',
                'Vercel — serves the web interface',
                'Cloudflare — CDN, protection, and PDF storage (R2)',
                'MongoDB Atlas — stores news data (contains no personal data)',
                'Resend — sends transactional email; receives your email address',
                'Google Gemini — processes what you type into the AI assistant; content is sent to generate a reply and is not retained by us',
                'Google — if you choose to sign in with a Google account',
            ],
            note:
                'By using the platform you understand and agree to the cross-border transfer of your personal data as ' +
                'described above. If you do not want your input sent to Google Gemini, simply do not use the AI assistant ' +
                'or news analysis features.',
        },
        {
            heading: '6. Retention',
            list: [
                'Account data: kept for as long as the account exists',
                'Password reset tokens: 60 minutes. Email verification tokens: 24 hours',
                'AI quota counters: overwritten daily',
                'Consent records: kept long-term as compliance evidence, including after account deletion',
                'A marker that a trial was once used: kept long-term, to prevent account recreation to abuse it',
            ],
            note:
                'When you request deletion, we anonymise your data rather than hard-deleting the row: email, name, avatar ' +
                'and every identifier are removed, leaving only a technical record that can no longer identify you.',
        },
        {
            heading: '7. Your rights',
            body: ['Under Law 91/2025 you have the following rights over your personal data:'],
            list: [
                'The right to be informed — this policy discharges it',
                'The right of access and portability — download all your data as JSON from the Profile page',
                'The right to rectification — edit your name and preferences on the Profile page',
                'The right to erasure — request account deletion from the Profile page',
                'The right to withdraw consent — unsubscribe at any time via the link in every email',
                'The right to restrict or object to processing',
                'The right to complain to the competent Vietnamese authority',
            ],
            note: 'We respond to every personal-data request within 72 working hours.',
        },
        {
            heading: '8. Security and data breaches',
            body: [
                'We use: bcrypt password hashing, session tokens in httpOnly cookies (unreadable by JavaScript), HTTPS ' +
                'throughout, sign-in rate limiting, and account lockout on signs of password guessing.',
                'No system is perfectly secure. If a personal data breach occurs, we will notify the competent authority ' +
                'within 72 hours of becoming aware of it, as required by Article 23 of Law 91/2025, and will inform ' +
                'affected users.',
            ],
        },
        {
            heading: '9. Children',
            body: [
                'The platform is not intended for anyone under 18 and we do not knowingly collect children’s data. If you ' +
                'believe we have inadvertently done so, please contact us and we will delete it.',
            ],
        },
        {
            heading: '10. Changes to this policy',
            body: [
                'When this policy changes, the version and update date at the top of the page change with it. For material ' +
                'changes, registered users are asked to re-confirm at next sign-in.',
            ],
        },
        {
            heading: '11. Governing language',
            body: [
                'This English text is provided for convenience. In the event of any conflict, the Vietnamese version ' +
                'prevails.',
            ],
        },
    ],
};
