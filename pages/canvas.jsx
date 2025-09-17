/**
 * Canvas View Route (Anonymous/Public Mode)
 * Canvas without authentication - for public sharing and anonymous use
 */
import React from 'react';
import { ApiEndpointProvider } from '../client/contexts/ApiEndpointContext';
import { ViewModeProvider } from '../client/contexts/ViewModeContext';
import InteractiveCanvas from '../client/components/ui/InteractiveCanvas';

export default function CanvasPage() {
  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      <ApiEndpointProvider>
        <ViewModeProvider fallbackMode="canvas">
          <InteractiveCanvas 
            isPublicMode={true}
            isSessionActive={false}
            isConnecting={false}
            isAgentReady={false}
            startSession={() => {}}
            stopSession={() => {}}
            sendTextMessage={() => {}}
            sendClientEvent={() => {}}
            events={[]}
          />
        </ViewModeProvider>
      </ApiEndpointProvider>
    </div>
  );
}
