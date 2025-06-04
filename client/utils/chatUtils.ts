import { Message } from '../types/chat';

// Store for user decisions
const userDecisions: string[] = [];

// Store for follow-up questions
let followupQuestions: any[] = [];

// Chat visibility state management
let setChatVisible: ((visible: boolean) => void) | null = null;

// Function to register the chat visibility setter from React component
export const registerChatVisibility = (setter: (visible: boolean) => void) => {
  setChatVisible = setter;
};

// Function to make chat window visible
export const makeChatVisible = () => {
  console.log('🔧 Making chat window visible');
  
  if (setChatVisible) {
    setChatVisible(true);
  } else {
    console.warn('Chat visibility setter not registered');
  }
};

// Function to auto-close chat window
export const closeChatWindow = () => {
  console.log('🔧 Auto-closing chat window');
  
  if (setChatVisible) {
    setChatVisible(false);
  } else {
    console.warn('Chat visibility setter not registered');
  }
};

// Function to add a user decision to the chat
export const addUserDecisionToChat = (decision: string): { success: boolean; message: string } => {
  try {
    console.log('📝 Adding user decision to chat:', decision);
    
    // Store the decision
    userDecisions.push(decision);
    
    // Make chat visible
    makeChatVisible();
    
    // Create a system message for the decision
    const messageId = crypto.randomUUID();
    const systemMessage: Message = {
      id: messageId,
      content: `${decision}`,
      sender: 'system'
    };
    
    // Add message to chat via custom event (this is how useChatSession listens for messages)
    const addMessageEvent = new CustomEvent('addChatMessage', {
      detail: { message: systemMessage }
    });
    document.dispatchEvent(addMessageEvent);
    
    console.log('✅ User decision added successfully');
    return { 
      success: true, 
      message: `Decision recorded: ${decision}` 
    };
    
  } catch (error) {
    console.error('❌ Error adding user decision to chat:', error);
    return { 
      success: false, 
      message: `Error recording decision: ${error?.message || 'Unknown error'}` 
    };
  }
};

// Function to create and add follow-up questions to chat
export const createFollowupQuestionsToChat = (questions: any[]): { success: boolean; message: string } => {
  try {
    console.log('❓ Creating follow-up questions based on structured questions:', questions);
    
    // Validate questions parameter
    if (!questions || !Array.isArray(questions)) {
      console.error('❌ Invalid questions parameter:', questions);
      return { 
        success: false, 
        message: 'Error: questions parameter must be a non-empty array' 
      };
    }
    
    if (questions.length === 0) {
      console.error('❌ Empty questions array provided');
      return { 
        success: false, 
        message: 'Error: questions array cannot be empty' 
      };
    }
    
    // Make chat visible
    makeChatVisible();
    
    // Add each question as a separate message to the chat
    questions.forEach((question, index) => {
      // Validate individual question structure
      if (!question || typeof question !== 'object') {
        console.error(`❌ Invalid question at index ${index}:`, question);
        return;
      }
      
      if (!question.text || !question.type || !question.options || !Array.isArray(question.options)) {
        console.error(`❌ Question at index ${index} missing required fields:`, question);
        return;
      }
      
      const messageId = crypto.randomUUID();
      const questionMessage: Message = {
        id: messageId,
        content: question.text,
        sender: 'assistant',
        type: question.type === 'multiselect' ? 'checkbox-question' : 'radio-question',
        question: question.text,
        options: question.options.map((option: string, optIndex: number) => ({
          id: `${messageId}_${optIndex}`,
          text: option
        }))
      };
      
      // Add question to chat via custom event
      const addQuestionEvent = new CustomEvent('addChatMessage', {
        detail: { message: questionMessage }
      });
      document.dispatchEvent(addQuestionEvent);
    });
    
    console.log('✅ Follow-up questions created and added to chat successfully');
    return { 
      success: true, 
      message: `Generated ${questions.length} follow-up questions`
    };
    
  } catch (error) {
    console.error('❌ Error creating follow-up questions:', error);
    return { 
      success: false, 
      message: `Error creating questions: ${error?.message || 'Unknown error'}` 
    };
  }
};

// Function to get stored user decisions
export const getUserDecisions = (): string[] => {
  return [...userDecisions];
};

// Function to get stored follow-up questions
export const getFollowupQuestions = (): any[] => {
  return [...followupQuestions];
};

// Function to clear stored data
export const clearChatData = (): void => {
  userDecisions.length = 0;
  followupQuestions.length = 0;
};

// Function to add reasoning message with streaming
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
  
  // Make chat visible
  makeChatVisible();
  
  // Add message to chat
  const addMessageEvent = new CustomEvent('addChatMessage', {
    detail: { message: reasoningMessage }
  });
  document.dispatchEvent(addMessageEvent);
  
  console.log('🧠 Added reasoning message:', messageId);
  return messageId;
};

// Function to update streaming content for reasoning/function messages
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
  
  // Auto-scroll to bottom when content updates - target the specific message container
  setTimeout(() => {
    // First try to scroll the specific message content
    const messageElement = document.querySelector(`[data-message-id="${messageId}"] .overflow-y-auto`);
    if (messageElement) {
      messageElement.scrollTop = messageElement.scrollHeight;
    }
    
    // Also scroll the main chat container to bottom
    const messagesContainer = document.querySelector('[data-chat-window] .overflow-y-auto');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, 10);
};

// Function to add function calling message
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
  
  // Make chat visible
  makeChatVisible();
  
  // Add message to chat
  const addMessageEvent = new CustomEvent('addChatMessage', {
    detail: { message: functionMessage }
  });
  document.dispatchEvent(addMessageEvent);
  
  console.log('⚙️ Added function calling message:', messageId);
  return messageId;
};

// Function to add process complete message
export const addProcessCompleteMessage = (): void => {
  const messageId = crypto.randomUUID();
  const completeMessage: Message = {
    id: messageId,
    content: "Architecture processing complete! Chat will close automatically in 3 seconds.",
    sender: 'system',
    type: 'process-complete'
  };
  
  // Make chat visible
  makeChatVisible();
  
  // Add message to chat
  const addMessageEvent = new CustomEvent('addChatMessage', {
    detail: { message: completeMessage }
  });
  document.dispatchEvent(addMessageEvent);
  
  console.log('✅ Added process complete message - chat will auto-close');
  
  // Auto-close chat after 3 seconds
  setTimeout(() => {
    closeChatWindow();
  }, 3000);
};

// Function to simulate token-by-token streaming (for testing)
export const simulateTokenStreaming = (messageId: string, fullText: string, speed: number = 50): void => {
  let currentIndex = 0;
  const streamInterval = setInterval(() => {
    if (currentIndex < fullText.length) {
      const chunk = fullText.slice(0, currentIndex + 1);
      updateStreamingMessage(messageId, chunk, false);
      currentIndex++;
    } else {
      updateStreamingMessage(messageId, fullText, true);
      clearInterval(streamInterval);
    }
  }, speed);
}; 