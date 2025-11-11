/**
 * Main application component for the Architecture Generator.
 * Modern, streamlined interface focused on chat and visual architecture building.
 */
import { useEffect, useRef, useState } from "react";
import ErrorBoundary from "./console/ErrorBoundary";
import InteractiveCanvas from "./ui/InteractiveCanvas";
import RightPanelChat from "./chat/RightPanelChat";
import { ViewModeProvider, useViewMode } from "../contexts/ViewModeContext";
import { NodeStyleProvider } from "../contexts/NodeStyleContext";
import EmbedView from "./views/EmbedView";
import CanvasView from "./views/CanvasView";
import AuthView from "./views/AuthView";
// Import test functions to make them available in console
import "../utils/testIconFallback";
import "../utils/testArchitectureSearch";


// Inner component that has access to ViewMode context
function AppContent() {
  const { config } = useViewMode();
  
  // Simple state management for chat
  const [isSessionActive, setIsSessionActive] = useState(true); // Always active
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAgentReady, setIsAgentReady] = useState(true); // Always ready
  
  // Right panel collapse state
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)

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
          {config.mode === 'embed' && (
            <EmbedView
              isSessionActive={isSessionActive}
              isConnecting={isConnecting}
              isAgentReady={isAgentReady}
              startSession={startSession}
              stopSession={stopSession}
              sendTextMessage={sendTextMessage}
              sendClientEvent={sendClientEvent}
              events={[]}
              rightPanelCollapsed={rightPanelCollapsed}
            />
          )}
          {config.mode === 'canvas' && (
            <CanvasView
              isSessionActive={isSessionActive}
              isConnecting={isConnecting}
              isAgentReady={isAgentReady}
              startSession={startSession}
              stopSession={stopSession}
              sendTextMessage={sendTextMessage}
              sendClientEvent={sendClientEvent}
              events={[]}
              rightPanelCollapsed={rightPanelCollapsed}
            />
          )}
          {config.mode === 'auth' && (
            <AuthView
              isSessionActive={isSessionActive}
              isConnecting={isConnecting}
              isAgentReady={isAgentReady}
              startSession={startSession}
              stopSession={stopSession}
              sendTextMessage={sendTextMessage}
              sendClientEvent={sendClientEvent}
              events={[]}
              rightPanelCollapsed={rightPanelCollapsed}
            />
          )}
        </ErrorBoundary>
      </div>
      
      {/* Right Panel - Conditionally shown based on ViewMode config */}
      {config.showChatPanel && (
        <RightPanelChat 
          isCollapsed={rightPanelCollapsed}
          onToggleCollapse={() => setRightPanelCollapsed(!rightPanelCollapsed)}
          currentGraph={null} // TODO: Pass actual graph from InteractiveCanvas
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ViewModeProvider fallbackMode="auth">
      <NodeStyleProvider>
      <AppContent />
      </NodeStyleProvider>
    </ViewModeProvider>
  );
}

