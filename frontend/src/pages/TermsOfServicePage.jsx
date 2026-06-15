import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText } from 'lucide-react';

const TermsOfServicePage = ({ onTabChange }) => {
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
                    onClick={() => onTabChange && onTabChange('home')}
                    className="flex items-center gap-2 text-sm cursor-pointer transition-colors mb-8"
                    style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
                >
                    <ArrowLeft size={16} /> Back to Home
                </button>

                <div className="mb-10 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.25)' }}>
                        <FileText size={24} style={{ color: 'var(--gold-primary)' }} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)', fontFamily: "'Cormorant Garamond', serif" }}>
                            Terms of Service
                        </h1>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Last updated: June 2026</p>
                    </div>
                </div>

                <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    <section>
                        <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>1. Acceptance of Terms</h2>
                        <p>By accessing or using DongAnh Capital ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not access or use the Service.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>2. Disclaimer of Financial Advice</h2>
                        <p>The content, predictions, AI signals, and analytics provided by DongAnh Capital are for informational and educational purposes only. They do not constitute financial, investment, or trading advice. You are solely responsible for your own investment decisions. DongAnh Capital is not liable for any financial losses incurred through the use of our platform.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>3. Subscriptions and Payments</h2>
                        <p>We offer premium features through paid subscriptions. Payments are processed securely via third-party providers (e.g., SePay). By subscribing, you agree to provide accurate billing information. Subscriptions are non-refundable unless otherwise required by law.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>4. User Accounts</h2>
                        <p>You are responsible for safeguarding your account credentials. You must notify us immediately of any unauthorized use of your account. We reserve the right to suspend or terminate your account if you violate these terms or engage in abusive behavior.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>5. Intellectual Property</h2>
                        <p>All content, features, and functionality of the Service (including algorithms, AI models, design, text, and graphics) are the exclusive property of DongAnh Capital and are protected by copyright and intellectual property laws.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>6. Contact Information</h2>
                        <p>For any questions regarding these Terms, please contact us at:</p>
                        <p className="mt-2 font-medium" style={{ color: 'var(--gold-primary)' }}>support@donganhcapital.com</p>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default TermsOfServicePage;
