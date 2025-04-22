export interface ChatBoxProps {
  onSubmit: (message: string) => void;
  isSessionActive?: boolean;
  onStartSession?: () => void;
  onStopSession?: () => void;
}

export interface Message {
  id: string;
  content: string;
  sender: "user" | "assistant";
  type?: "text" | "radio-question" | "checkbox-question";
  options?: { id: string; text: string }[];
  question?: string;
}

export interface ChatWindowProps {
  messages: Message[];
}

export interface InteractiveCanvasProps {
  isSessionActive?: boolean;
  startSession?: () => void;
  stopSession?: () => void;
  sendTextMessage?: (message: string) => void;
  sendClientEvent?: (message: any) => void;
  events?: any[]; // Add events from the server
} 