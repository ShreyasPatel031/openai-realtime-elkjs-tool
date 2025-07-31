import OpenAI from "openai";
import type { APIError } from "openai";

// Import allTools from the catalog
import { allTools } from "../server/toolCatalog.js";
import { modelConfigs, timeoutConfigs, isReasoningModel } from "../client/reasoning/agentConfig";

// Helper to decompress base64 payload for Edge Runtime
const decompressPayload = async (compressedPayload: string): Promise<string> => {
  // Convert base64 to Uint8Array
  const binaryStr = atob(compressedPayload);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  
  // Decompress using DecompressionStream
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  
  // Read the decompressed data
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  // Combine chunks and convert to string
  const decompressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    decompressed.set(chunk, offset);
    offset += chunk.length;
  }
  
  return new TextDecoder().decode(decompressed);
};

// Clean OpenAI IDs from conversation to prevent confusion
const deepCleanOpenAIIds = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(deepCleanOpenAIIds);
  }
  
  if (typeof obj === 'object') {
    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      // Skip OpenAI-specific ID fields
      if (typeof value === 'string' && (
        value.startsWith('rs_') || 
        value.startsWith('fc_') || 
        value.startsWith('msg_') ||
        value.startsWith('run_') ||
        value.startsWith('thread_') ||
        value.startsWith('asst_') ||
        value.startsWith('chatcmpl_')
      )) {
        console.log(`🧹 Removing OpenAI ID: ${key}=${value}`);
        return; // Skip this field
      }
      cleaned[key] = deepCleanOpenAIIds(value);
    });
    return cleaned;
  }
  
  return obj;
};

export default async function handler(req: any, res: any) {
  try {
    console.log('=== VERCEL STREAM REQUEST ===');
    console.log('Method:', req.method);
    console.log('Content-Type:', req.headers['content-type']);
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Encoding');
      res.status(200).end();
      return;
    }

    // Get payload from request
    let payload: string;
    let isCompressed = false;
    
    if (req.method === "POST") {
      const body = req.body;
      
      // For FormData requests (with images), conversation is in body?.conversation
      // For JSON requests, payload is in body?.payload
      payload = body?.conversation || body?.payload;
      isCompressed = body?.isCompressed === true;
      
      // Decompress if needed (only applies to JSON requests)
      if (isCompressed && payload) {
        try {
          console.log('🔄 Decompressing payload...');
          payload = await decompressPayload(payload);
          console.log('✅ Payload decompressed successfully');
        } catch (decompressError) {
          console.error('❌ Failed to decompress payload:', decompressError);
          res.status(400).json({ 
            error: "Failed to decompress payload",
            details: decompressError instanceof Error ? decompressError.message : String(decompressError)
          });
          return;
        }
      }
    } else {
      payload = req.query.payload || '';
    }

    if (!payload) {
      res.status(400).json({ error: "missing payload" });
      return;
    }

    // Parse and clean conversation
    const conversation = JSON.parse(payload);
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🔍 [${requestId}] Stream request received`);
    console.log(`🔍 [${requestId}] Original conversation length: ${conversation?.length || 0}`);
    
    // Clean OpenAI IDs from conversation
    const cleanedConversation = deepCleanOpenAIIds(conversation);
    console.log(`🧹 [${requestId}] Cleaned conversation, final length: ${cleanedConversation?.length || 0}`);
    
    // Create OpenAI client (stateless for Vercel)
    const client = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 3,
      timeout: timeoutConfigs.o3Timeout, // Use centralized timeout config
    });

    // Set up streaming response headers for Node.js runtime
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Encoding');
    
    const send = (data: any) => {
      const chunk = `data: ${JSON.stringify(data)}\n\n`;
      console.log(`📤 [${requestId}] Sending delta: ${data.type || 'unknown'}`);
      res.write(chunk);
    };

        try {
          // Set up tools for the request
          const tools = allTools.map(tool => ({
            type: "function" as const,
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            strict: false
          }));

          console.log(`🔍 [${requestId}] Using tools: ${tools.length} functions`);
          
          // Make full OpenAI Responses API request with streaming
          const requestPayload = {
            model: modelConfigs.reasoning.model,
            input: cleanedConversation,
            tools: tools,
            tool_choice: "auto" as const,
            parallel_tool_calls: modelConfigs.reasoning.parallel_tool_calls,
            ...(isReasoningModel(modelConfigs.reasoning.model) ? {
              reasoning: modelConfigs.reasoning.reasoning
            } : {}),
            stream: true as const
          };

          console.log(`🔍 [${requestId}] Making OpenAI Responses API request with model: ${modelConfigs.reasoning.model}`);
          console.log(`🔍 [${requestId}] Request payload:`, {
            model: requestPayload.model,
            inputMessages: requestPayload.input.length,
            tools: requestPayload.tools.length,
            tool_choice: requestPayload.tool_choice,
            parallel_tool_calls: requestPayload.parallel_tool_calls,
            reasoning: requestPayload.reasoning,
            stream: requestPayload.stream
          });
          
          // Conversation loop - continue until no more function calls
          let conversationTurn = 1;
          let conversationComplete = false;
          let currentResponseId: string | null = null;
          
          while (!conversationComplete && conversationTurn <= 20) {
            console.log(`🔄 [${requestId}] Starting conversation turn ${conversationTurn}`);
            
            const stream = await client.responses.create(requestPayload);
            console.log(`🔍 [${requestId}] OpenAI stream created for turn ${conversationTurn}`);

            let messageCount = 0;
            let functionCalls: any[] = [];
            let responseComplete = false;
            let responseId: string | null = null;
            
            for await (const delta of stream) {
              messageCount++;
              if (messageCount % 10 === 0) {
                console.log(`🔍 [${requestId}] Turn ${conversationTurn}: Processed ${messageCount} stream messages...`);
              }
              
              // Debug: Log significant delta types
              if (delta.type === "response.completed" || 
                  delta.type?.includes("function_call") ||
                  delta.type === "error") {
                console.log(`🔍 DEBUG: Turn ${conversationTurn} delta #${messageCount}: ${delta.type}`);
              }
              
              // Handle errors in the stream
              if (delta.type === "error") {
                console.error(`❌ [${requestId}] Stream error:`, delta);
                send({ 
                  type: "error", 
                  error: "Stream error occurred",
                  debug: {
                    type: "stream_error",
                    details: delta
                  }
                });
                conversationComplete = true;
                break;
              }
              
              // Send all deltas to client
              send(delta);

              // Collect function calls
              if (delta.type === "response.output_item.done" && delta.item?.type === "function_call") {
                console.log(`📞 [${requestId}] Turn ${conversationTurn}: Function call received: ${delta.item.name} (${delta.item.call_id})`);
                functionCalls.push(delta.item);
              }
              
              // Check if response is complete
              if (delta.type === "response.completed") {
                console.log(`✅ [${requestId}] Turn ${conversationTurn} completed after ${messageCount} messages`);
                responseId = delta.response?.id || null;
                currentResponseId = responseId;
                console.log(`🔍 [${requestId}] Turn ${conversationTurn} response ID: ${responseId}`);
                responseComplete = true;
                break;
              }
            }
            
            console.log(`🔍 [${requestId}] Turn ${conversationTurn}: Total stream messages processed: ${messageCount}`);
            
            // If no function calls, conversation is complete
            if (functionCalls.length === 0) {
              console.log(`🏁 [${requestId}] No function calls in turn ${conversationTurn} - conversation complete`);
              conversationComplete = true;
              break;
            }
            
            console.log(`🔄 [${requestId}] Turn ${conversationTurn}: Processing ${functionCalls.length} function calls`);
            
            // Prepare function call outputs array for the SAME turn
            const functionCallOutputs = [];
            
            // Execute function calls and collect outputs
            for (const functionCall of functionCalls) {
              try {
                // Simulate function execution (simplified)
                const functionOutput = {
                  success: true,
                  message: `Function ${functionCall.name} executed successfully`,
                  call_id: functionCall.call_id
                };
                
                console.log(`✅ [${requestId}] Executed function: ${functionCall.name} (${functionCall.call_id})`);
                
                // Add function output to the outputs array (NOT conversation)
                functionCallOutputs.push({
                  type: "function_call_output",
                  call_id: functionCall.call_id,
                  output: JSON.stringify(functionOutput)
                });
                
              } catch (error) {
                console.error(`❌ [${requestId}] Function execution failed:`, error);
                
                // Add error output to the outputs array (NOT conversation)
                functionCallOutputs.push({
                  type: "function_call_output", 
                  call_id: functionCall.call_id,
                  output: JSON.stringify({
                    success: false,
                    error: String(error),
                    call_id: functionCall.call_id
                  })
                });
              }
            }
            
            console.log(`🔄 [${requestId}] Turn ${conversationTurn}: Making follow-up call with ${functionCallOutputs.length} function outputs`);
            
            // Create follow-up stream with function outputs for the SAME turn
            const followUpStream = await client.responses.create({
              model: modelConfigs.reasoning.model,
              previous_response_id: currentResponseId, // Use the response ID from this turn
              input: functionCallOutputs, // Just the function call outputs
              tools: tools,
              tool_choice: "auto" as const,
              parallel_tool_calls: modelConfigs.reasoning.parallel_tool_calls,
              ...(isReasoningModel(modelConfigs.reasoning.model) ? {
                reasoning: modelConfigs.reasoning.reasoning
              } : {}),
              stream: true as const
            });
            
            console.log(`🔍 [${requestId}] Follow-up stream created for turn ${conversationTurn}`);
            
            // Process the follow-up stream  
            let followUpMessageCount = 0;
            let followUpFunctionCalls: any[] = [];
            
            for await (const delta of followUpStream) {
              followUpMessageCount++;
              if (followUpMessageCount % 10 === 0) {
                console.log(`🔍 [${requestId}] Turn ${conversationTurn} follow-up: Processed ${followUpMessageCount} messages...`);
              }
              
              // Send all deltas to client
              send(delta);
              
              // Collect any new function calls
              if (delta.type === "response.output_item.done" && delta.item?.type === "function_call") {
                console.log(`📞 [${requestId}] Turn ${conversationTurn} follow-up: Function call received: ${delta.item.name} (${delta.item.call_id})`);
                followUpFunctionCalls.push(delta.item);
              }
              
              // Check if response is complete
              if (delta.type === "response.completed") {
                console.log(`✅ [${requestId}] Turn ${conversationTurn} follow-up completed after ${followUpMessageCount} messages`);
                break;
              }
            }
            
            // If the follow-up generated more function calls, continue the conversation
            if (followUpFunctionCalls.length > 0) {
              functionCalls = followUpFunctionCalls;
              console.log(`🔄 [${requestId}] Turn ${conversationTurn}: Got ${functionCalls.length} more function calls, continuing...`);
              // Continue the loop with new function calls
            } else {
              // No more function calls, conversation is complete
              console.log(`🏁 [${requestId}] Turn ${conversationTurn}: No more function calls - conversation complete`);
              conversationComplete = true;
            }
          }
          
          if (conversationTurn > 20) {
            console.log(`⚠️ [${requestId}] Reached maximum conversation turns (20)`);
          }
          
          // Send completion signal
          console.log(`🏁 [${requestId}] Conversation complete - sending [DONE] to client`);
          send('[DONE]');
          console.log(`🏁 [${requestId}] Stream response ended`);
          res.end();
          
        } catch (error) {
          console.error(`❌ [${requestId}] OpenAI API Error:`, error);
          
          const apiError = error as APIError;
          const isConnectionError = error.message?.includes('socket') || 
                                   error.message?.includes('network') ||
                                   error.message?.includes('timeout');
          
          send({ 
            type: "error", 
            error: `OpenAI API Error: ${apiError instanceof Error ? apiError.message : String(apiError)}`,
            debug: {
              type: apiError?.constructor?.name,
              isConnectionError,
              suggestion: isConnectionError ? 
                "This appears to be a temporary connection issue. Please try again in a few moments." :
                "An unexpected error occurred. Please check the console for details."
            }
          });
          
          res.write("data: [DONE]\n\n");
          res.end();
        }

  } catch (error) {
    console.error('Stream handler error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Configure this endpoint to run in Node.js Runtime for better Vercel dev compatibility
export const config = {
  runtime: 'nodejs',
};
