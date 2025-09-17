/**
 * Main application component for the Architecture Generator.
 * Modern, streamlined interface focused on chat and visual architecture building.
 */
import { useEffect, useRef, useState } from "react";
import ErrorBoundary from "./console/ErrorBoundary";
import InteractiveCanvas from "./ui/InteractiveCanvas";
import { ViewModeProvider } from "../contexts/ViewModeContext";
import { elkGraphDescription, agentInstruction } from "../realtime/agentConfig";
import { RtcClient } from "../realtime/RtcClient";
// Import test functions to make them available in console
import "../utils/testIconFallback";
import "../utils/testArchitectureSearch";

// Model configuration
const MODEL_CONFIG = {
  name: "gpt-4o-realtime-preview-2024-12-17",
  apiEndpoint: "https://api.openai.com/v1/realtime"
};

export default function App() {
  // State management
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isAgentReady, setIsAgentReady] = useState(false);
  const [events, setEvents] = useState([]);

  const rtcClientRef = useRef(null);

  const startSession = () => {
    if (isConnecting || isSessionActive) return;
    
    setIsConnecting(true);
    
    try {
      rtcClientRef.current = new RtcClient({
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        model: MODEL_CONFIG.name,
        endpoint: MODEL_CONFIG.apiEndpoint,
        onMessage: (event) => {
          setEvents(prev => [...prev, event]);
          
          if (event.type === 'session.created') {
            setIsSessionActive(true);
            setIsConnecting(false);
          }
          
          if (event.type === 'session.ready') {
            setIsAgentReady(true);
          }
          
          if (event.type === 'session.error') {
            console.error('Session error:', event);
            setIsConnecting(false);
            setIsSessionActive(false);
            setIsAgentReady(false);
          }
        },
        onClose: () => {
          setIsSessionActive(false);
          setIsConnecting(false);
          setIsAgentReady(false);
        },
        onError: (error) => {
          console.error('RTC Client error:', error);
          setIsConnecting(false);
          setIsSessionActive(false);
          setIsAgentReady(false);
        }
      });

      rtcClientRef.current.connect();
    } catch (error) {
      console.error('Failed to start session:', error);
      setIsConnecting(false);
    }
  };

  const stopSession = () => {
    if (rtcClientRef.current) {
      rtcClientRef.current.disconnect();
      rtcClientRef.current = null;
    }
    setIsSessionActive(false);
    setIsConnecting(false);
    setIsAgentReady(false);
    setEvents([]);
  };

  const sendClientEvent = (event) => {
    if (rtcClientRef.current && isSessionActive) {
      rtcClientRef.current.sendEvent(event);
    }
  };

  const sendTextMessage = (text) => {
    if (rtcClientRef.current && isSessionActive) {
      const messageEvent = {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'text', text }]
        }
      };
      rtcClientRef.current.sendEvent(messageEvent);
      
      // Trigger response generation
      rtcClientRef.current.sendEvent({ type: 'response.create' });
    }
  };

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => stopSession(); // Auto-cleanup on component unmount
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden">
      {/* Full-screen modern interface */}
      <ErrorBoundary>
        <ViewModeProvider fallbackMode="auth">
          <InteractiveCanvas
            isSessionActive={isSessionActive}
            isConnecting={isConnecting}
            isAgentReady={isAgentReady}
            startSession={startSession}
            stopSession={stopSession}
            sendTextMessage={sendTextMessage}
            sendClientEvent={sendClientEvent}
            events={events}
          />
        </ViewModeProvider>
      </ErrorBoundary>
    </div>
  );
}

