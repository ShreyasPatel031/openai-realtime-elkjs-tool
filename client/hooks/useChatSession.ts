import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Message } from '../types/chat';
import { chunkTools } from '../utils/splitTools';
import { sendEventWithAutoChunk } from '../utils/eventSender';
import { sendFunctionResult } from '../utils/sendFunctionResult';
import { initSession } from '../realtime/initSession';
import { handleFunctionCall } from '../realtime/handleFunctionCall';
import { safeSend, SendStatus } from '../realtime/safeSend';
import { latestAssistantText, functionCallEvents } from '../realtime/eventSelectors';
import { useSessionLifecycle } from './useSessionLifecycle';

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
  addNode?: (nodeName: string, parentId: string, graph: any) => any;
  deleteNode?: (nodeId: string, graph: any) => any;
  moveNode?: (nodeId: string, newParentId: string, graph: any) => any;
  addEdge?: (edgeId: string, containerId: string | null, sourceId: string, targetId: string, graph: any) => any;
  deleteEdge?: (edgeId: string, graph: any) => any;
  groupNodes?: (nodeIds: string[], parentId: string, groupId: string, graph: any) => any;
  removeGroup?: (groupId: string, graph: any) => any;
}

export const useChatSession = ({
  isSessionActive,
  sendTextMessage,
  sendClientEvent,
  events = [],
  elkGraph,
  setElkGraph,
  elkGraphDescription = '',
  agentInstruction = '',
  addNode,
  deleteNode,
  moveNode,
  addEdge,
  deleteEdge,
  groupNodes,
  removeGroup
}: UseChatSessionProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [messageSendStatus, setMessageSendStatus] = useState<SendStatus>({
    sending: false,
    retrying: false,
    retryCount: 0,
    lastError: null
  });
  const messagesMap = useRef<Map<string, Message>>(new Map());

  // Safe wrapper for sending client events
  const safeSendClientEvent = useMemo(
    () => safeSend(sendClientEvent, setMessageSendStatus),
    [sendClientEvent]
  );

  // Handle session lifecycle
  const { initSent, processed } = useSessionLifecycle(events, safeSendClientEvent);

  // Process events from the server
  const processEvents = useCallback(() => {
    if (!isSessionActive || !events || events.length === 0) return;

    // Handle text messages from the assistant
    const latestServerEvent = latestAssistantText(events);
    
    if (latestServerEvent) {
      // Extract text from the event
      const text = latestServerEvent.delta.content[0].text;
      const messageId = latestServerEvent.event_id;
      
      // Update or add message in the Map
      messagesMap.current.set(messageId, {
        id: messageId,
        content: text,
        sender: 'assistant'
      });

      // Update React state with array of messages
      setMessages(Array.from(messagesMap.current.values()));
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
          functionArgs = typeof functionArgsStr === 'string' ? JSON.parse(functionArgsStr) : functionArgsStr;
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

        // Detailed console logging for function calls
        console.log(`🔧 Agent called function: ${functionName}`);
        console.log(`📝 Arguments:`, JSON.stringify(functionArgs, null, 2));
        if (result) console.log(`✅ Result:`, result);
        
        // Add function call to messages Map
        messagesMap.current.set(id, {
          id,
          sender: "system",
          content: `🔧 Function: ${functionName}\n📝 Args: ${JSON.stringify(functionArgs, null, 2)}${result ? `\n✅ Result: ${JSON.stringify(result, null, 2)}` : ''}`
        });

        // Update React state
        setMessages(Array.from(messagesMap.current.values()));

        // Make sure setElkGraph is defined
        if (setElkGraph && elkGraph) {
          // Use the handleFunctionCall helper to process the function call
          handleFunctionCall(call, {
            elkGraph,
            setElkGraph,
            mutations: { addNode, deleteNode, moveNode, addEdge, deleteEdge, groupNodes, removeGroup },
            safeSend: safeSendClientEvent
          });
        }
      });
    }
  }, [events, isSessionActive, elkGraph, setElkGraph, addNode, deleteNode, moveNode, addEdge, deleteEdge, groupNodes, removeGroup, agentInstruction, safeSendClientEvent, processed]);

  // Initialize session with tool definitions
  useEffect(() => {
    if (initSent.current) return; // already done
    if (!isSessionActive) return; // don't initialize if session is not active
    if (!events || events.length === 0) return;

    // Use the initSession helper to initialize the session
    const sent = initSession(events, safeSendClientEvent, elkGraphDescription);
    if (sent) initSent.current = true;
    
  }, [events, isSessionActive, safeSendClientEvent, elkGraphDescription, initSent]);

  // Handle chat submission
  const handleChatSubmit = useCallback((message: string) => {
    // Add the user message to the UI immediately
    const messageId = Date.now().toString();
    const newMessage: Message = {
      id: messageId,
      content: message,
      sender: "user",
    };
    
    // Add to Map and update state
    messagesMap.current.set(messageId, newMessage);
    setMessages(Array.from(messagesMap.current.values()));
    
    // If there's a session, send the message to the AI
    if (isSessionActive && sendTextMessage) {
      setMessageSendStatus(prev => ({ ...prev, sending: true }));
      try {
        sendTextMessage(message);
        setMessageSendStatus(prev => ({ ...prev, sending: false, retryCount: 0, lastError: null }));
      } catch (error) {
        setMessageSendStatus(prev => ({ 
          ...prev, 
          sending: false, 
          retrying: true, 
          retryCount: prev.retryCount + 1,
          lastError: error as Error
        }));
      }
    } else {
      // If no session, show a message prompting to start a session
      setTimeout(() => {
        const systemMessageId = `system-${Date.now()}`;
        messagesMap.current.set(systemMessageId, {
          id: systemMessageId,
          content: "Please start a session to chat with the AI.",
          sender: "assistant"
        });
        setMessages(Array.from(messagesMap.current.values()));
      }, 500);
    }
  }, [isSessionActive, sendTextMessage]);

  // Reset state when session stops
  useEffect(() => {
    if (!isSessionActive) {
      messagesMap.current.clear();
      setMessages([]);
    }
  }, [isSessionActive]);

  return {
    messages,
    isSending,
    messageSendStatus,
    handleChatSubmit,
    processEvents,
    safeSendClientEvent
  };
}; 