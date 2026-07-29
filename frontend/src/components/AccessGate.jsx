import React, { useState } from 'react';
import { Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAccess } from '../hooks/useAccess';

/**
 * Shared access gates.
 *
 * AccessGuard — the wall every product tab sits behind: signed in AND email
 *               verified. Applied once in App.jsx so a new tab cannot ship
 *               without it.
 * SignInGate  — full-area prompt for anonymous visitors (icon + copy + auth CTAs).
 * EmailVerifyGate — prompt for signed-in users who have not confirmed their email.
 *
 * UpgradeGate used to live here too. It is gone with the paid tiers: there is
 * nothing above "signed in and verified" to upgrade to.
 */

const FONT = "'Outfit', sans-serif";

const btnPrimary = {
    background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-bright))',
    color: 'var(--text-inverse)',
    border: 'none',
    fontFamily: FONT,
};

const btnSecondary = {
    background: 'transparent',
    color: 'var(--gold-primary)',
    border: '1px solid rgba(201,169,110,0.35)',
    fontFamily: FONT,
};

const IconBadge = ({ icon: Icon, size = 24 }) => (
    <div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: 'var(--gold-dim)', border: '1px solid rgba(201,169,110,0.3)' }}
    >
        <Icon size={size} style={{ color: 'var(--gold-primary)' }} />
    </div>
);

export const SignInGate = ({ onTabChange, icon = Lock, title, description }) => (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
        <IconBadge icon={icon} size={28} />
        <div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)', fontFamily: FONT }}>
                {title}
            </h3>
            <p className="text-sm max-w-sm" style={{ color: 'var(--text-secondary)', fontFamily: FONT }}>
                {description}
            </p>
        </div>
        <div className="flex gap-3">
            <button
                onClick={() => onTabChange('login')}
                className="px-6 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all"
                style={btnSecondary}
            >
                Sign In
            </button>
            <button
                onClick={() => onTabChange('register')}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-all"
                style={btnPrimary}
            >
                Sign Up Free
            </button>
        </div>
    </div>
);


/**
 * EmailVerifyGate — shown when a signed-in user has not verified their email
 * yet, which is now the only thing standing between an account and the whole
 * platform. Prompts them to check their inbox.
 */
export const EmailVerifyGate = ({ icon = Mail, title, description }) => {
    const { resendVerification } = useAuth();
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [msg, setMsg] = useState('');

    const handleResend = async () => {
        setSending(true);
        setMsg('');
        const res = await resendVerification();
        setSending(false);
        setSent(res.success);
        setMsg(res.success ? 'Email sent — check your inbox.' : (res.error || 'Could not send the email.'));
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
            <IconBadge icon={icon} size={28} />
            <div>
                <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)', fontFamily: FONT }}>
                    {title || 'Verify your email to continue'}
                </h3>
                <p className="text-sm max-w-sm" style={{ color: 'var(--text-secondary)', fontFamily: FONT }}>
                    {description || 'We sent you a confirmation link. Open it to unlock the platform.'}
                </p>
            </div>
            <button
                onClick={handleResend}
                disabled={sending}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-all"
                style={{ ...btnPrimary, opacity: sending ? 0.7 : 1 }}
            >
                {sending ? 'Sending…' : 'Resend verification email'}
            </button>
            {msg && (
                <p className="text-xs" style={{ color: sent ? 'var(--success)' : 'var(--error)' }}>
                    {msg}
                </p>
            )}
        </div>
    );
};


/**
 * AccessGuard — every product tab sits behind this.
 *
 * Anonymous visitors get the sign-in prompt, signed-in-but-unverified accounts
 * get the verification prompt, everyone else gets the tab. Rendering it once
 * in App.jsx (rather than inside each tab) is what makes the rule impossible
 * for a new tab to miss — four tabs had already shipped without any gate.
 *
 * Note this is presentation only: public market endpoints remain reachable
 * without a session, so this hides the UI, it does not protect the data.
 */
export const AccessGuard = ({ children, onTabChange, feature = 'this feature' }) => {
    const { isAuthenticated, emailVerified } = useAccess();

    if (!isAuthenticated) {
        return (
            <div className="flex-1 w-full flex flex-col" style={{ background: '#000' }}>
                <SignInGate
                    onTabChange={onTabChange}
                    title={`Sign in to access ${feature}`}
                    description="Create a free account to use DongAnh Capital's market tools. No card required."
                />
            </div>
        );
    }

    if (!emailVerified) {
        return (
            <div className="flex-1 w-full flex flex-col" style={{ background: '#000' }}>
                <EmailVerifyGate
                    title="Verify your email to continue"
                    description={`Open the confirmation link we sent you to unlock ${feature}.`}
                />
            </div>
        );
    }

    return children;
};
