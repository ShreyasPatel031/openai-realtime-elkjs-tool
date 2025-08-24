import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut, User, onAuthStateChanged, getIdToken } from 'firebase/auth';
import { LogOut, User as UserIcon } from 'lucide-react';

interface SaveAuthProps {
  onSave?: (user: User) => void;
  className?: string;
  isCollapsed?: boolean;
  user?: User | null; // Accept user as prop instead of managing internally
}

const SaveAuth: React.FC<SaveAuthProps> = ({ onSave, className = "", isCollapsed = false, user: propUser }) => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Use user from props instead of managing internal state
  const user = propUser;

  const handleGoogleSignIn = async () => {
    if (!auth) {
      console.log('🚫 Firebase authentication not available');
      return;
    }

    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      
      // Configure provider for redirect flow
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      console.log('🔄 Attempting Google sign-in with redirect...');
      
      // Store current state before redirect
      const currentState = {
        elkGraph: localStorage.getItem('publicCanvasState'),
        timestamp: Date.now(),
        returnUrl: window.location.href
      };
      localStorage.setItem('authRedirectState', JSON.stringify(currentState));
      
      // Use redirect instead of popup - this works in embedded environments
      await signInWithRedirect(auth, provider);
      console.log('🔄 Redirect initiated...');
      
      // Note: After redirect, the page will reload and redirect result will be handled in useEffect
    } catch (error: any) {
      console.error('❌ Error initiating Google sign-in redirect:', error);
      setIsLoading(false);
    }
  };

  // Handle redirect result on component mount
  useEffect(() => {
    const handleRedirectResult = async () => {
      if (!auth) return;
      
      try {
        console.log('🔍 Checking for redirect result...');
        const result = await getRedirectResult(auth);
        
        if (result && result.user) {
          console.log('✅ User signed in via redirect:', result.user.email);
          
          // Restore state from before redirect
          const savedState = localStorage.getItem('authRedirectState');
          if (savedState) {
            const state = JSON.parse(savedState);
            console.log('🔄 Restoring state from before redirect');
            localStorage.removeItem('authRedirectState');
          }
          
          // Transfer anonymous architectures if signing in from public route
          if (location.pathname === '/') {
            console.log('🔄 Transferring anonymous architectures and redirecting to /canvas...');
            
            // Import and transfer anonymous architectures
            const { anonymousArchitectureService } = await import('../../services/anonymousArchitectureService');
            try {
              const transferResult = await anonymousArchitectureService.transferAnonymousArchitectures(
                result.user.uid,
                result.user.email || ''
              );
              console.log(`🎉 Transferred ${transferResult.count} anonymous architectures`);
              console.log('🔗 Transferred architecture IDs:', transferResult.transferredIds);
              
              // Store the transferred architecture ID to prioritize it in the new canvas tab
              if (transferResult.transferredIds.length > 0) {
                const priorityArchId = transferResult.transferredIds[0];
                localStorage.setItem('priority_architecture_id', priorityArchId);
                console.log('📌 Set priority architecture for canvas:', priorityArchId);
              }
            } catch (error) {
              console.error('❌ Error transferring anonymous architectures:', error);
            }
            
            // Redirect to custom domain canvas
            console.log('🔄 Redirecting to https://app.atelier-inc.net/canvas...');
            window.location.href = 'https://app.atelier-inc.net/canvas';
            return;
          }
          
          // If on canvas route, proceed with save functionality
          if (onSave && result.user) {
            try {
              console.log('🔄 Getting fresh auth token...');
              await getIdToken(result.user, /* forceRefresh */ true);
              console.log('✅ Fresh auth token obtained');
              onSave(result.user);
            } catch (tokenError) {
              console.error('❌ Failed to get auth token:', tokenError);
              // Still try to save in case token isn't the issue
              onSave(result.user);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error handling redirect result:', error);
      }
    };

    handleRedirectResult();
  }, [location.pathname, navigate, onSave]);

  const handleSignOut = async () => {
    if (!auth) return;
    
    try {
      await signOut(auth);
      console.log('✅ User signed out');

      
      // If on canvas route, redirect to public route
      if (window.location.pathname === '/canvas') {
        console.log('🔄 Redirecting to public route after sign-out');
        window.location.href = '/';
      }
    } catch (error) {
      console.error('❌ Error signing out:', error);
    }
  };



  return (
    <div className={`relative save-auth-dropdown ${className}`}>
      <button
        onClick={() => {
          if (!user) {
            // Not signed in - trigger sign-in popup
            console.log('🔄 Not signed in - triggering Google sign-in');
            handleGoogleSignIn();
          } else if (window.location.pathname === '/') {
            // Signed in on public route - trigger sign-in (will open canvas after)
            console.log('🔄 Signed in on public route - triggering sign-in to open canvas');
            handleGoogleSignIn();
          } else {
            // Signed in on canvas route - directly sign out (no dropdown)
            console.log('🔄 Profile clicked - signing out user');
            handleSignOut();
          }
        }}
        disabled={isLoading}
        className={`flex items-center gap-3 rounded-lg shadow-lg border border-gray-200 hover:bg-gray-50 hover:shadow-md transition-all duration-200 ${
          isCollapsed ? 'w-10 h-10 justify-center' : 'w-full px-4 py-3 justify-start'
        } ${user 
          ? 'bg-white text-gray-700' 
          : 'bg-white text-gray-700'
        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={user ? (window.location.pathname === '/' ? "Sign in to continue editing" : "Sign out") : "Sign in to continue editing"}
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
        ) : user ? (
          <div className="relative w-4 h-4">
            {user.photoURL ? (
              <>
                <img 
                  src={user.photoURL} 
                  alt="Profile" 
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  onError={(e) => {
                    console.warn('Failed to load profile image, falling back to icon');
                    e.currentTarget.style.display = 'none';
                    const fallback = e.currentTarget.parentElement?.querySelector('.fallback-icon');
                    if (fallback) fallback.classList.remove('hidden');
                  }}
                />
                <UserIcon className="fallback-icon w-4 h-4 flex-shrink-0 hidden" />
              </>
            ) : (
              <UserIcon className="w-4 h-4 flex-shrink-0" />
            )}
          </div>
        ) : (
          <UserIcon className="w-4 h-4 flex-shrink-0" />
        )}
        {!isCollapsed && (
          <span className="font-medium truncate">
            {user ? user.displayName || user.email?.split('@')[0] || 'Profile' : 'Sign in'}
          </span>
        )}
      </button>


    </div>
  );
};

export default SaveAuth;
