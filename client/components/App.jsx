/**
 * Main application component for the OpenAI Real-time Console.
 * Handles WebRTC connection management, session state, and message handling.
 */
import { useEffect, useRef, useState } from "react";
import logo from "/assets/openai-logomark.svg";
import EventLog from "./console/EventLog";
import SessionControls from "./console/SessionControls";
import ToolPanel from "./ui/ToolPanel";
import ElkTestPage from "./test/ElkTestPage";
import ErrorBoundary from "./console/ErrorBoundary";
import InteractiveCanvas from "./ui/InteractiveCanvas";
import { elkGraphDescription, agentInstruction } from "../realtime/agentConfig";
import { useChatSession } from "../hooks/useChatSession";
import { RtcClient } from "../realtime/RtcClient";

// Model configuration
const MODEL_CONFIG = {
  name: "gpt-4o-realtime-preview-2024-12-17",
  apiEndpoint: "https://api.openai.com/v1/realtime"
};

/**
 * MainContent component - Renders the classic UI layout with tool panel and session controls
 */
function MainContent({ events, isSessionActive, startSession, stopSession, sendClientEvent, sendTextMessage }) {
  return (
    <>
      <section className="absolute top-0 left-0 w-[80%] bottom-0 flex flex-col">
        <section className="flex-1 px-4 overflow-y-auto">
          <ErrorBoundary>
            <ToolPanel
              sendClientEvent={sendClientEvent}
              sendTextMessage={sendTextMessage}
              events={events}
              isSessionActive={isSessionActive}
            />
          </ErrorBoundary>
        </section>
        <section className="h-32 p-4">
          <SessionControls
            startSession={startSession}
            stopSession={stopSession}
            sendClientEvent={sendClientEvent}
            sendTextMessage={sendTextMessage}
            events={events}
            isSessionActive={isSessionActive}
          />
        </section>
      </section>
      <section className="absolute top-0 right-0 w-[20%] bottom-0 p-4 pt-0 overflow-y-auto">
        <ErrorBoundary>
          <EventLog events={events} />
        </ErrorBoundary>
      </section>
    </>
  );
}

export default function App() {
  // State management
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAgentReady, setIsAgentReady] = useState(false);
  const [events, setEvents] = useState([]);
  const [showNewUI, setShowNewUI] = useState(true);

  // RTC client reference
  const rtc = useRef(null);
  
  // Track if we've already logged the communication setup
  const hasLoggedSetup = useRef(false);

  // Get chat session refs
  const { initSentRef, processedCalls } = useChatSession({
    isSessionActive,
    sendTextMessage,
    sendClientEvent,
    events,
    elkGraph: null,
    setElkGraph: () => {},
    elkGraphDescription,
    agentInstruction
  });

  // Monitor events to detect when agent is ready to listen
  useEffect(() => {
    if (!events.length) return;
    
    const latestEvent = events[0]; // Events are in reverse chronological order
    
    // Check for session.created or session.update events indicating agent is ready
    if ((latestEvent.type === 'session.created' || 
        (latestEvent.type === 'session.updated' && latestEvent.session)) && 
        !isAgentReady) {  // Only log if state is changing
      console.log('🤖 Agent is ready to listen');
      setIsAgentReady(true);
      setIsConnecting(false);
    }
    
    // Check for session.update with input_audio_transcription events (means agent heard something)
    if ((latestEvent.type === 'input_audio_buffer.speech_started' || 
        latestEvent.type === 'conversation.item.input_audio_transcription.completed') && 
        !isAgentReady) {  // Only log if state is changing
      console.log('🎤 Agent is actively listening');
      setIsAgentReady(true);
    }
  }, [events, isAgentReady]);

  // Expose real-time agent communication functions to global scope for reasoning agent
  useEffect(() => {
    // Set global references for inter-agent communication
    window.realtimeAgentSendTextMessage = sendTextMessage;
    window.realtimeAgentSendClientEvent = sendClientEvent;
    window.realtimeAgentSessionActive = isSessionActive;
    
    // Cleanup on unmount
    return () => {
      delete window.realtimeAgentSendTextMessage;
      delete window.realtimeAgentSendClientEvent;
      delete window.realtimeAgentSessionActive;
    };
  }, [sendTextMessage, sendClientEvent, isSessionActive]);

  /**
   * Initiates a new WebRTC session with OpenAI's Realtime API
   */
  async function startSession() {
    setIsConnecting(true);
    setIsAgentReady(false);
    
    try {
    // Get a session token for OpenAI Realtime API
    const tokenResponse = await fetch("/token");
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;

    // Create RTC client or reuse existing one
    if (!rtc.current) {
      rtc.current = new RtcClient(event => {
        if (!event.timestamp) {
          event.timestamp = new Date().toLocaleTimeString();
        }
        setEvents(prev => [event, ...prev]);
      });
    }
    
    // Connect the client with model configuration
    await rtc.current.connect(EPHEMERAL_KEY);
    setIsSessionActive(true);
      
      // Note: isConnecting will be set to false when we receive session.created event
    } catch (error) {
      console.error('Failed to start session:', error);
      setIsConnecting(false);
      setIsSessionActive(false);
      setIsAgentReady(false);
    }
  }

  /**
   * Terminates the current WebRTC session
   */
  function stopSession() {
    // Close RTC client if it exists
    if (rtc.current) {
      rtc.current.close();
    }

    // Reset refs if they exist - with better error handling
    if (initSentRef && typeof initSentRef === 'object') {
      console.log("🔄 Resetting initSentRef");
      if (initSentRef.current !== undefined) {
        initSentRef.current = false;
      }
    }
    
    if (processedCalls && typeof processedCalls === 'object') {
      console.log("🔄 Clearing processedCalls");
      if (processedCalls.current !== undefined && typeof processedCalls.current.clear === 'function') {
        processedCalls.current.clear();
      }
    }

    // Reset state and events 
    setEvents([]);
    
    // Update state
    setIsSessionActive(false);
    setIsConnecting(false);
    setIsAgentReady(false);
  }

  /**
   * Sends a message to the model through the WebRTC data channel
   */
  function sendClientEvent(message) {
    if (!rtc.current) return false;
    
    // Add event ID if not present
    if (!message.event_id) {
      message.event_id = crypto.randomUUID();
    }
    
    return rtc.current.send(message);
  }

  /**
   * Sends a text message to the model, handling large messages by chunking
   */
  function sendTextMessage(message) {
    // Split message into chunks of 40000 characters
    const chunks = message.match(/.{1,40000}/gs) || [];
    
    // Send each chunk as a separate message
    chunks.forEach((chunk, index) => {
      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: chunk,
            },
          ],
        },
      });
      
      // Only send response.create after the last chunk
      if (index === chunks.length - 1) {
        sendClientEvent({ type: "response.create" });
      }
    });
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => stopSession(); // Auto-cleanup on component unmount
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {/* Header with logo and connection status */}
      <header className="h-16 bg-gray-100 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src={logo} alt="OpenAI Logo" className="w-8 h-8" />
          <h1 className="text-lg font-medium">OpenAI Real-time Console</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <span className="mr-2">UI Mode:</span>
            <div className="flex items-center bg-gray-200 rounded-lg p-1">
              <button 
                onClick={() => setShowNewUI(false)}
                className={`px-3 py-1 rounded-md ${!showNewUI ? 'bg-white shadow-sm' : 'text-gray-600'}`}
              >
                Classic
              </button>
              <button 
                onClick={() => setShowNewUI(true)}
                className={`px-3 py-1 rounded-md ${showNewUI ? 'bg-white shadow-sm' : 'text-gray-600'}`}
              >
                Modern
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              isConnecting 
                ? "bg-yellow-500 animate-pulse" 
                : isAgentReady 
                  ? "bg-green-500" 
                  : isSessionActive 
                    ? "bg-blue-500" 
                    : "bg-red-500"
            }`}></span>
            <span className="text-sm">
              {isConnecting 
                ? "Connecting..." 
                : isAgentReady 
                  ? "Ready to Listen" 
                  : isSessionActive 
                    ? "Connected" 
                    : "Disconnected"}
            </span>
          </div>
        </div>
      </header>

      {/* Main content area with either modern or classic UI */}
      <main className="flex-grow relative">
        {showNewUI ? (
          <ErrorBoundary>
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
          </ErrorBoundary>
        ) : (
          <MainContent
            events={events}
            isSessionActive={isSessionActive}
            startSession={startSession}
            stopSession={stopSession}
            sendClientEvent={sendClientEvent}
            sendTextMessage={sendTextMessage}
          />
        )}
      </main>
    </div>
  );
}

