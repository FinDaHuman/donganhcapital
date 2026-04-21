import React from 'react';

/**
 * ErrorBoundary catches JavaScript errors anywhere in the child component tree
 * and displays a fallback UI instead of crashing the entire app.
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // Log to console (could be extended to a monitoring service)
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            const { fallback } = this.props;
            if (fallback) return fallback;

            return (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        minHeight: '300px',
                        gap: '16px',
                        padding: '24px',
                        backgroundColor: '#111213',
                        color: '#e5e7eb',
                    }}
                >
                    <div
                        style={{
                            fontSize: '48px',
                            lineHeight: 1,
                        }}
                    >
                        ⚠️
                    </div>
                    <h2
                        style={{
                            fontSize: '20px',
                            fontWeight: 600,
                            color: '#f87171',
                            margin: 0,
                        }}
                    >
                        Something went wrong
                    </h2>
                    <p
                        style={{
                            color: '#9ca3af',
                            fontSize: '14px',
                            maxWidth: '400px',
                            textAlign: 'center',
                            margin: 0,
                        }}
                    >
                        An unexpected error occurred in this section. You can try refreshing
                        the page or navigating to a different tab.
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        style={{
                            padding: '8px 20px',
                            backgroundColor: '#2563eb',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 500,
                        }}
                    >
                        Try again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
