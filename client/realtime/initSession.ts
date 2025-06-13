// client/realtime/initSession.ts
import { toolPages } from "./toolCatalog";
import { SessionConfig, ClientEvent, Message, InputTextContent } from './types';

export function initSession(
  events: any[],
  safeSend: (e: ClientEvent) => void,
  elkGraphDescription: string,
  config?: SessionConfig
) {
  // Check for session.created event specifically (not just any event)
  const sessionCreatedEvent = events.find((e) => e.type === "session.created");
  if (!sessionCreatedEvent) {
    console.error("❌ Cannot initialize session: No session.created event found");
    return false; // caller will know it did nothing
  }

  // Enforce non-empty elkGraphDescription with more detailed error
  if (!elkGraphDescription || elkGraphDescription.trim() === '') {
    console.error('❌ Cannot initialize session: elkGraphDescription must be provided');
    return false;
  }

  // Minimal logging - just note that we're initializing
  console.log("🚀 Initializing session");
  
  // Apply simplified session configuration if provided
  if (config) {
    const sessionConfig: Partial<SessionConfig> = {};
    
    // Add the core configuration options
    if (config.language) sessionConfig.language = config.language;
    if (config.temperature) sessionConfig.temperature = config.temperature;
    if (config.model) sessionConfig.model = config.model;
    if (config.instructions) sessionConfig.instructions = config.instructions;
    
    // Send initial session configuration
    safeSend({ 
      type: "session.update", 
      session: sessionConfig
    });
  }
  
  // Send tool configuration - suppress individual page logs
  const toolPageCount = toolPages().length;
  toolPages().forEach((page, i, arr) => {
    safeSend({ 
      type: "session.update", 
      session: { 
        tools: page,
        tool_choice: "auto"
      } 
    });
  });

  // If language is provided, include instructions to use that language
  const languageInstruction = config?.language ? 
    `You must respond only in ${config.language}. Do not switch to any other language.` : '';

  const content: InputTextContent = {
    type: "input_text",
    text: `
      ${languageInstruction}
      ${elkGraphDescription}
    `
  };

  // Send instructions and create response without logging each step
  safeSend({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{
        type: "input_text",
        text: `${languageInstruction}
               ${elkGraphDescription}

              Please greet the user with exactly 'How can I help?' and nothing else. Do not add any additional text or explanation.`
      }]
    }
  });

  // Create single response to trigger the greeting
  console.log("initSession: sending greet instruction");
  safeSend({ type: "response.create" });
  
  return true;
} 