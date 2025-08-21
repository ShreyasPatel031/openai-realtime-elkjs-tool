export interface ChatBoxProps {
  onSubmit: (message: string) => void;
  onProcessStart?: () => void;
  isSessionActive?: boolean;
  isConnecting?: boolean;
  isAgentReady?: boolean;
  onStartSession?: () => void;
  onStopSession?: () => void;
  onTriggerReasoning?: () => void;
  isDisabled?: boolean;
}

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant' | 'system';
  type?: 'radio-question' | 'checkbox-question' | 'reasoning' | 'function-calling' | 'process-complete';
  question?: string;
  options?: Array<{
    id: string;
    text: string;
  }>;
  // New fields for streaming messages
  isStreaming?: boolean;
  streamedContent?: string;
  isDropdownOpen?: boolean;
  animationType?: 'reasoning' | 'function-calling';
}

export interface ChatWindowProps {
  messages: Message[];
  isMinimized?: boolean;
}

export interface InteractiveCanvasProps {
  isSessionActive?: boolean;
  isConnecting?: boolean;
  isAgentReady?: boolean;
  startSession?: () => void;
  stopSession?: () => void;
  sendTextMessage?: (message: string) => void;
  sendClientEvent?: (message: any) => void;
  events?: any[]; // Add events from the server
  apiEndpoint?: string; // API endpoint for backend calls
}

export interface ElkLabel {
  text: string;
  x?: number;
  y?: number;
} 