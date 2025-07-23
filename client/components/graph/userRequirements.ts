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
  
  // Check for direct chat input from the new flow
  let conversationData = "";
  const directChatData = (window as any).chatConversationData;
  
  if (directChatData && typeof directChatData === 'string' && directChatData.trim()) {
    console.log("📝 Found direct chat data:", directChatData);
    conversationData = `
USER REQUEST: ${directChatData}

ARCHITECTURE REQUIREMENTS:
Build a complete architecture diagram based on the user's request: "${directChatData}"

Please create a detailed architecture that addresses the specific technologies, components, and requirements mentioned in the user's input. Focus on creating a practical, well-designed system architecture.
`;
  } else {
    // Fallback to the old questionnaire-based flow
    try {
      const requirements: string[] = [];
      const questions: string[] = [];
      const answers: string[] = [];
      
      // Debug: Show what we're starting with
      console.log("🔍 DEBUG: Global chat messages:", globalChatMessages.length, globalChatMessages);
      console.log("🔍 DEBUG: Global selected options:", Object.keys(globalSelectedOptions).length, globalSelectedOptions);
      
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
      console.log("🔍 DEBUG: Collected requirements:", requirements);
      console.log("🔍 DEBUG: Collected questions:", questions);
      console.log("🔍 DEBUG: Collected answers:", answers);
      
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
        console.log("📝 No conversation data found, using default architecture prompt");
        conversationData = "Create a sample cloud architecture diagram with common components like load balancer, web servers, database, and cache.";
      }
    } catch (error) {
      console.warn("⚠️ Error collecting conversation data:", error);
      conversationData = "Create a sample cloud architecture diagram with common components like load balancer, web servers, database, and cache.";
    }
  }
  
  // Store the final conversation data globally so StreamExecutor can access it
  (window as any).chatConversationData = conversationData;
  console.log("📝 Final conversation data stored:", conversationData);
  
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