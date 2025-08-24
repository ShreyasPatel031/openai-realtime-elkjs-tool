// Framer Auth Library compatibility script
// This script provides basic auth functionality for Framer embeds

(function() {
  'use strict';
  
  console.log('🔧 Framer Auth Library - live - v1.1.7');
  
  // Create a global FramerAuth object
  window.FramerAuth = {
    version: '1.1.7',
    initialized: true,
    
    // Mock auth methods for Framer compatibility
    init: function(config) {
      console.log('✅ FramerAuth initialized with config:', config);
      return Promise.resolve();
    },
    
    signIn: function(provider) {
      console.log('🔄 FramerAuth signIn called with provider:', provider);
      return Promise.resolve({ user: null });
    },
    
    signOut: function() {
      console.log('🔄 FramerAuth signOut called');
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
  
  // Emit ready event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('framer-auth-ready', {
      detail: { version: '1.1.7' }
    }));
  }
  
  console.log('✅ Framer Auth compatibility layer loaded');
})();
