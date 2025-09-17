/**
 * Authenticated View Route  
 * Full authenticated experience with Firebase auth and architecture management
 */
import React from 'react';
import { ViewModeProvider } from '../client/contexts/ViewModeContext';
import App from '../client/components/App';

export default function AuthPage() {
  return (
    <ViewModeProvider fallbackMode="auth">
      <App />
    </ViewModeProvider>
  );
}
