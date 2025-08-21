/**
 * Chat utilities - simplified for naming + required functions
 */

import { Message } from '../types/chat';

/**
 * Generate chat name from user input and architecture
 */
export async function generateChatName(userPrompt: string, architecture: any): Promise<string> {
  try {
    const nodeCount = countNodes(architecture);
    const edgeCount = countEdges(architecture);
    
    const response = await fetch(`${window.location.origin}/api/generateChatName`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        architecture,
        userPrompt,
        nodeCount,
        edgeCount
      })
    });

    if (response.ok) {
      const data = await response.json();
      const cleanName = (data.name || getFallbackName(userPrompt)).replace(/^["']|["']$/g, ''); // Remove quotes
      return cleanName;
    }
  } catch (error) {
    console.warn('Chat naming API failed:', error);
  }
  
  return getFallbackName(userPrompt);
}

/**
 * Simple fallback name generation
 */
function getFallbackName(userPrompt: string): string {
  if (!userPrompt) return 'New Architecture';
  
  const prompt = userPrompt.toLowerCase();
  if (prompt.includes('microservice')) return 'Microservices Architecture';
  if (prompt.includes('web app')) return 'Web Application';
  if (prompt.includes('api')) return 'API Architecture';
  if (prompt.includes('data')) return 'Data Architecture';
  
  return 'New Architecture';
}

/**
 * Count nodes in architecture
 */
function countNodes(architecture: any): number {
  if (!architecture) return 0;
  let count = architecture.id ? 1 : 0;
  if (architecture.children) {
    count += architecture.children.reduce((sum: number, child: any) => sum + countNodes(child), 0);
  }
  return count;
}

/**
 * Count edges in architecture
 */
function countEdges(architecture: any): number {
  if (!architecture) return 0;
  let count = (architecture.edges || []).length;
  if (architecture.children) {
    count += architecture.children.reduce((sum: number, child: any) => sum + countEdges(child), 0);
  }
  return count;
}

// ========================================
// Required functions for existing imports
// ========================================

/**
 * Add user decision to chat (simplified)
 */
export const addUserDecisionToChat = (decision: string): { success: boolean; message: string } => {
  try {
    const messageId = crypto.randomUUID();
    const systemMessage: Message = {
      id: messageId,
      content: `${decision}`,
      sender: 'system'
    };
    
    const addMessageEvent = new CustomEvent('addChatMessage', {
      detail: { message: systemMessage }
    });
    document.dispatchEvent(addMessageEvent);
    
    return { success: true, message: `Decision recorded: ${decision}` };
  } catch (error) {
    console.error('❌ Error adding user decision to chat:', error);
    return { success: false, message: `Error recording decision: ${error}` };
  }
};

/**
 * Create followup questions in chat (simplified)
 */
export const createFollowupQuestionsToChat = (questions: any[]): { success: boolean; message: string } => {
  try {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return { success: false, message: 'Error: questions parameter must be a non-empty array' };
    }
    
    questions.forEach((question, index) => {
      if (!question || typeof question !== 'object' || !question.text) {
        console.error(`❌ Invalid question at index ${index}:`, question);
        return;
      }
      
      const messageId = crypto.randomUUID();
      const questionMessage: Message = {
        id: messageId,
        content: question.text,
        sender: 'assistant',
        type: question.type === 'multiselect' ? 'checkbox-question' : 'radio-question',
        question: question.text,
        options: (question.options || []).map((option: string, optIndex: number) => ({
          id: `${messageId}_${optIndex}`,
          text: option
        }))
      };
      
      const addQuestionEvent = new CustomEvent('addChatMessage', {
        detail: { message: questionMessage }
      });
      document.dispatchEvent(addQuestionEvent);
    });
    
    return { success: true, message: `Generated ${questions.length} follow-up questions` };
  } catch (error) {
    console.error('❌ Error creating follow-up questions:', error);
    return { success: false, message: `Error creating questions: ${error}` };
  }
};

/**
 * Add process complete message (simplified)
 */
export const addProcessCompleteMessage = (): void => {
  const messageId = crypto.randomUUID();
  const completeMessage: Message = {
    id: messageId,
    content: "Architecture processing complete!",
    sender: 'system',
    type: 'process-complete'
  };
  
  const addMessageEvent = new CustomEvent('addChatMessage', {
    detail: { message: completeMessage }
  });
  document.dispatchEvent(addMessageEvent);
};

/**
 * Close chat window (simplified)
 */
export const closeChatWindow = (): void => {
  // Simple implementation - just log for now
  console.log('📞 Chat window close requested');
};

/**
 * Send architecture complete to realtime agent (simplified)
 */
export const sendArchitectureCompleteToRealtimeAgent = (): void => {
  const globalSendTextMessage = (window as any).realtimeAgentSendTextMessage;
  const isSessionActive = (window as any).realtimeAgentSessionActive;
  
  if (!isSessionActive || !globalSendTextMessage) {
    console.log('📡 Realtime agent not available');
    return;
  }
  
  try {
    globalSendTextMessage("Architecture generation complete!");
    console.log('✅ Architecture complete message sent to realtime agent');
  } catch (error) {
    console.error('❌ Failed to send architecture complete message:', error);
  }
};

/**
 * Register chat visibility (simplified)
 */
export const registerChatVisibility = (setter: (visible: boolean) => void) => {
  console.log('📞 Chat visibility setter registered');
};

/**
 * Make chat visible (simplified)
 */
export const makeChatVisible = () => {
  console.log('👁️ Making chat visible');
};

/**
 * Add reasoning message (simplified)
 */
export const addReasoningMessage = (initialContent: string = ""): string => {
  const messageId = crypto.randomUUID();
  const reasoningMessage: Message = {
    id: messageId,
    content: initialContent,
    sender: 'system',
    type: 'reasoning',
    isStreaming: true,
    streamedContent: "",
    isDropdownOpen: true,
    animationType: 'reasoning'
  };
  
  const addMessageEvent = new CustomEvent('addChatMessage', {
    detail: { message: reasoningMessage }
  });
  document.dispatchEvent(addMessageEvent);
  
  return messageId;
};

/**
 * Update streaming message (simplified)
 */
export const updateStreamingMessage = (messageId: string, newContent: string, isComplete: boolean = false, currentFunction?: string): void => {
  const updateEvent = new CustomEvent('updateStreamingMessage', {
    detail: { 
      messageId, 
      streamedContent: newContent,
      isStreaming: !isComplete,
      currentFunction
    }
  });
  document.dispatchEvent(updateEvent);
};

/**
 * Add function calling message (simplified)
 */
export const addFunctionCallingMessage = (initialContent: string = ""): string => {
  const messageId = crypto.randomUUID();
  const functionMessage: Message = {
    id: messageId,
    content: initialContent,
    sender: 'system',
    type: 'function-calling',
    isStreaming: true,
    streamedContent: "",
    isDropdownOpen: false,
    animationType: 'function-calling'
  };
  
  const addMessageEvent = new CustomEvent('addChatMessage', {
    detail: { message: functionMessage }
  });
  document.dispatchEvent(addMessageEvent);
  
  return messageId;
};