/**
 * Chat Persistence Utility
 * Handles saving and restoring chat messages between different views
 */

export interface PersistedChatMessage {
  id: string;
  content: string;
  timestamp: number;
  sender: 'user' | 'assistant';
}

const CHAT_STORAGE_KEY = 'atelier_chat_messages';
const CURRENT_CONVERSATION_KEY = 'atelier_current_conversation';
const EMBED_TO_CANVAS_FLAG_KEY = 'atelier_embed_to_canvas';
export const EMBED_PENDING_CHAT_KEY = 'atelier_embed_pending_chat';
export const EMBED_CHAT_BROADCAST_CHANNEL = 'atelier_embed_chat_broadcast';

/**
 * Mark that user is coming from embed view to canvas view (via Edit button)
 */
export function markEmbedToCanvasTransition(): void {
  try {
    localStorage.setItem(EMBED_TO_CANVAS_FLAG_KEY, 'true');
    console.log('🏷️ Marked embed-to-canvas transition');
  } catch (error) {
    console.warn('Failed to mark embed-to-canvas transition:', error);
  }
}

/**
 * Check if user is coming from embed view to canvas view
 */
export function isEmbedToCanvasTransition(): boolean {
  try {
    return localStorage.getItem(EMBED_TO_CANVAS_FLAG_KEY) === 'true';
  } catch (error) {
    console.warn('Failed to check embed-to-canvas transition:', error);
    return false;
  }
}

/**
 * Clear the embed-to-canvas transition flag
 */
export function clearEmbedToCanvasFlag(): void {
  try {
    localStorage.removeItem(EMBED_TO_CANVAS_FLAG_KEY);
    console.log('🧹 Cleared embed-to-canvas transition flag');
  } catch (error) {
    console.warn('Failed to clear embed-to-canvas transition flag:', error);
  }
}

/**
 * Save a chat message to localStorage - only keeps the current conversation
 */
export function saveChatMessage(message: string, sender: 'user' | 'assistant' = 'user'): void {
  try {
    const newMessage: PersistedChatMessage = {
      id: crypto.randomUUID(),
      content: message.trim(),
      timestamp: Date.now(),
      sender
    };

    // For new user messages, start a fresh conversation
    if (sender === 'user') {
      // Clear previous conversation and start with this message
      localStorage.setItem(CURRENT_CONVERSATION_KEY, JSON.stringify([newMessage]));
      console.log('💾 Started new conversation with message:', newMessage);
    } else {
      // For assistant messages, add to current conversation
      const currentConversation = getCurrentConversation();
      const updatedConversation = [...currentConversation, newMessage];
      localStorage.setItem(CURRENT_CONVERSATION_KEY, JSON.stringify(updatedConversation));
      console.log('💾 Added to current conversation:', newMessage);
    }
  } catch (error) {
    console.warn('Failed to save chat message:', error);
  }
}

/**
 * Get the current conversation (last user message + any assistant responses)
 * Filters out incomplete conversations (only user messages without assistant responses)
 */
export function getCurrentConversation(): PersistedChatMessage[] {
  try {
    const stored = localStorage.getItem(CURRENT_CONVERSATION_KEY);
    if (!stored) return [];
    
    const messages = JSON.parse(stored) as PersistedChatMessage[];
    if (!Array.isArray(messages) || messages.length === 0) return [];
    
    // Check if this is an incomplete conversation (only user messages, no assistant responses)
    const hasAssistantMessage = messages.some(msg => msg.sender === 'assistant');
    const lastMessage = messages[messages.length - 1];
    
    // If there's only a user message without any assistant response, clear it (incomplete conversation)
    // This prevents showing example button clicks or abandoned messages on page load
    if (!hasAssistantMessage && lastMessage?.sender === 'user') {
      localStorage.removeItem(CURRENT_CONVERSATION_KEY);
      console.log('🧹 Cleared incomplete conversation (user message without assistant response)');
      return [];
    }
    
    return messages;
  } catch (error) {
    console.warn('Failed to load current conversation:', error);
    return [];
  }
}

/**
 * Get all persisted chat messages - always returns current conversation
 * Chat messages should persist across page refreshes
 */
export function getChatMessages(): PersistedChatMessage[] {
  const messages = getCurrentConversation();
  
  // Always return messages - chat should persist across refreshes
  return messages;
}

/**
 * Get the most recent chat message
 */
export function getLastChatMessage(): PersistedChatMessage | null {
  const messages = getCurrentConversation();
  return messages.length > 0 ? messages[messages.length - 1] : null;
}

/**
 * Clear all persisted chat messages and embed-to-canvas flag
 */
export function clearChatMessages(): void {
  try {
    localStorage.removeItem(CURRENT_CONVERSATION_KEY);
    localStorage.removeItem(CHAT_STORAGE_KEY); // Clear legacy storage too
    localStorage.removeItem(EMBED_TO_CANVAS_FLAG_KEY); // Clear embed-to-canvas flag
    console.log('🗑️ Chat messages and embed-to-canvas flag cleared');
  } catch (error) {
    console.warn('Failed to clear chat messages:', error);
  }
}

/**
 * Save the current chatbox input text (for when user is typing but hasn't submitted)
 */
export function saveChatboxInput(input: string): void {
  try {
    if (input.trim()) {
      localStorage.setItem('atelier_chatbox_input', input.trim());
    } else {
      localStorage.removeItem('atelier_chatbox_input');
    }
  } catch (error) {
    console.warn('Failed to save chatbox input:', error);
  }
}

/**
 * Get the saved chatbox input text
 */
export function getChatboxInput(): string {
  try {
    return localStorage.getItem('atelier_chatbox_input') || '';
  } catch (error) {
    console.warn('Failed to load chatbox input:', error);
    return '';
  }
}

/**
 * Clear the saved chatbox input
 */
export function clearChatboxInput(): void {
  try {
    localStorage.removeItem('atelier_chatbox_input');
  } catch (error) {
    console.warn('Failed to clear chatbox input:', error);
  }
}

/**
 * Start a new conversation (clears current conversation)
 */
export function startNewConversation(): void {
  try {
    localStorage.removeItem(CURRENT_CONVERSATION_KEY);
    // Also clear saved chatbox input
    clearChatboxInput();
    console.log('🆕 Started new conversation');
    
    // Dispatch custom event to notify chat components to refresh
    // Storage events only fire for cross-window/tab changes, not same-window
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chatCleared'));
      console.log('💬 Dispatched chatCleared event from startNewConversation');
    }
  } catch (error) {
    console.warn('Failed to start new conversation:', error);
  }
}

/**
 * Normalize chat messages from various formats to PersistedChatMessage[]
 */
export function normalizeChatMessages(messages: any): PersistedChatMessage[] {
  if (!messages || !Array.isArray(messages)) {
    return [];
  }
  
  return messages.map((msg: any) => {
    if (typeof msg === 'string') {
      // Simple string message - treat as user message
      return {
        id: crypto.randomUUID(),
        content: msg,
        timestamp: Date.now(),
        sender: 'user' as const
      };
    }
    
    // Already in PersistedChatMessage format or similar
    return {
      id: msg.id || crypto.randomUUID(),
      content: msg.content || msg.text || msg.message || String(msg),
      timestamp: msg.timestamp || Date.now(),
      sender: msg.sender === 'assistant' ? 'assistant' : 'user'
    };
  }).filter((msg: PersistedChatMessage) => msg.content && msg.content.trim().length > 0);
}

/**
 * Merge two arrays of chat messages, avoiding duplicates
 */
export function mergeChatMessages(
  existing: PersistedChatMessage[],
  incoming: PersistedChatMessage[]
): PersistedChatMessage[] {
  if (!incoming || incoming.length === 0) {
    return existing;
  }
  
  if (!existing || existing.length === 0) {
    return incoming;
  }
  
  // Create a map of existing messages by ID to avoid duplicates
  const existingMap = new Map<string, PersistedChatMessage>();
  existing.forEach(msg => {
    existingMap.set(msg.id, msg);
  });
  
  // Add incoming messages that don't already exist
  incoming.forEach(msg => {
    if (!existingMap.has(msg.id)) {
      existingMap.set(msg.id, msg);
    }
  });
  
  // Sort by timestamp
  return Array.from(existingMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}
