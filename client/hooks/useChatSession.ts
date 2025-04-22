import { useState, useCallback, useRef } from 'react';
import { Message } from '../types/chat';

interface UseChatSessionProps {
  isSessionActive: boolean;
  sendTextMessage?: (message: string) => void;
  sendClientEvent?: (event: any) => void;
  events?: any[];
}

export const useChatSession = ({
  isSessionActive,
  sendTextMessage,
  sendClientEvent,
  events = []
}: UseChatSessionProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [messageSendStatus, setMessageSendStatus] = useState<{
    sending: boolean;
    retrying: boolean;
    retryCount: number;
    lastError: Error | null;
  }>({
    sending: false,
    retrying: false,
    retryCount: 0,
    lastError: null
  });
  const initSentRef = useRef(false);

  // Safe wrapper for sending client events
  const safeSendClientEvent = useCallback((event: any) => {
    if (sendClientEvent) {
      setMessageSendStatus(prev => ({ ...prev, sending: true }));
      try {
        sendClientEvent(event);
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
    }
  }, [sendClientEvent]);

  // Handle chat submission
  const handleChatSubmit = useCallback((message: string) => {
    // Add the user message to the UI immediately
    const newMessage: Message = {
      id: Date.now().toString(),
      content: message,
      sender: "user",
    };
    
    setMessages((prev) => [...prev, newMessage]);
    
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
        setMessages((prev) => [
          ...prev, 
          { 
            id: `system-${Date.now()}`, 
            content: "Please start a session to chat with the AI.", 
            sender: "assistant" 
          }
        ]);
      }, 500);
    }
  }, [isSessionActive, sendTextMessage]);

  // Process events from the server
  const processEvents = useCallback(() => {
    if (!isSessionActive || !events || events.length === 0) return;

    // Handle text messages from the assistant
    const latestServerEvent = events
      .filter(event => 
        event.type === 'response.delta' && 
        event.delta?.type === 'message' && 
        event.delta?.content?.[0]?.type === 'text'
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
    if (latestServerEvent) {
      // Extract text from the event
      const text = latestServerEvent.delta.content[0].text;
      
      // Check if we already have this response
      const existingMessage = messages.find(msg => 
        msg.sender === 'assistant' && 
        msg.id === latestServerEvent.event_id
      );
      
      if (existingMessage) {
        // Update existing message
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            msg.id === latestServerEvent.event_id 
              ? { ...msg, content: text } 
              : msg
          )
        );
      } else {
        // Add new message
        setMessages(prevMessages => [
          ...prevMessages, 
          {
            id: latestServerEvent.event_id,
            content: text,
            sender: 'assistant'
          }
        ]);
      }
    }
  }, [events, isSessionActive, messages]);

  return {
    messages,
    isSending,
    messageSendStatus,
    initSentRef,
    handleChatSubmit,
    processEvents,
    safeSendClientEvent
  };
}; 