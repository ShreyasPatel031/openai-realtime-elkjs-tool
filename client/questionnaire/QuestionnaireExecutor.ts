import { addUserDecisionToChat, createFollowupQuestionsToChat } from '../utils/chatUtils';
import { questionnaireAgentDescription } from './agentConfig';
import { storeChatData } from '../components/graph/userRequirements';

export class QuestionnaireExecutor {
  constructor() {
    // No API key needed - using server endpoint
  }

  async execute(
    requirement: string,
    onStartAgent: () => void,
    onQuestions: (questions: any[]) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      console.log('🔧 Starting questionnaire agent with requirement:', requirement);
      
      onStartAgent();

      const messages = [
        {
          role: 'system',
          content: questionnaireAgentDescription
        },
        {
          role: 'user',
          content: requirement
        }
      ];

      console.log('📤 Sending request to server /questionnaire endpoint...');

      // Use the new server /questionnaire endpoint 
      const response = await fetch('/questionnaire', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Server API error:', response.status, errorData);
        throw new Error(`Server API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('📨 Server Response:', data);

      // Check for function call in the server response format
      if (data.output && data.output.length > 0) {
        const output = data.output[0];
        
        if (output.type === 'function_call' && output.function_call.name === 'log_requirements_and_generate_questions') {
          const functionArgs = JSON.parse(output.function_call.arguments);
          console.log('✅ Parsed function arguments:', functionArgs);
          
          if (functionArgs.requirements && functionArgs.questions) {
            console.log('🔍 User input:', requirement);
            console.log('🔍 Requirements extracted:', functionArgs.requirements);
            console.log('🔍 First question:', functionArgs.questions[0]?.text);
            
            // Add user's original requirement to chat
            addUserDecisionToChat(requirement);
            
            // Process questions and add to chat
            const processedQuestions = functionArgs.questions.map((q: any, index: number) => ({
              id: `q_${Date.now()}_${index}`,
              ...q
            }));
            
            createFollowupQuestionsToChat(processedQuestions);
            
            // Store simplified chat data for reasoning agent
            // The key is to preserve the original user input and the conversation structure
            const chatMessages = [
              {
                id: crypto.randomUUID(),
                content: requirement, // Original user input - this is critical
                sender: 'user'
              },
              ...processedQuestions.map(q => ({
                id: q.id,
                content: q.text,
                sender: 'assistant',
                type: q.type === 'multiselect' ? 'checkbox-question' : 'radio-question',
                question: q.text,
                options: q.options.map((option: string, optIndex: number) => ({
                  id: `${q.id}_${optIndex}`,
                  text: option
                }))
              }))
            ];
            
            // Store for reasoning agent - this is what gets passed to process_user_requirements
            storeChatData(chatMessages, {});
            console.log('📝 Stored chat data for reasoning agent:', {
              messagesCount: chatMessages.length,
              originalUserInput: requirement,
              questionsCount: processedQuestions.length
            });
            
            // Call the callback with questions
            onQuestions(processedQuestions);
            
            console.log('✅ Questions processed and added to chat');
          } else {
            console.error('❌ Missing requirements or questions in function call');
            throw new Error('Invalid function call response - missing requirements or questions');
          }
        } else {
          console.error('❌ Unexpected function call or message:', output);
          throw new Error(`Unexpected response type: ${output.type}`);
        }
      } else {
        console.error('❌ No output in server response');
        throw new Error('No output in server response');
      }

    } catch (error) {
      console.error('❌ Questionnaire execution failed:', error);
      onError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }
} 