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