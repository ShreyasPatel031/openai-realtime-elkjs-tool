import React, { useState, useEffect } from 'react';
import { auth } from '../../lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, User, onAuthStateChanged, getIdToken } from 'firebase/auth';
import { LogOut, User as UserIcon } from 'lucide-react';

interface SaveAuthProps {
  onSave?: (user: User) => void;
  className?: string;
  isCollapsed?: boolean;
}

const SaveAuth: React.FC<SaveAuthProps> = ({ onSave, className = "", isCollapsed = false }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Listen for auth state changes
  useEffect(() => {
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
      });
      return () => unsubscribe();
    }
  }, [onSave]);

  const handleGoogleSignIn = async () => {
    if (!auth) {
      console.log('🚫 Firebase authentication not available');
      return;
    }

    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      
      // Configure provider to ensure popup behavior
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      console.log('🔄 Attempting sign-in with popup (same tab)...');
      const result = await signInWithPopup(auth, provider);
      console.log('✅ User signed in via popup:', result.user.email);
      
      // Wait for fresh auth token before triggering save
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
    } catch (error: any) {
      console.error('❌ Error signing in with Google:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        console.log('🚫 Sign-in was cancelled by user');
      } else if (error.code === 'auth/popup-blocked') {
        console.log('🚫 Sign-in popup was blocked by browser');
        console.log('💡 Please allow popups for this site and try again');
        alert('Please allow popups for this site and try signing in again. The sign-in popup was blocked by your browser.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        console.log('🚫 Another popup request was cancelled');
      } else {
        console.log('❌ Unexpected error during popup sign-in:', error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    
    try {
      await signOut(auth);
      console.log('✅ User signed out');
      setShowDropdown(false);
      
      // Redirect to canvas after sign out
      window.location.href = window.location.origin + '/canvas';
    } catch (error) {
      console.error('❌ Error signing out:', error);
    }
  };


  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.save-auth-dropdown')) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  return (
    <div className={`relative save-auth-dropdown ${className}`}>
      <button
        onClick={user ? () => setShowDropdown(!showDropdown) : handleGoogleSignIn}
        disabled={isLoading}
        className={`flex items-center gap-3 rounded-lg shadow-lg border border-gray-200 hover:bg-gray-50 hover:shadow-md transition-all duration-200 ${
          isCollapsed ? 'w-10 h-10 justify-center' : 'w-full px-4 py-3 justify-start'
        } ${user 
          ? 'bg-white text-gray-700' 
          : 'bg-white text-gray-700'
        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={user ? `Profile (${user.email})` : "Sign in"}
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

      {/* Dropdown menu for authenticated user */}
      {user && showDropdown && (
        <div className="absolute top-12 right-0 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center space-x-3">
              <div className="relative w-8 h-8">
                {user.photoURL ? (
                  <>
                    <img 
                      src={user.photoURL} 
                      alt="Profile" 
                      className="w-8 h-8 rounded-full"
                      onError={(e) => {
                        console.warn('Failed to load dropdown profile image, falling back to icon');
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.parentElement?.querySelector('.fallback-icon');
                        if (fallback) fallback.classList.remove('hidden');
                      }}
                    />
                    <UserIcon className="fallback-icon w-8 h-8 text-gray-400 hidden" />
                  </>
                ) : (
                  <UserIcon className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user.displayName || 'User'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user.email}
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-2">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SaveAuth;
