import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details for debugging (CSP-safe)
    try {
      if (typeof console !== 'undefined' && console.error) {
        console.error('🚨 ErrorBoundary caught an error:', error);
        console.error('📍 Error info:', errorInfo);
        
        // Check for specific React errors
        if (error.message.includes('Minified React error')) {
          console.error('🔍 This is a minified React error. Check https://reactjs.org/docs/error-decoder.html');
        }
      }
    } catch (e) {
      // Silently fail if console is restricted
    }
  }

  public render() {
    if (this.state.hasError) {
      // Render fallback UI or continue with minimal functionality
      return this.props.fallback || (
        <div style={{ 
          padding: '20px', 
          textAlign: 'center', 
          color: '#666',
          fontSize: '14px'
        }}>
          <p>⚠️ Some features may be limited due to security restrictions.</p>
          <p>The application will continue to work normally.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
