import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield } from 'lucide-react';

const PrivacyPolicyPage = ({ onTabChange, returnTo = 'home' }) => {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="w-full min-h-screen py-12 px-4 relative" style={{ backgroundColor: 'var(--bg-void)', fontFamily: "'Outfit', sans-serif" }}>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] z-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse at 50% 0%, rgba(201,169,110,0.06) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
            />

            <div className="max-w-3xl mx-auto relative z-10">
                <button
                    onClick={() => onTabChange && onTabChange(returnTo)}
                    className="flex items-center gap-2 text-sm cursor-pointer transition-colors mb-8"
                    style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
                >
                    <ArrowLeft size={16} /> {returnTo === 'register' ? 'Back to Sign Up' : 'Back to Home'}
                </button>

                <div className="mb-10 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.25)' }}>
                        <Shield size={24} style={{ color: 'var(--gold-primary)' }} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)', fontFamily: "'Cormorant Garamond', serif" }}>
                            Privacy Policy
                        </h1>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Last updated: June 2026</p>
                    </div>
                </div>

                <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    <section>
                        <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>1. Information We Collect</h2>
                        <p>When you use DongAnh Capital, we collect the following types of information:</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li><strong>Account Information:</strong> Name, email address, and profile picture (via Google OAuth or email registration).</li>
                            <li><strong>Usage Data:</strong> Pages visited, features used, and preferences (such as risk appetite) to personalize your AI experience.</li>
                            <li><strong>Payment Information:</strong> We do not store credit card details. Bank transfer information is processed securely via SePay.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>2. How We Use Your Information</h2>
                        <p>Your information is used to:</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li>Provide, maintain, and improve our AI trading analytics platform.</li>
                            <li>Personalize your dashboard and AI recommendations.</li>
                            <li>Process your subscriptions and payments.</li>
                            <li>Communicate with you regarding account updates, security alerts, and support.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>3. Google OAuth Data</h2>
                        <p>If you log in using Google, we access your Google account's basic profile information (name, email, profile picture) strictly for authentication and account creation purposes. We do not access your contacts, emails, or any other private Google data. Our use of information received from Google APIs will adhere to Google API Services User Data Policy.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>4. Data Security</h2>
                        <p>We implement robust security measures including encryption, secure cookies (httpOnly), and rate limiting to protect your personal data against unauthorized access, alteration, or destruction. However, no method of transmission over the Internet is 100% secure.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>5. Contact Us</h2>
                        <p>If you have any questions or concerns about this Privacy Policy, please contact us at:</p>
                        <p className="mt-2 font-medium" style={{ color: 'var(--gold-primary)' }}>support@donganhcapital.com</p>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default PrivacyPolicyPage;
