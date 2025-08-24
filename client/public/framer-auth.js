// Framer Auth Library compatibility script
// This script provides basic auth functionality for Framer embeds

(function() {
  'use strict';
  
  // Only log if console is available and not in strict CSP environment
  if (typeof console !== 'undefined' && console.log) {
    try {
      console.log('🔧 Framer Auth Library - live - v1.1.7');
    } catch (e) {
      // Silently fail if console is restricted
    }
  }
  
  // Create a global FramerAuth object
  window.FramerAuth = {
    version: '1.1.7',
    initialized: true,
    
    // Mock auth methods for Framer compatibility
    init: function(config) {
      try {
        if (typeof console !== 'undefined' && console.log) {
          console.log('✅ FramerAuth initialized with config:', config);
        }
      } catch (e) {
        // Silently fail if console is restricted
      }
      return Promise.resolve();
    },
    
    signIn: function(provider) {
      try {
        if (typeof console !== 'undefined' && console.log) {
          console.log('🔄 FramerAuth signIn called with provider:', provider);
        }
      } catch (e) {
        // Silently fail if console is restricted
      }
      return Promise.resolve({ user: null });
    },
    
    signOut: function() {
      try {
        if (typeof console !== 'undefined' && console.log) {
          console.log('🔄 FramerAuth signOut called');
        }
      } catch (e) {
        // Silently fail if console is restricted
      }
      return Promise.resolve();
    },
    
    getCurrentUser: function() {
      return null;
    },
    
    onAuthStateChanged: function(callback) {
      // Call callback with null user (anonymous mode)
      if (typeof callback === 'function') {
        callback(null);
      }
      return function() {}; // Return unsubscribe function
    }
  };
  
  // Emit ready event (CSP-safe)
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    try {
      window.dispatchEvent(new CustomEvent('framer-auth-ready', {
        detail: { version: '1.1.7' }
      }));
    } catch (e) {
      // Silently fail if CustomEvent is restricted
    }
  }
  
  // Safe console logging
  try {
    if (typeof console !== 'undefined' && console.log) {
      console.log('✅ Framer Auth compatibility layer loaded');
    }
  } catch (e) {
    // Silently fail if console is restricted
  }
  
  // Global error handler for third-party scripts
  if (typeof window !== 'undefined') {
    // Handle CSP violations gracefully
    window.addEventListener('securitypolicyviolation', function(e) {
      // Silently handle CSP violations from third-party scripts
      if (e.violatedDirective && e.violatedDirective.includes('script-src')) {
        // This is expected in embedded environments
        return;
      }
    });
    
    // Handle general script errors
    window.addEventListener('error', function(e) {
      // Silently handle errors from blocked third-party scripts
      if (e.filename && (
        e.filename.includes('facebook.net') ||
        e.filename.includes('booking-') ||
        e.filename.includes('datadog')
      )) {
        e.preventDefault();
        return false;
      }
    });
  }
})();
