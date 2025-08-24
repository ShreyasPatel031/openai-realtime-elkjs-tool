/**
 * App Router - Handles routing between public canvas (/) and full app (/canvas)
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { useEffect } from 'react';
import { getRedirectResult, signInWithRedirect, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../lib/firebase';
import App from './App';
import PublicCanvas from './PublicCanvas';

// Auth redirect component for new tab authentication
function AuthRedirect() {
  useEffect(() => {
    const handleAuth = async () => {
      if (!auth) return;
      
      console.log('🔄 Starting authentication in new tab...');
      
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({
          prompt: 'select_account'
        });
        
        // Initiate redirect in this tab
        await signInWithRedirect(auth, provider);
      } catch (error) {
        console.error('❌ Error initiating auth redirect:', error);
        // Close this tab on error
        window.close();
      }
    };
    
    // Check if we're returning from redirect
    const checkRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          console.log('✅ Authentication successful in new tab:', result.user.email);
          
          // Transfer anonymous architectures
          const { anonymousArchitectureService } = await import('../services/anonymousArchitectureService');
          try {
            const transferResult = await anonymousArchitectureService.transferAnonymousArchitectures(
              result.user.uid,
              result.user.email || ''
            );
            console.log(`🎉 Transferred ${transferResult.count} anonymous architectures`);
          } catch (error) {
            console.error('❌ Error transferring architectures:', error);
          }
          
          // Redirect to canvas in this tab
          window.location.href = '/canvas';
        } else {
          // No redirect result, start authentication
          handleAuth();
        }
      } catch (error) {
        console.error('❌ Error checking redirect result:', error);
        handleAuth();
      }
    };
    
    checkRedirectResult();
  }, []);
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Signing you in...</h2>
        <p className="text-gray-600">Please wait while we authenticate your account.</p>
      </div>
    </div>
  );
}

// Shared routes component
function AppRoutes() {
  // Handle Firebase redirect result at the router level
  useEffect(() => {
    const handleRedirectResult = async () => {
      if (!auth) return;
      
      try {
        console.log('🔍 [ROUTER] Checking for Firebase redirect result...');
        console.log('🌐 [ROUTER] Current pathname:', window.location.pathname);
        
        const result = await getRedirectResult(auth);
        console.log('📋 [ROUTER] Redirect result:', result);
        
        if (result && result.user) {
          console.log('✅ [ROUTER] User signed in via redirect:', result.user.email);
          console.log('🔄 [ROUTER] Redirecting to /canvas...');
          
          // Redirect to canvas regardless of current path
          window.location.href = window.location.origin + '/canvas';
          return;
        }
      } catch (error) {
        console.error('❌ [ROUTER] Error handling redirect result:', error);
      }
    };

    handleRedirectResult();
  }, []);

  return (
    <Routes>
      {/* Public canvas route - embeddable, no auth required */}
      <Route path="/" element={<PublicCanvas />} />
      
      {/* Authentication redirect route - for new tab auth flow */}
      <Route path="/auth-redirect" element={<AuthRedirect />} />
      
      {/* Full app route - requires auth, full functionality */}
      <Route path="/canvas" element={<App />} />
    </Routes>
  );
}

// Client-side router (uses BrowserRouter)
export function ClientAppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

// Server-side router (uses StaticRouter)
export function ServerAppRouter({ location = "/" }) {
  return (
    <StaticRouter location={location}>
      <AppRoutes />
    </StaticRouter>
  );
}

// Default export for backward compatibility (client-side)
export default function AppRouter() {
  return <ClientAppRouter />;
}
