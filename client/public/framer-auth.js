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
  
  // Comprehensive debugging and error tracking
  const debugLog = (category, message, data = null) => {
    try {
      if (typeof console !== 'undefined' && console.log) {
        const timestamp = new Date().toISOString();
        const prefix = `🔍 [${timestamp}] [${category}]`;
        if (data) {
          console.log(`${prefix} ${message}`, data);
        } else {
          console.log(`${prefix} ${message}`);
        }
      }
    } catch (e) {
      // Silently fail if console is restricted
    }
  };

  // Track blocked resources
  const blockedResources = {
    firebase: [],
    thirdParty: [],
    scripts: [],
    styles: [],
    images: [],
    other: []
  };

  // Global error handler for third-party scripts and React errors
  if (typeof window !== 'undefined') {
    // Handle CSP violations with detailed logging
    window.addEventListener('securitypolicyviolation', function(e) {
      const violation = {
        directive: e.violatedDirective,
        blockedURI: e.blockedURI,
        documentURI: e.documentURI,
        originalPolicy: e.originalPolicy,
        sourceFile: e.sourceFile,
        lineNumber: e.lineNumber
      };
      
      debugLog('CSP-VIOLATION', 'Content Security Policy violation detected', violation);
      
      // Categorize the blocked resource
      if (e.blockedURI) {
        if (e.blockedURI.includes('firebase') || e.blockedURI.includes('googleapis')) {
          blockedResources.firebase.push(violation);
          debugLog('FIREBASE-BLOCKED', `Firebase resource blocked: ${e.blockedURI}`);
        } else if (e.blockedURI.includes('facebook.net') || e.blockedURI.includes('booking-') || e.blockedURI.includes('datadog')) {
          blockedResources.thirdParty.push(violation);
          debugLog('THIRD-PARTY-BLOCKED', `Third-party resource blocked: ${e.blockedURI}`);
        } else {
          blockedResources.other.push(violation);
          debugLog('OTHER-BLOCKED', `Other resource blocked: ${e.blockedURI}`);
        }
      }
      
      // Don't prevent default for logging purposes, but handle gracefully
      if (e.violatedDirective && e.violatedDirective.includes('script-src')) {
        debugLog('CSP-SCRIPT', 'Script blocked by CSP - this is expected in embedded environments');
        return;
      }
    });
    
    // Handle general script errors with detailed logging
    window.addEventListener('error', function(e) {
      const errorInfo = {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        error: e.error ? e.error.toString() : null,
        stack: e.error ? e.error.stack : null
      };
      
      debugLog('SCRIPT-ERROR', 'Script error detected', errorInfo);
      
      // Handle blocked third-party scripts
      if (e.filename && (
        e.filename.includes('facebook.net') ||
        e.filename.includes('booking-') ||
        e.filename.includes('datadog')
      )) {
        blockedResources.thirdParty.push(errorInfo);
        debugLog('THIRD-PARTY-ERROR', `Third-party script error: ${e.filename}`, errorInfo);
        e.preventDefault();
        return false;
      }
      
      // Handle Firebase-related errors
      if (e.filename && (e.filename.includes('firebase') || e.filename.includes('googleapis'))) {
        blockedResources.firebase.push(errorInfo);
        debugLog('FIREBASE-ERROR', `Firebase script error: ${e.filename}`, errorInfo);
        e.preventDefault();
        return false;
      }
      
      // Handle React minified errors
      if (e.message && e.message.includes('Minified React error')) {
        debugLog('REACT-ERROR', 'React minified error detected', errorInfo);
        try {
          if (typeof console !== 'undefined' && console.error) {
            console.error('🚨 React Error in Framer embed:', e.message);
            console.error('🔗 Decode at: https://reactjs.org/docs/error-decoder.html');
          }
        } catch (consoleError) {
          // Silently fail if console is restricted
        }
        e.preventDefault();
        return false;
      }
      
      // Log any other errors
      debugLog('GENERAL-ERROR', 'Unhandled script error', errorInfo);
    });
    
    // Handle unhandled promise rejections with detailed logging
    window.addEventListener('unhandledrejection', function(e) {
      const rejectionInfo = {
        reason: e.reason ? e.reason.toString() : 'Unknown reason',
        message: e.reason && e.reason.message ? e.reason.message : null,
        stack: e.reason && e.reason.stack ? e.reason.stack : null,
        promise: e.promise ? 'Promise object present' : 'No promise object'
      };
      
      debugLog('PROMISE-REJECTION', 'Unhandled promise rejection detected', rejectionInfo);
      
      // Handle Firebase promise rejections
      if (e.reason && e.reason.message && (
        e.reason.message.includes('firebase') || 
        e.reason.message.includes('Firebase') ||
        e.reason.message.includes('googleapis')
      )) {
        blockedResources.firebase.push(rejectionInfo);
        debugLog('FIREBASE-PROMISE-ERROR', 'Firebase promise rejection', rejectionInfo);
        e.preventDefault();
        return;
      }
      
      // Handle React promise rejections
      if (e.reason && e.reason.message && e.reason.message.includes('Minified React error')) {
        debugLog('REACT-PROMISE-ERROR', 'React promise rejection', rejectionInfo);
        try {
          if (typeof console !== 'undefined' && console.error) {
            console.error('🚨 Unhandled React Promise Rejection:', e.reason.message);
          }
        } catch (consoleError) {
          // Silently fail if console is restricted
        }
        e.preventDefault();
        return;
      }
      
      // Log other promise rejections
      debugLog('GENERAL-PROMISE-ERROR', 'Other promise rejection', rejectionInfo);
    });
    
    // Add network request monitoring
    if (typeof window.fetch !== 'undefined') {
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        debugLog('NETWORK-REQUEST', `Fetch request to: ${url}`);
        
        return originalFetch.apply(this, args)
          .then(response => {
            debugLog('NETWORK-SUCCESS', `Fetch success: ${url} (${response.status})`);
            return response;
          })
          .catch(error => {
            const errorInfo = {
              url: url,
              error: error.toString(),
              message: error.message
            };
            
            if (url && (url.includes('firebase') || url.includes('googleapis'))) {
              blockedResources.firebase.push(errorInfo);
              debugLog('FIREBASE-FETCH-ERROR', `Firebase fetch failed: ${url}`, errorInfo);
            } else {
              debugLog('NETWORK-ERROR', `Fetch failed: ${url}`, errorInfo);
            }
            
            throw error;
          });
      };
    }
    
    // Periodic summary of blocked resources
    setInterval(() => {
      const summary = {
        firebase: blockedResources.firebase.length,
        thirdParty: blockedResources.thirdParty.length,
        scripts: blockedResources.scripts.length,
        styles: blockedResources.styles.length,
        images: blockedResources.images.length,
        other: blockedResources.other.length,
        total: Object.values(blockedResources).reduce((sum, arr) => sum + arr.length, 0)
      };
      
      if (summary.total > 0) {
        debugLog('BLOCKED-SUMMARY', 'Summary of blocked resources', summary);
        
        if (summary.firebase > 0) {
          debugLog('FIREBASE-SUMMARY', `${summary.firebase} Firebase resources blocked`, blockedResources.firebase);
        }
      }
    }, 30000); // Log summary every 30 seconds
  }
})();
