import { gunzipSync } from 'node:zlib';
import { allTools } from "./toolCatalog.js";
import ConnectionManager from './connectionManager.js';

const connectionManager = ConnectionManager.getInstance();

// Helper to decompress base64 payload using Node.js APIs
const decompressPayload = (compressed) => {
  // base64 → Buffer
  const buf = Buffer.from(compressed, 'base64');
  // gunzip
  const decompressed = gunzipSync(buf);
  return decompressed.toString('utf8');
};

export default async function streamHandler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Encoding');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    console.log('=== STREAM REQUEST ===');
    console.log('Method:', req.method);
    console.log('Content-Type:', req.get('Content-Type'));
    
    // Get payload from request
    let payload;
    let isCompressed = false;
    
    if (req.method === "POST") {
      // For FormData requests (with images), conversation is in req.body?.conversation
      // For JSON requests, payload is in req.body?.payload
      payload = req.body?.conversation || req.body?.payload;
      isCompressed = req.body?.isCompressed === true;
      
      // Decompress if needed (only applies to JSON requests)
      if (isCompressed && payload) {
        try {
          console.log('🔄 Decompressing payload...');
          payload = decompressPayload(payload);
          console.log('✅ Payload decompressed successfully');
        } catch (decompressError) {
          console.error('❌ Failed to decompress payload:', decompressError);
          return res.status(400).json({ 
            error: "Failed to decompress payload",
            details: decompressError instanceof Error ? decompressError.message : String(decompressError)
          });
        }
      }
    } else {
      payload = req.query.payload;
    }

    if (!payload) {
      return res.status(400).json({ error: "missing payload" });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Handle client disconnection
    req.on('close', () => {
      console.warn('⚠️ Client disconnected (req.close)');
    });
    
    req.on('aborted', () => {
      console.warn('⚠️ Client aborted request (req.aborted)');
    });
    
    res.on('close', () => {
      console.warn('⚠️ Response stream closed (res.close)');
    });

    // Helper to send SSE messages
    const send = (obj) => {
      try {
        const data = `data: ${JSON.stringify(obj)}\n\n`;
        res.write(data);
      } catch (writeError) {
        console.error('❌ Failed to write to response stream:', writeError.message);
        if (writeError.code === 'EPIPE' || writeError.code === 'ECONNRESET') {
          console.warn('⚠️ Client disconnected - stopping stream');
          throw new Error('Client disconnected');
        }
        throw writeError;
      }
    };

    try {
      // Parse initial conversation
      const conversation = JSON.parse(payload);
      
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Add debugging for multiple connections
      console.log(`🔍 [${requestId}] Stream request received`);
      console.log(`🔍 [${requestId}] Request headers:`, {
        'user-agent': req.headers['user-agent'],
        'origin': req.headers.origin,
        'referer': req.headers.referer,
        'connection': req.headers.connection
      });
      
      // Debug original conversation before cleaning
      console.log(`🔍 [${requestId}] Original conversation length: ${conversation?.length || 0}`);
      
      // Find and log all response IDs in conversation
      const responseIds = conversation?.filter(item => item.response_id || (item.id && item.id.startsWith('rs_')))
        .map(item => ({ id: item.id, response_id: item.response_id, role: item.role })) || [];
      
      if (responseIds.length > 0) {
        console.log(`🔍 [${requestId}] Found ${responseIds.length} response IDs in conversation:`, responseIds);
      }
      
      // Check if this is a function call output continuation
      const isFunctionCallOutput = conversation.length > 0 && 
        conversation[0].type === "function_call_output";
      
      if (isFunctionCallOutput) {
        console.log(`🔄 Processing function call output: ${conversation[0].call_id}`);
      }
      
      // ULTRA-COMPREHENSIVE conversation cleaning for multi-server compatibility
      const deepCleanOpenAIIds = (obj, depth = 0) => {
        if (depth > 20) return obj; // Prevent infinite recursion
        
        if (Array.isArray(obj)) {
          return obj.map(item => deepCleanOpenAIIds(item, depth + 1));
        }
        
        if (typeof obj === 'object' && obj !== null) {
          const cleaned = {};
          
          Object.keys(obj).forEach(key => {
            const value = obj[key];
            
            // Remove OpenAI-specific fields
            const openaiFields = [
              'response_id', 'id', 'object', 'created', 'model', 'usage', 
              'system_fingerprint', 'choices', 'finish_reason', 'index',
              'logprobs', 'reasoning', 'summary', 'message_id', 'call_id'
            ];
            
            if (openaiFields.includes(key)) {
              if (['response_id', 'id', 'message_id', 'call_id'].includes(key)) {
                console.log(`🔍 [${requestId}] Removing ${key}: ${value}`);
              }
              return; // Skip this field
            }
            
            // Remove any field with OpenAI ID patterns
            if (typeof value === 'string' && value.match(/^(rs_|fc_|msg_|run_|thread_|asst_|chatcmpl_)/)) {
              console.log(`🔍 [${requestId}] Removing field ${key} with OpenAI ID pattern: ${value}`);
              return; // Skip this field
            }
            
            // Remove any field named 'id' that contains OpenAI patterns
            if (key === 'id' && typeof value === 'string' && value.match(/^(rs_|fc_|msg_|run_|thread_|asst_|chatcmpl_)/)) {
              console.log(`🔍 [${requestId}] Removing 'id' field with OpenAI pattern: ${value}`);
              return; // Skip this field
            }
            
            // Recursively clean nested objects and arrays
            if (typeof value === 'object' && value !== null) {
              cleaned[key] = deepCleanOpenAIIds(value, depth + 1);
            } else {
              cleaned[key] = value;
            }
          });
          
          return cleaned;
        }
        
        return obj;
      };
      
      // Apply deep cleaning to the entire conversation
      const cleanedConversation = deepCleanOpenAIIds(conversation);
      
      // Additional safety check - ensure no OpenAI IDs remain in any string values
      const finalCleanedConversation = JSON.parse(JSON.stringify(cleanedConversation, (key, value) => {
        if (typeof value === 'string' && value.match(/^(rs_|fc_|msg_|run_|thread_|asst_|chatcmpl_)/)) {
          console.log(`🔍 [${requestId}] Final safety check - removing OpenAI ID: ${value}`);
          return undefined; // Remove this value
        }
        return value;
      }));
      
      console.log(`🔍 [${requestId}] Cleaned conversation length: ${finalCleanedConversation.length}`);
      
      // Log the payload structure being sent to OpenAI
      const payloadStructure = {
        messages: finalCleanedConversation.map(msg => ({
          role: msg.role,
          content: Array.isArray(msg.content) ? `[${msg.content.length} items]` : typeof msg.content,
          hasResponseId: !!msg.response_id,
          hasRsId: !!(msg.id && msg.id.startsWith('rs_'))
        })),
        hasResponseIds: responseIds.length > 0,
        originalResponseIds: responseIds
      };
      
      console.log(`🔍 [${requestId}] Payload structure being sent to OpenAI:`, JSON.stringify(payloadStructure, null, 2));
      
      
      
      // If we have uploaded files, add them to the conversation
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        console.log(`📸 Processing ${req.files.length} uploaded image(s)...`);
        
        // Find the last user message
        const lastUserMessageIndex = finalCleanedConversation.findLastIndex((msg) => msg.role === 'user');
        
        if (lastUserMessageIndex !== -1) {
          const lastUserMessage = finalCleanedConversation[lastUserMessageIndex];
          
          // Convert content to array format if it's a string
          if (typeof lastUserMessage.content === 'string') {
            lastUserMessage.content = [
              { type: 'input_text', text: lastUserMessage.content }
            ];
          }
          
          // Add images to the content
          req.files.forEach((file, index) => {
            const base64Image = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
            
            // Debug: Log image info
            console.log(`📸 Image ${index + 1} details:`);
            console.log(`  - Original filename: ${file.originalname}`);
            console.log(`  - MIME type: ${file.mimetype}`);
            console.log(`  - Buffer size: ${file.buffer.length} bytes`);
            console.log(`  - Base64 data preview: ${base64Image.substring(0, 100)}...`);
            
            lastUserMessage.content.push({
              type: 'input_image',
              image_url: base64Image
            });
            console.log(`📸 Added image ${index + 1} to conversation`);
          });
        }
      }
      
      let elkGraph = { id: "root", children: [], edges: [] };
      let turnCount = 0;
      let consecutiveNoFunctionCallTurns = 0;
      const maxTurns = 30; // Allow more turns for complex architectures
      const maxConsecutiveNoFunctionCallTurns = 2; // Reduced - agent should keep building
      
      while (turnCount < maxTurns) {
        turnCount++;
        console.log(`🔄 Starting conversation turn with ${finalCleanedConversation.length} items`);
        
        try {
          let stream;
          
          // Generate a session ID for proper queue management
          const sessionId = req.headers['x-session-id'] || `session-${Date.now()}`;
          
          console.log(`🔍 [${requestId}] Creating OpenAI stream request...`);
          
          // Use connection manager for controlled stream creation
          stream = await connectionManager.queueRequest(async () => {
            
            const tools = allTools.map(tool => ({
              type: "function",
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
              strict: false
            }));
            
            console.log(`🔍 [${requestId}] Using tools: ${tools.length} functions`);
            
            // Use the connection manager's optimized client
            const client = connectionManager.getAvailableClient();
            
            const requestPayload = {
              model: "o3", // Use O3 model for better architectures
              input: finalCleanedConversation,
              tools: tools,
              tool_choice: "auto",
              parallel_tool_calls: true,
              reasoning: { effort: "high", summary: "detailed" }, // O3 supports high reasoning effort
              stream: true
            };
            
            console.log(`🔍 [${requestId}] Final request payload to OpenAI:`, {
              model: requestPayload.model,
              inputMessages: requestPayload.input.length,
              tools: requestPayload.tools.length,
              tool_choice: requestPayload.tool_choice,
              parallel_tool_calls: requestPayload.parallel_tool_calls,
              reasoning: requestPayload.reasoning,
              stream: requestPayload.stream
            });
            
            return client.responses.create(requestPayload);
          }, sessionId ? 'high' : 'normal');
          
          console.log(`🔍 [${requestId}] OpenAI stream created successfully`);

          let messageCount = 0;
          for await (const delta of stream) {
            // Check if client has disconnected
            if (res.destroyed || res.closed) {
              console.warn('⚠️ Client disconnected during stream - stopping');
              break;
            }
            
            messageCount++;
            
            if (delta.type === "error") {
              console.error(`🔍 [${requestId}] Stream error received:`, delta);
              const errorMessage = delta.error?.message || "Stream error";
              
              // Handle specific 404 errors for missing OpenAI IDs with recovery
              if (errorMessage.includes('404') && errorMessage.includes('not found')) {
                console.error(`🔍 [${requestId}] 404 ERROR in stream - attempting recovery`);
                console.error(`  - Error message: ${errorMessage}`);
                
                // Detect type of missing ID
                let idType = 'unknown';
                if (errorMessage.includes('rs_')) idType = 'response_id';
                else if (errorMessage.includes('fc_')) idType = 'function_call_id';
                else if (errorMessage.includes('msg_')) idType = 'message_id';
                else if (errorMessage.includes('run_')) idType = 'run_id';
                else if (errorMessage.includes('thread_')) idType = 'thread_id';
                else if (errorMessage.includes('asst_')) idType = 'assistant_id';
                else if (errorMessage.includes('chatcmpl_')) idType = 'chat_completion_id';
                
                console.error(`  - ID type detected: ${idType}`);
                console.error(`  - Original conversation had response IDs: ${responseIds.length > 0 ? 'YES' : 'NO'}`);
                console.error(`  - Response IDs found: ${JSON.stringify(responseIds)}`);
                console.error(`  - Turn count: ${turnCount}`);
                console.error(`  - Conversation length: ${finalCleanedConversation.length}`);
                
                // Attempt recovery with fresh conversation
                console.log(`🔍 [${requestId}] Attempting 404 recovery with fresh conversation...`);
                
                try {
                  // Create a fresh conversation from the last 3 essential messages with aggressive cleaning
                  const freshConversation = [];
                  const systemMessage = finalCleanedConversation.find(msg => msg.role === 'system');
                  if (systemMessage) {
                    freshConversation.push(systemMessage);
                  }
                  
                  // Get the last 2 user/assistant messages
                  const userAssistantMessages = finalCleanedConversation.filter(msg => 
                    msg.role === 'user' || msg.role === 'assistant'
                  ).slice(-2);
                  freshConversation.push(...userAssistantMessages);
                  
                  // Ultra-aggressive cleaning using the same deep clean function
                  const ultraCleanConversation = deepCleanOpenAIIds(freshConversation);
                  
                  // Apply final safety check
                  const finalUltraCleanConversation = JSON.parse(JSON.stringify(ultraCleanConversation, (key, value) => {
                    if (typeof value === 'string' && value.match(/^(rs_|fc_|msg_|run_|thread_|asst_|chatcmpl_)/)) {
                      console.log(`🔍 [${requestId}] Recovery final safety check - removing OpenAI ID: ${value}`);
                      return undefined;
                    }
                    return value;
                  }));
                  
                  console.log(`🔍 [${requestId}] Fresh conversation created with ${finalUltraCleanConversation.length} messages`);
                  console.log(`🔍 [${requestId}] Ultra-clean conversation:`, JSON.stringify(finalUltraCleanConversation, null, 2));
                  
                  // Create new stream with ultra-clean conversation
                  const recoveryStream = await connectionManager.executeRequest(async (client) => {
                    return client.beta.chat.completions.create({
                      model: "o3",
                      input: finalUltraCleanConversation,
                      tools: tools,
                      tool_choice: "auto",
                      parallel_tool_calls: true,
                      reasoning: { effort: "high", summary: "detailed" },
                      stream: true
                    });
                  }, 'high');
                  
                  console.log(`🔍 [${requestId}] Recovery stream created - continuing with fresh conversation`);
                  
                  // Process the recovery stream
                  let recoveryMessageCount = 0;
                  for await (const recoveryDelta of recoveryStream) {
                    if (res.destroyed || res.closed) {
                      console.warn('⚠️ Client disconnected during recovery stream - stopping');
                      break;
                    }
                    
                    recoveryMessageCount++;
                    
                    if (recoveryDelta.type === "error") {
                      console.error(`🔍 [${requestId}] Recovery stream error:`, recoveryDelta);
                      // If recovery also fails, send error to client
                      send({ type: "error", error: recoveryDelta.error?.message || "Recovery stream error" });
                      continue;
                    }
                    
                    send(recoveryDelta);
                    
                    // Handle function calls in recovery stream
                    if (recoveryDelta.type === "response.output_item.done" && recoveryDelta.item?.type === "function_call") {
                      const funcCall = recoveryDelta.item;
                      console.log(`🎯 Processing function call in recovery: ${funcCall.name}`);
                      
                      if (!isFunctionCallOutput) {
                        const fco = {
                          type: "function_call_output",
                          call_id: funcCall.call_id,
                          output: JSON.stringify(elkGraph)
                        };
                        
                        send(fco);
                        finalCleanedConversation.push(fco);
                      }
                    }
                    
                    if (recoveryDelta.type === "response.completed") {
                      console.log(`🔍 [${requestId}] Recovery stream completed successfully`);
                      finalCleanedConversation.push(...recoveryDelta.response.output);
                      break;
                    }
                  }
                  
                  console.log(`🔍 [${requestId}] Recovery successful - processed ${recoveryMessageCount} messages`);
                  // Recovery successful - continue with the main loop
                  continue;
                  
                } catch (recoveryError) {
                  console.error(`🔍 [${requestId}] Recovery failed:`, recoveryError.message);
                  // Recovery failed - send error to client
                  send({ 
                    type: "error", 
                    error: "Response ID not found and recovery failed - session may have expired",
                    suggestion: "Try starting a new conversation"
                  });
                }
              } else {
                // Non-404 errors - send directly to client
                send({ 
                  type: "error", 
                  error: errorMessage
                });
              }
              continue;
            }
            
            try {
              send(delta);
            } catch (sendError) {
              if (sendError.message === 'Client disconnected') {
                console.warn('⚠️ Client disconnected - stopping stream processing');
                break;
              }
              throw sendError;
            }

            if (delta.type === "response.output_item.done" && delta.item?.type === "function_call") {
              const funcCall = delta.item;
              console.log(`🎯 Processing function call: ${funcCall.name}`);
              
              // Only create function call output if not already provided by client
              if (!isFunctionCallOutput) {
                const fco = {
                  type: "function_call_output",
                  call_id: funcCall.call_id,
                  output: JSON.stringify(elkGraph)
                };
                
                              send(fco);
                                  finalCleanedConversation.push(fco);
              } else {
                console.log(`📥 Function call output already provided by client for call_id: ${funcCall.call_id}`);
              }
            }

            if (delta.type === "response.completed") {
              const calls = delta.response?.output?.filter((x) => x.type === "function_call") ?? [];
              const textResponses = delta.response?.output?.filter((x) => x.type === "message") ?? [];
              
              if (calls.length === 0) {
                consecutiveNoFunctionCallTurns++;
                console.log(`⚠️  No function calls in this turn (${consecutiveNoFunctionCallTurns}/${maxConsecutiveNoFunctionCallTurns})`);
                
                // Check if the response indicates completion
                const responseText = textResponses.map((msg) => msg.content || '').join(' ').toLowerCase();
                const completionIndicators = [
                  'architecture is complete',
                  'diagram is finished', 
                  'all requirements satisfied',
                  'architecture diagram complete',
                  'final validation complete',
                  'all groups are built',
                  'complete architecture'
                ];
                
                const hasCompletionIndicator = completionIndicators.some(indicator => 
                  responseText.includes(indicator)
                );
                
                if (consecutiveNoFunctionCallTurns >= maxConsecutiveNoFunctionCallTurns || hasCompletionIndicator) {
                  console.log('✅ Conversation complete - no more function calls needed or completion indicated');
                  send({ type: "done", data: "[DONE]" });
                  res.write("data: [DONE]\n\n");
                  res.end();
                  return;
                }
                
                console.log('🔄 Allowing agent to continue thinking...');
              } else {
                consecutiveNoFunctionCallTurns = 0; // Reset counter when function calls are made
                console.log(`🔄 ${calls.length} function call(s) processed, continuing conversation loop`);
              }
              
                                finalCleanedConversation.push(...delta.response.output);
              break;
            }
          }
        } catch (apiError) {
          console.error('❌ OpenAI API Error:', apiError);
          
          // Check if this is a 404 error that should trigger recovery
          const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
          if (errorMessage.includes('404') && errorMessage.includes('not found')) {
            console.log(`🔍 [${requestId}] 404 error in API call - this should be handled by recovery in next iteration`);
            // Don't terminate - let the conversation continue to next turn where recovery will handle it
            continue;
          }
          
          // Original error handling for non-404 errors only
          send({ 
            type: "error", 
            error: errorMessage
          });
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }
      }
      
      // If we exit the while loop due to max turns, send completion
      console.log(`⚠️  Reached maximum turns (${maxTurns}), ending conversation`);
      send({ type: "done", data: "[DONE]" });
      res.write("data: [DONE]\n\n");
      res.end();
      return;
      
    } catch (error) {
      console.error('=== STREAMING ERROR ===', error);
      
      // Handle client disconnection gracefully
      if (error.message === 'Client disconnected' || 
          error.code === 'EPIPE' || 
          error.code === 'ECONNRESET' ||
          res.destroyed || res.closed) {
        console.warn('⚠️ Client disconnected during streaming - cleaning up');
        return;
      }
      
      // Only send error if client is still connected
      if (!res.destroyed && !res.closed) {
        try {
          send({ 
            type: "error", 
            error: error instanceof Error ? error.message : "Unknown error"
          });
          res.write("data: [DONE]\n\n");
          res.end();
        } catch (finalError) {
          console.error('❌ Failed to send final error message:', finalError.message);
        }
      }
    }
  } catch (error) {
    console.error('=== REQUEST ERROR ===', error);
    
    // Handle client disconnection at request level
    if (error.message === 'Client disconnected' || 
        error.code === 'EPIPE' || 
        error.code === 'ECONNRESET' ||
        res.destroyed || res.closed) {
      console.warn('⚠️ Client disconnected during request processing');
      return;
    }
    
    // Only send error response if client is still connected
    if (!res.destroyed && !res.closed) {
      try {
        return res.status(500).json({ 
          error: error instanceof Error ? error.message : String(error)
        });
      } catch (responseError) {
        console.error('❌ Failed to send error response:', responseError.message);
      }
    }
  }
} 