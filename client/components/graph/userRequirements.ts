/**
 * This file contains the process_user_requirements function which returns
 * sample architecture diagram instructions.
 */

// Global variable to store chat messages for the StreamExecutor
let globalChatMessages: any[] = [];
let globalSelectedOptions: Record<string, string | string[]> = {};

/**
 * Clear all cached conversation data and reset global variables
 */
export const clearCachedConversationData = () => {
  globalChatMessages = [];
  globalSelectedOptions = {};
  (window as any).chatConversationData = "";
  console.log("🧹 Cleared all cached conversation data");
};

/**
 * Store chat messages and selected options for use by StreamExecutor
 */
export const storeChatData = (messages: any[], selectedOptions: Record<string, string | string[]>) => {
  globalChatMessages = messages;
  globalSelectedOptions = selectedOptions;
  console.log("📝 Stored chat data:", { messages: messages.length, selectedOptions: Object.keys(selectedOptions).length });
};

/**
 * Process user requirements and return sample architecture diagram instructions
 * Returns an array of instructions for building an architecture diagram
 * 
 * Always triggers StreamViewer via DOM manipulation for consistent UI output
 */
export const process_user_requirements = (elkGraph?: any, setElkGraph?: (graph: any) => void) => {
  console.group(`[user requirements] process_user_requirements`);
  console.time("process_user_requirements");
  
  console.log("🎯 process_user_requirements called - collecting chat data and triggering StreamViewer");
  
  // Collect conversation data from stored chat messages
  let conversationData = "";
  try {
    // Find the original user input - this is the most important piece
    const originalUserInput = globalChatMessages.find(msg => msg.sender === 'user')?.content || '';
    
    const questions: string[] = [];
    const answers: string[] = [];
    
    console.log("🔍 DEBUG: Original user input:", originalUserInput);
    console.log("🔍 DEBUG: Global chat messages:", globalChatMessages.length, globalChatMessages);
    console.log("🔍 DEBUG: Global selected options:", Object.keys(globalSelectedOptions).length, globalSelectedOptions);
    
    // Process stored messages to collect questions and answers
    globalChatMessages.forEach(message => {
      if (message.type === 'radio-question' || message.type === 'checkbox-question') {
        questions.push(message.question || message.content);
        
        // Get selected answer for this question
        const selectedAnswer = globalSelectedOptions[message.id];
        if (selectedAnswer) {
          if (Array.isArray(selectedAnswer)) {
            // Checkbox question - multiple selections
            selectedAnswer.forEach(optionId => {
              const option = message.options?.find((opt: any) => opt.id === optionId);
              if (option) answers.push(option.text);
            });
          } else {
            // Radio question - single selection
            const option = message.options?.find((opt: any) => opt.id === selectedAnswer);
            if (option) answers.push(option.text);
          }
        }
      }
    });
    
    console.log("🔍 DEBUG: Collected questions:", questions);
    console.log("🔍 DEBUG: Collected answers:", answers);
    
    // Build conversation data - focus on the original user input and their specific choices
    if (originalUserInput) {
      conversationData = `
ORIGINAL USER REQUEST: "${originalUserInput}"

FOLLOW-UP QUESTIONS AND USER RESPONSES:
${questions.map((question, index) => {
  const relatedAnswers: string[] = [];
  // Find answers for this question
  globalChatMessages.forEach(message => {
    if ((message.type === 'radio-question' || message.type === 'checkbox-question') && 
        (message.question === question || message.content === question)) {
      const selectedAnswer = globalSelectedOptions[message.id];
      if (selectedAnswer) {
        if (Array.isArray(selectedAnswer)) {
          selectedAnswer.forEach(optionId => {
            const option = message.options?.find((opt: any) => opt.id === optionId);
            if (option) relatedAnswers.push(option.text);
          });
        } else {
          const option = message.options?.find((opt: any) => opt.id === selectedAnswer);
          if (option) relatedAnswers.push(option.text);
        }
      }
    }
  });
  
  return `Q${index + 1}: ${question}
A${index + 1}: ${relatedAnswers.join(', ') || 'Not answered yet'}`;
}).join('\n\n')}

ARCHITECTURE TASK:
Build a complete architecture diagram that addresses the user's original request: "${originalUserInput}"
Incorporate their specific choices from the Q&A above.
Focus on the exact technologies and patterns they mentioned in their original request.
`;
      
      console.log("📝 Built conversation data for reasoning agent:", conversationData);
    } else {
      console.warn("⚠️ No original user input found in chat messages");
      conversationData = "No conversation data available - using default architecture.";
    }
  } catch (error) {
    console.warn("⚠️ Error collecting conversation data:", error);
    conversationData = "Error collecting conversation data - using default architecture.";
  }
  
  // Store conversation data globally so StreamExecutor can access it
  (window as any).chatConversationData = conversationData;
  
  // Always use DOM manipulation to trigger StreamViewer for consistent UI output
  // This ensures both agent calls and test button calls show streaming output in the UI
  const streamViewerButton = document.querySelector('[data-streamviewer-trigger]') as HTMLButtonElement;
  if (streamViewerButton && !streamViewerButton.disabled) {
    console.log("✅ Found StreamViewer button, triggering...");
    streamViewerButton.click();
  } else {
    console.warn("⚠️ StreamViewer button not found or disabled");
  }
  
  console.timeEnd("process_user_requirements");
  console.groupEnd();
  
  const result: string[] = [];
  return result;
}; 