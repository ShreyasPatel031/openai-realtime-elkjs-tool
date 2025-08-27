import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, User, onAuthStateChanged, getIdToken } from 'firebase/auth';
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
    console.log('🔥 SIGN-IN TRIGGERED - Starting Google sign-in process');
    
    if (!auth) {
      console.log('🚫 Firebase authentication not available');
      return;
    }

    setIsLoading(true);
    console.log('⏳ Sign-in loading state set to true');
    try {
      const provider = new GoogleAuthProvider();
      
      // Configure provider to ensure popup behavior
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      console.log('🔄 Attempting Google sign-in with popup...');
      const result = await signInWithPopup(auth, provider);
      console.log('✅ User signed in via popup:', result.user.email);
      
      // Transfer anonymous architectures if signing in from public route
      if (location.pathname === '/') {
        console.log('🔥 NAMING LOGIC START - Signing in from public route, will transfer architectures and apply AI naming');
        console.log('🔄 Transferring anonymous architectures and redirecting to /canvas...');
        
        // Get architecture ID from URL before transferring
        const urlParams = new URLSearchParams(location.search);
        const architectureIdFromUrl = urlParams.get('arch');
        console.log('🔗 Architecture ID from URL:', architectureIdFromUrl);
        
        // Import services for handling architectures
        const { anonymousArchitectureService } = await import('../../services/anonymousArchitectureService');
        const { default: ArchitectureService } = await import('../../services/architectureService');
        
        let priorityArchId = null;
        
        // If there's an architecture ID in the URL, load that shared architecture and save it as user architecture
        if (architectureIdFromUrl) {
          console.log('🔗 Loading shared architecture from URL for signed-in user:', architectureIdFromUrl);
          try {
            const sharedArch = await anonymousArchitectureService.loadAnonymousArchitectureById(architectureIdFromUrl);
            if (sharedArch) {
              console.log('✅ Found shared architecture:', sharedArch.name);
              
              // 🔥 ALWAYS generate AI names when converting anonymous → user architecture
              // This is the ONLY place naming should happen (when user signs in)
              let architectureName = sharedArch.name;
              console.log('🔥 SIGN-IN NAMING - Converting anonymous architecture to user architecture');
              console.log('📝 Anonymous arch name (should be generic or empty):', architectureName);
              
              try {
                console.log('🌐 Making API request to /api/generateChatName...');
                const response = await fetch('/api/generateChatName', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    architecture: sharedArch.rawGraph,
                    nodeCount: sharedArch.rawGraph?.children?.length || 0,
                    edgeCount: sharedArch.rawGraph?.edges?.length || 0,
                    userPrompt: `Architecture with ${sharedArch.rawGraph?.children?.length || 0} components converted from anonymous to user account`
                  }),
                });
                
                console.log('📡 API response status:', response.status);
                if (response.ok) {
                  const data = await response.json();
                  console.log('📦 API response data:', data);
                  if (data.name && data.name.trim()) {
                    architectureName = data.name.trim();
                    console.log('✅ Generated AI name for user architecture:', architectureName);
                  } else {
                    throw new Error('Empty name returned from API');
                  }
                } else {
                  const errorText = await response.text();
                  console.error('❌ API request failed:', response.status, errorText);
                  throw new Error(`API request failed with status: ${response.status}`);
                }
              } catch (error) {
                console.warn('⚠️ AI naming failed, using fallback:', error);
                // Generate fallback name based on architecture content
                architectureName = ArchitectureService.generateArchitectureName(
                  sharedArch.rawGraph?.children || [], 
                  sharedArch.rawGraph?.edges || []
                );
                console.log('📝 Using improved fallback name:', architectureName);
              }
              
              const newArchId = await ArchitectureService.saveArchitecture({
                name: architectureName,
                userId: result.user.uid,
                userEmail: result.user.email || '',
                rawGraph: sharedArch.rawGraph,
                nodes: sharedArch.rawGraph?.children || [],
                edges: sharedArch.rawGraph?.edges || [],
                userPrompt: `Imported from shared link on ${new Date().toLocaleDateString()}`
              });
              
              priorityArchId = newArchId;
              console.log('✅ Saved shared architecture as user architecture:', newArchId);
            } else {
              console.warn('⚠️ Shared architecture not found, falling back to session transfer');
            }
          } catch (error) {
            console.error('❌ Error loading shared architecture, falling back to session transfer:', error);
          }
        }
        
        // If no shared architecture was loaded, transfer any anonymous architectures from session
        if (!priorityArchId) {
          try {
            const transferResult = await anonymousArchitectureService.transferAnonymousArchitectures(
              result.user.uid,
              result.user.email || ''
            );
            console.log(`🎉 Transferred ${transferResult.count} session architectures`);
            
            if (transferResult.transferredIds.length > 0) {
              priorityArchId = transferResult.transferredIds[0];
              console.log('📌 Using first transferred session architecture:', priorityArchId);
            }
          } catch (error) {
            console.error('❌ Error transferring session architectures:', error);
          }
        }
        
        // Store the priority architecture ID for the canvas
        if (priorityArchId) {
          localStorage.setItem('priority_architecture_id', priorityArchId);
          console.log('📌 Set priority architecture for canvas:', priorityArchId);
        }
        
        // Navigate to canvas in the same tab, preserving architecture ID if present
        const canvasUrl = architectureIdFromUrl ? `/canvas?arch=${architectureIdFromUrl}` : '/canvas';
        console.log('🔄 Navigating to:', canvasUrl);
        navigate(canvasUrl);
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
            console.log('🔥 BUTTON CLICK - Not signed in, triggering Google sign-in');
            handleGoogleSignIn();
          } else if (window.location.pathname === '/') {
            // Signed in on public route - trigger sign-in (will open canvas after)
            console.log('🔥 BUTTON CLICK - Signed in on public route, triggering canvas redirect with naming');
            handleGoogleSignIn();
          } else {
            // Signed in on canvas route - directly sign out (no dropdown)
            console.log('🔥 BUTTON CLICK - Profile clicked, signing out user');
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
