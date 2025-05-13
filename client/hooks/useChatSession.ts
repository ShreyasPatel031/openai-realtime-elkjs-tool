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
  addEdge?: (edgeId: string, containerId: string | null, sourceId: string, targetId: string, graph: any) => any;
  deleteEdge?: (edgeId: string, graph: any) => any;
  groupNodes?: (nodeIds: string[], parentId: string, groupId: string, graph: any) => any;
  removeGroup?: (groupId: string, graph: any) => any;
  batchUpdate?: (operations: Array<{name: string, args: any}>, graph: any) => any;
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
  batchUpdate
}: UseChatSessionProps) => {
  // Use a Map as the single source of truth for messages
  const messagesMap = useRef<Map<string, Message>>(new Map());
  const processed = useRef<Set<string>>(new Set());
  const initSent = useRef(false);

  // Derive messages array from Map
  const messages = useMemo(() => 
    Array.from(messagesMap.current.values()),
    [messagesMap.current]
  );

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
          if (sendClientEvent) {
            sendClientEvent({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: call.call_id,
                output: JSON.stringify({ error: "Failed to parse function arguments" })
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
              batchUpdate: batchUpdate || (() => elkGraph)
            },
            safeSend: safeSendClientEvent
          });
        }
      });
    }
  }, [isSessionActive, events, elkGraph, setElkGraph, addNode, deleteNode, moveNode, addEdge, deleteEdge, groupNodes, removeGroup, batchUpdate, safeSendClientEvent]);

  // Initialize session with tool definitions
  useEffect(() => {
    // Static variable to track log suppression across renders
    const debugLogging = false; // Set to true only when debugging initialization issues
    
    if (initSent.current) {
      // Only log this on first occurrence
      if (debugLogging) console.log("✅ Session already initialized, skipping");
      return; // already done
    }
    
    if (!isSessionActive) {
      // Skip initialization logging when session is inactive
      return; // don't initialize if session is not active
    }
    
    if (!events || events.length === 0) {
      if (debugLogging) console.log("⏳ No events yet, waiting for session.created");
      return;
    }

    // Check specifically for a session.created event
    const sessionCreatedEvent = events.find(e => e.type === "session.created");
    if (!sessionCreatedEvent) {
      if (debugLogging) console.log("⏳ No session.created event found, waiting...");
      return;
    }

    console.log("🚀 Initializing session with elkGraphDescription");
    
    // Use the initSession helper to initialize the session
    const sent = initSession(events, safeSendClientEvent, elkGraphDescription || '');
    if (sent) {
      console.log("✅ Session initialization complete");
      initSent.current = true;
    } else {
      console.warn("⚠️ Session initialization failed");
    }
    
  }, [events, isSessionActive, safeSendClientEvent, elkGraphDescription, initSent]);

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
      }
    }
  }, [isSessionActive, sendTextMessage]);

  // Clear messages when session becomes inactive
  useEffect(() => {
    if (!isSessionActive) {
      messagesMap.current.clear();
    }
  }, [isSessionActive]);

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