// Event base types
export type EventType = 
  | 'session.created'
  | 'session.update'
  | 'conversation.item.create'
  | 'response.delta'
  | 'response.done'
  | 'response.create';

// Content types
export interface TextContent {
  type: 'text';
  text: string;
}

export interface InputTextContent {
  type: 'input_text';
  text: string;
}

export type MessageContent = TextContent | InputTextContent;

// Message types
export interface Message {
  type: 'message';
  role: 'user' | 'assistant' | 'system';
  content: MessageContent[];
}

export interface FunctionCallOutput {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

// Function call types
export interface FunctionCall {
  id?: string;
  call_id: string;
  name: string;
  arguments: string | Record<string, any>;
  result?: any;
}

// Session types
export interface SessionConfig {
  language?: string;
  temperature?: number;
  model?: string;
  instructions?: string;
  tools?: any[];
  tool_choice?: 'auto' | 'none';
}

// Delta types
export interface MessageDelta {
  type: 'message';
  content: MessageContent[];
}

export interface FunctionCallDelta {
  type: 'function_call';
  id?: string;
  call_id: string;
  name: string;
  arguments: string | Record<string, any>;
}

export type DeltaType = MessageDelta | FunctionCallDelta;

// Event interfaces
export interface SessionCreatedEvent {
  type: 'session.created';
  timestamp: string;
}

export interface SessionUpdateEvent {
  type: 'session.update';
  session: Partial<SessionConfig>;
}

export interface ConversationItemEvent {
  type: 'conversation.item.create';
  item: Message | FunctionCallOutput;
}

export interface ResponseDeltaEvent {
  type: 'response.delta';
  event_id: string;
  timestamp: string;
  delta: DeltaType;
}

export interface ResponseDoneEvent {
  type: 'response.done';
  timestamp: string;
  response: {
    output: (Message | FunctionCall)[];
  };
}

export interface ResponseCreateEvent {
  type: 'response.create';
}

// Union type for all events
export type ClientEvent =
  | SessionCreatedEvent
  | SessionUpdateEvent
  | ConversationItemEvent
  | ResponseDeltaEvent
  | ResponseDoneEvent
  | ResponseCreateEvent;

// Status types
export interface SendStatus {
  sending: boolean;
  retrying: boolean;
  retryCount: number;
  lastError: Error | null;
}

// Callback types
export type EventCallback = (event: ClientEvent) => void; 