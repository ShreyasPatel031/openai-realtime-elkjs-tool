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
  
  console.log("🟠 STEP 4: process_user_requirements called - collecting chat data and triggering StreamViewer");
  
  // Collect conversation data from stored chat messages
  let conversationData = "";
  try {
    const requirements: string[] = [];
    const questions: string[] = [];
    const answers: string[] = [];
    
    // Debug: Show what we're starting with
      // Processing chat messages and selected options
    
    // Process stored messages
    globalChatMessages.forEach(message => {
      if (message.sender === 'user' || message.sender === 'assistant') {
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
        } else if (message.content && !message.content.includes('Processing') && !message.content.includes('Architecture')) {
          requirements.push(message.content);
        }
      }
    });
    
    // Debug: Show what we collected
    // Requirements, questions, and answers collected
    
    // Build conversation summary
    if (requirements.length > 0 || questions.length > 0 || answers.length > 0) {
      conversationData = `
FULL CONVERSATION HISTORY:

ORIGINAL USER INPUT: ${requirements.join(' | ')}

FOLLOW-UP QUESTIONS AND ANSWERS:
${questions.map((question, index) => {
  const relatedAnswers = [];
  // Find answers for this question
  globalChatMessages.forEach(message => {
    if (message.type === 'radio-question' || message.type === 'checkbox-question') {
      if (message.question === question || message.content === question) {
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
    }
  });
  
  return `
Question ${index + 1}: ${question}
Selected Answer(s): ${relatedAnswers.join(', ') || 'Not answered yet'}`;
}).join('')}

ARCHITECTURE REQUIREMENTS:
Based on the user input "${requirements.join(' ')}" and their selected answers, build a complete architecture that specifically addresses:
1. The exact technologies they mentioned (${requirements.filter(req => req.includes('GCP') || req.includes('AWS') || req.includes('Azure') || req.includes('Kubernetes') || req.includes('microservices')).join(', ')})
2. The components they selected: ${answers.join(', ')}
3. Integration with the services they chose
4. The use case and scaling approach they specified

DO NOT ask generic questions about cloud provider or basic architecture choices - these are already decided above.
Build the specific architecture they requested.
`;
      console.log("📝 Collected full conversation data:", conversationData);
    } else {
      console.log("📝 No conversation data found, using default architecture");
    }
  } catch (error) {
    console.warn("⚠️ Error collecting conversation data:", error);
  }
  
  // Store conversation data globally so StreamExecutor can access it
  (window as any).chatConversationData = conversationData;
  
  // Always use DOM manipulation to trigger StreamViewer for consistent UI output
  // This ensures both agent calls and test button calls show streaming output in the UI
  console.log("🟣 STEP 5: Looking for StreamViewer button to trigger...");
  const streamViewerButton = document.querySelector('[data-streamviewer-trigger]') as HTMLButtonElement;
  if (streamViewerButton && !streamViewerButton.disabled) {
    console.log("✅ STEP 5: Found StreamViewer button, clicking it now...");
    streamViewerButton.click();
    console.log("🚀 STEP 5: StreamViewer button clicked - should trigger StreamExecutor");
  } else {
    console.warn("❌ STEP 5: StreamViewer button not found or disabled");
    console.log("🔍 Available buttons:", document.querySelectorAll('button').length);
  }
  
  console.timeEnd("process_user_requirements");
  console.groupEnd();
  
  const result: string[] = [];
  return result;
}; 