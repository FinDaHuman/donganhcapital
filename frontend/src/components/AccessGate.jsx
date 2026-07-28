import React, { useState } from 'react';
import { Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAccess } from '../hooks/useAccess';
import { isTrialOfferOpen } from '../utils/trialOffer';

/**
 * Shared access gates.
 *
 * AccessGuard — the wall every product tab sits behind: signed in AND email
 *               verified. Applied once in App.jsx so a new tab cannot ship
 *               without it.
 * SignInGate  — full-area prompt for anonymous visitors (icon + copy + auth CTAs).
 * EmailVerifyGate — prompt for signed-in users who have not confirmed their email.
 * UpgradeGate — prompt for signed-in users below the required tier. Offers the
 *               limited-time Pro trial while the offer window is open (Pro plan
 *               only), then falls back to a single upgrade CTA. `overlay` renders
 *               it as a blurred modal over placeholder content.
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

export const UpgradeGate = ({ onTabChange, title, description, plan = 'pro', overlay = false }) => {
    const { user, claimProTrial } = useAuth();
    const [claiming, setClaiming] = useState(false);
    const [claimMsg, setClaimMsg] = useState('');

    // Trial applies to Pro only; the offer self-sunsets via isTrialOfferOpen()
    const canClaim = plan === 'pro' && user && !user.pro_trial_claimed && isTrialOfferOpen();
    const planLabel = plan === 'premium' ? 'Premium' : 'Pro';

    const handleClaim = async () => {
        setClaiming(true);
        const res = await claimProTrial();
        if (res.success) {
            setClaimMsg('Trial activated! Refreshing…');
            setTimeout(() => window.location.reload(), 1200);
        } else {
            setClaimMsg(res.error || 'Could not activate trial.');
            setClaiming(false);
        }
    };

    const upgradeBtn = (primary) => (
        <button
            onClick={() => onTabChange('checkout', { plan, period: 'monthly' })}
            className={`w-full ${primary ? 'py-3 font-semibold' : 'py-2.5 font-medium'} rounded-xl text-sm transition-all cursor-pointer`}
            style={primary ? btnPrimary : btnSecondary}
        >
            Upgrade to {planLabel}
        </button>
    );

    const card = (
        <div
            className="flex flex-col items-center gap-4 p-8 rounded-2xl max-w-sm w-full mx-4 text-center"
            style={overlay
                ? { background: 'var(--bg-base)', border: '1px solid rgba(201,169,110,0.3)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' }
                : {}}
        >
            <IconBadge icon={Lock} />
            <div>
                <span
                    className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-3"
                    style={{
                        background: 'var(--gold-dim)',
                        color: 'var(--gold-primary)',
                        border: '1px solid rgba(201,169,110,0.3)',
                        fontFamily: FONT,
                    }}
                >
                    {planLabel} Feature
                </span>
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)', fontFamily: FONT }}>
                    {title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', fontFamily: FONT }}>
                    {description}
                </p>
            </div>

            <div className="flex flex-col gap-2 w-full">
                {canClaim && (
                    <button
                        onClick={handleClaim}
                        disabled={claiming}
                        className="w-full py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer"
                        style={{ ...btnPrimary, opacity: claiming ? 0.7 : 1 }}
                    >
                        {claiming ? 'Activating…' : 'Claim Free 1-Week Trial'}
                    </button>
                )}
                {claimMsg && (
                    <p className="text-xs text-center" style={{ color: claimMsg.includes('Refresh') ? 'var(--success)' : 'var(--error)' }}>
                        {claimMsg}
                    </p>
                )}
                {upgradeBtn(!canClaim)}
            </div>
        </div>
    );

    if (overlay) {
        return (
            <div
                className="absolute inset-0 flex flex-col items-center rounded-xl z-20 overflow-y-auto p-4"
                style={{ background: 'rgba(6,11,20,0.82)', backdropFilter: 'blur(6px)' }}
            >
                {/* m-auto keeps the card centred when there's room and preserves top
                    margin when it overflows a short container, so it stays scroll-reachable
                    (unlike justify-center, which clips the top when content overflows). */}
                <div className="m-auto w-full flex justify-center">{card}</div>
            </div>
        );
    }
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
            {card}
        </div>
    );
};


/**
 * EmailVerifyGate — shown when BYPASS_PAYMENT is on and the user hasn't
 * verified their email yet. Prompts them to check their inbox.
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
