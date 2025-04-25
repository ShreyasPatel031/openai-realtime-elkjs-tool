import { sendEventWithAutoChunk } from "./eventSender";

/**
 * Sends a `function_result` back to the model.
 * The payload (result) can be arbitrarily large; it will be
 * transparently split into ≤ 950 B frames.
 * 
 * @returns boolean indicating if the function result was sent successfully
 */
export function sendFunctionResult(sendEvent: (event: any) => void, name: string, result: any): boolean {
  console.log(`📤 Sending function result for ${name}...`);
  
  // Create the function_result message
  const functionResultMessage = {
    type: "conversation.item.create",
    item: {
      type: "function_result",  // <-- critical
      role: "tool",
      name,                     // must exactly match the function the model called
      content: result           // the *entire* graph object is fine here
    }
  };
  
  // Log message size for debugging
  const messageSize = JSON.stringify(functionResultMessage).length;
  console.log(`📦 Function result size: ${messageSize} bytes`);
  
  try {
    // Send the function result message - App.jsx will handle queueing if needed
    sendEvent(functionResultMessage);
    console.log(`✅ Function result for ${name} sent successfully`);
    
    // Send the response.create event to prompt the model to continue
    sendEvent({ type: "response.create" });
    console.log(`🔄 Sending response.create to continue the conversation`);
    
    return true;
  } catch (error) {
    console.error(`❌ Error sending function result for ${name}:`, error);
    return false;
  }
} 