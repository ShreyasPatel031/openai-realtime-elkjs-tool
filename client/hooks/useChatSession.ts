import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Message } from '../types/chat';
import { chunkTools } from '../utils/splitTools';
import { sendEventWithAutoChunk } from '../utils/eventSender';
import { sendFunctionResult } from '../utils/sendFunctionResult';
import { initSession } from '../realtime/initSession';
import { handleFunctionCall } from '../realtime/handleFunctionCall';
import { safeSend } from '../realtime/safeSend';
import { latestAssistantText, functionCallEvents } from '../realtime/eventSelectors';
import { useSessionLifecycle } from './useSessionLifecycle';
import { ClientEvent, ResponseDeltaEvent, MessageDelta, TextContent } from '../realtime/types';

// Type guard to ensure text content is valid
function isValidTextContent(content: any): content is TextContent {
  return content && content.type === 'text' && typeof content.text === 'string';
}

interface UseChatSessionProps {
  isSessionActive: boolean;
  sendTextMessage?: (message: string) => void;
  sendClientEvent?: (event: any) => void;
  events?: any[];
  elkGraph?: any;
  setElkGraph?: (graph: any) => void;
  elkGraphDescription?: string;
  agentInstruction?: string;
  // For use with mutations
  addNode?: (nodeName: string, parentId: string, graph: any, data?: { label?: string; icon?: string }) => any;
  deleteNode?: (nodeId: string, graph: any) => any;
  moveNode?: (nodeId: string, newParentId: string, graph: any) => any;
  addEdge?: (edgeId: string, sourceId: string, targetId: string, graph: any) => any;
  deleteEdge?: (edgeId: string, graph: any) => any;
  groupNodes?: (nodeIds: string[], parentId: string, groupId: string, graph: any, style?: any) => any;
  removeGroup?: (groupId: string, graph: any) => any;
  batchUpdate?: (operations: any[], graph: any) => any;
  process_user_requirements?: () => string;
}

export const useChatSession = ({
  isSessionActive,
  sendTextMessage,
  sendClientEvent,
  events,
  elkGraph,
  setElkGraph,
  elkGraphDescription,
  agentInstruction,
  addNode,
  deleteNode,
  moveNode,
  addEdge,
  deleteEdge,
  groupNodes,
  removeGroup,
  batchUpdate,
  process_user_requirements
}: UseChatSessionProps) => {
  // Use a Map as the single source of truth for messages
  const messagesMap = useRef<Map<string, Message>>(new Map());
  const processed = useRef<Set<string>>(new Set());
  const initSent = useRef(false);
  const lastSessionId = useRef<string | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0);

  // Reset initialization state when session becomes inactive
  useEffect(() => {
    if (!isSessionActive) {
      initSent.current = false;
      lastSessionId.current = null;
    }
  }, [isSessionActive]);

  // Derive messages array from Map
  const messages = useMemo(() => 
    Array.from(messagesMap.current.values()),
    [forceUpdate]
  );

  // Force update function to trigger re-render when messages change
  const triggerUpdate = useCallback(() => {
    setForceUpdate(prev => prev + 1);
  }, []);

  // Listen for custom chat events
  useEffect(() => {
    const handleAddChatMessage = (event: CustomEvent) => {
      const { message } = event.detail;

      
      // Add message to the Map
      messagesMap.current.set(message.id, message);
      triggerUpdate();
    };

    // Add event listener for custom chat messages
    document.addEventListener('addChatMessage', handleAddChatMessage as EventListener);

    return () => {
      document.removeEventListener('addChatMessage', handleAddChatMessage as EventListener);
    };
  }, [triggerUpdate]);

  // Safe wrapper for sending client events
  const safeSendClientEvent = useCallback((event: ClientEvent) => {
    if (sendClientEvent) {
      sendClientEvent(event);
    }
  }, [sendClientEvent]);

  // Process events from the server
  const processEvents = useCallback(() => {
    if (!isSessionActive || !events || events.length === 0) return;

    // Handle text messages from the assistant
    const latestServerEvent = latestAssistantText(events);
    
    if (latestServerEvent) {
      // Extract text from the event
      const delta = latestServerEvent.delta as MessageDelta;
      const content = delta.content[0];
      
      if (isValidTextContent(content)) {
        const messageId = latestServerEvent.event_id;
        
        // Update or add message in the Map
        messagesMap.current.set(messageId, {
          id: messageId,
          content: content.text!, // Non-null assertion since we know it's defined after type guard
          sender: 'assistant'
        });
        triggerUpdate();
      }
    }

    // Log function calls from the agent
    const functionCalls = functionCallEvents(events);

    if (functionCalls.length > 0) {
      functionCalls.forEach(call => {
        // each response.done.output entry has its own id
        const id = call.id ?? JSON.stringify(call);      // fallback if no id field
        if (processed.current.has(id)) return;      // ← already handled
        processed.current.add(id);                  // mark as processed

        const { name: functionName, arguments: functionArgsStr, result } = call;

        // Parse function arguments if they're a string
        let functionArgs;
        try {
          functionArgs = typeof functionArgsStr === 'string' ? JSON.parse(functionArgsStr) : functionArgsStr || {};
        } catch (e) {
          console.error(`❌ Failed to parse arguments for ${functionName}:`, e);
          console.error(`❌ Raw function arguments string:`, functionArgsStr);
          console.error(`❌ String length:`, typeof functionArgsStr === 'string' ? functionArgsStr.length : 'N/A');
          
          // Try to find the problematic part around position 508
          if (typeof functionArgsStr === 'string' && functionArgsStr.length > 500) {
            const start = Math.max(0, 500 - 50);
            const end = Math.min(functionArgsStr.length, 520);
            console.error(`❌ Problematic section (chars ${start}-${end}):`, functionArgsStr.substring(start, end));
          }
          
          if (sendClientEvent) {
            sendClientEvent({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: call.call_id,
                output: JSON.stringify({ 
                  error: "Failed to parse function arguments", 
                  details: e instanceof Error ? e.message : 'Unknown parse error',
                  raw_args: typeof functionArgsStr === 'string' ? functionArgsStr.substring(0, 200) + '...' : functionArgsStr
                })
              }
            });
          }
          return;
        }

        // Simplified console logging for function calls - just show function name
        console.log(`🔧 Function call: ${functionName}`);
        
        // Handle the function call
        if (elkGraph && setElkGraph) {
          handleFunctionCall(call, {
            elkGraph,
            setElkGraph,
            mutations: {
              addNode: addNode || (() => elkGraph),
              deleteNode: deleteNode || (() => elkGraph),
              moveNode: moveNode || (() => elkGraph),
              addEdge: addEdge || (() => elkGraph),
              deleteEdge: deleteEdge || (() => elkGraph),
              groupNodes: groupNodes || (() => elkGraph),
              removeGroup: removeGroup || (() => elkGraph),
              batchUpdate: batchUpdate || (() => elkGraph),
              process_user_requirements: process_user_requirements
            },
            safeSend: safeSendClientEvent
          });
        }
      });
    }
  }, [isSessionActive, events, elkGraph, setElkGraph, addNode, deleteNode, moveNode, addEdge, deleteEdge, groupNodes, removeGroup, batchUpdate, process_user_requirements, safeSendClientEvent, triggerUpdate]);

  // Initialize session with tool definitions
  useEffect(() => {
    if (!isSessionActive) {
      // Reset both guards when session becomes inactive
      initSent.current = false;
      lastSessionId.current = null;
      return;
    }

    // Look for the latest session.created
    const created = events?.find(e => e.type === "session.created");
    if (!created) {
      console.log("⏳ Waiting for session.created event...");
      return;
    }

    // Skip if this is the same session we've already initialized
    if (created.session.id === lastSessionId.current) {
      console.log("ℹ️ Session already initialized:", created.session.id);
      return;
    }

    console.log("🚀 Initializing new session:", created.session.id);
    const ok = initSession(events, safeSendClientEvent, elkGraphDescription || '');
    
    // Update both guards for this session
    lastSessionId.current = created.session.id;
    initSent.current = true;

    if (ok) {
      console.log("✅ Session initialization complete");
    } else {
      console.log("ℹ️ Session was already globally initialized – skipping further logs");
    }
  }, [isSessionActive, events, safeSendClientEvent, elkGraphDescription]);

  // Handle chat submission
  const handleChatSubmit = useCallback(async (message: string) => {
    if (!message.trim()) return;

    const messageId = crypto.randomUUID();
    const newMessage: Message = {
      id: messageId,
      content: message,
      sender: 'user'
    };

    // Add to Map
    messagesMap.current.set(messageId, newMessage);
    triggerUpdate();
    
    // If there's a session, send the message to the AI
    if (isSessionActive && sendTextMessage) {
      try {
        await sendTextMessage(message);
      } catch (error) {
        console.error('Failed to send message:', error);
        // Add error message to Map
        messagesMap.current.set(`error-${messageId}`, {
          id: `error-${messageId}`,
          content: 'Failed to send message. Please try again.',
          sender: "assistant"
        });
        triggerUpdate();
      }
    }
  }, [isSessionActive, sendTextMessage, triggerUpdate]);

  // Clear messages when session becomes inactive
  useEffect(() => {
    if (!isSessionActive) {
      messagesMap.current.clear();
      triggerUpdate();
    }
  }, [isSessionActive, triggerUpdate]);

  return {
    messages,
    isSending: false,
    messageSendStatus: 'idle',
    handleChatSubmit,
    processEvents,
    safeSendClientEvent,
    initSentRef: initSent,
    processedCalls: processed
  };
}; 