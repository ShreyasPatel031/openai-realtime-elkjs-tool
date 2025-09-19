/**
 * Main application component for the Architecture Generator.
 * Modern, streamlined interface focused on chat and visual architecture building.
 */
import { useEffect, useRef, useState } from "react";
import ErrorBoundary from "./console/ErrorBoundary";
import InteractiveCanvas from "./ui/InteractiveCanvas";
import RightPanelChat from "./chat/RightPanelChat";
import { ViewModeProvider } from "../contexts/ViewModeContext";
// Import test functions to make them available in console
import "../utils/testIconFallback";
import "../utils/testArchitectureSearch";


export default function App() {
  // Simple state management for chat
  const [isSessionActive, setIsSessionActive] = useState(true); // Always active
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAgentReady, setIsAgentReady] = useState(true); // Always ready

  const startSession = () => {
    // No-op since chat is always available
  };

  const stopSession = () => {
    // No-op since chat is always available
  };

  const sendTextMessage = (text) => {
    console.log('Chat message:', text);
    // This will be handled by the chat component directly
  };

  const sendClientEvent = (event) => {
    console.log('Client event:', event);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex">
      {/* Main Canvas Area */}
      <div className="flex-1 overflow-hidden">
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
              events={[]}
            />
          </ViewModeProvider>
        </ErrorBoundary>
      </div>
      
      {/* Right Panel */}
      <div className="w-[416px] h-full bg-white border-l border-gray-300 flex flex-col">
        <RightPanelChat 
          className="flex-1" 
          sendTextMessage={sendTextMessage}
          startSession={startSession}
          stopSession={stopSession}
          isSessionActive={isSessionActive}
          isConnecting={isConnecting}
          isAgentReady={isAgentReady}
        />
      </div>
    </div>
  );
}

