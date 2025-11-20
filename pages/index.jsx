/**
 * Root Route - Default landing page
 * Redirects to canvas view for public access with chat functionality
 */
import React from 'react';
import { ApiEndpointProvider } from '../client/contexts/ApiEndpointContext';
import { ViewModeProvider } from '../client/contexts/ViewModeContext';
import { CanvasAdapterProvider } from '../client/core/renderer/CanvasAdapterProvider';
import App from '../client/components/App';

export default function IndexPage() {
  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      <ApiEndpointProvider>
        <ViewModeProvider fallbackMode="canvas">
          <CanvasAdapterProvider>
            <App />
          </CanvasAdapterProvider>
        </ViewModeProvider>
      </ApiEndpointProvider>
    </div>
  );
}
