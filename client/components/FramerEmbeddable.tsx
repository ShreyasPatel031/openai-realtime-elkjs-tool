import React, { useState } from 'react';
import InteractiveCanvas from './ui/InteractiveCanvas';
import { ApiEndpointProvider } from '../contexts/ApiEndpointContext';
import { ViewModeProvider } from '../contexts/ViewModeContext';

interface FramerEmbeddableProps {
  apiEndpoint?: string;
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}

function FramerEmbeddable({
  apiEndpoint = 'https://archgen-ecru.vercel.app',
  width = '100%',
  height = '800px',
  style = {}
}: FramerEmbeddableProps) {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState<any[]>([]);

  const startSession = () => {
    setIsSessionActive(true);
  };

  const stopSession = () => {
    setIsSessionActive(false);
  };

  const sendTextMessage = (message: string) => {
    console.log('Sending message:', message);
  };

  const sendClientEvent = (event: any) => {
    console.log('Sending event:', event);
  };

  const containerStyle: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    ...style
  };

  return (
    <ApiEndpointProvider apiEndpoint={apiEndpoint}>
      <ViewModeProvider fallbackMode="framer">
        <div style={containerStyle}>
          <InteractiveCanvas
            isSessionActive={isSessionActive}
            startSession={startSession}
            stopSession={stopSession}
            sendTextMessage={sendTextMessage}
            sendClientEvent={sendClientEvent}
            events={events}
            apiEndpoint={apiEndpoint}
            isPublicMode={true}
          />
        </div>
      </ViewModeProvider>
    </ApiEndpointProvider>
  );
}

// Framer property controls for Code Components
export const FramerEmbeddablePropertyControls = {
  apiEndpoint: {
    type: 'string' as const,
    title: 'API Endpoint',
    defaultValue: 'https://archgen-ecru.vercel.app'
  },
  width: {
    type: 'string' as const,
    title: 'Width',
    defaultValue: '100%'
  },
  height: {
    type: 'string' as const,
    title: 'Height',
    defaultValue: '800px'
  }
}; 

// Export both as default and named for maximum compatibility
export default FramerEmbeddable;
export { FramerEmbeddable }; 