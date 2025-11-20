/**
 * Authenticated View Route  
 * Full authenticated experience with Firebase auth and architecture management
 */
import React from 'react';
import { ViewModeProvider } from '../client/contexts/ViewModeContext';
import { CanvasAdapterProvider } from '../client/core/renderer/CanvasAdapterProvider';
import App from '../client/components/App';

export default function AuthPage() {
  return (
    <ViewModeProvider fallbackMode="auth">
      <CanvasAdapterProvider>
        <App />
      </CanvasAdapterProvider>
    </ViewModeProvider>
  );
}
