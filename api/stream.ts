import OpenAI from 'openai';

// Import allTools from the catalog
import { allTools } from "./toolCatalog.js";
import { modelConfigs, timeoutConfigs, isReasoningModel, elkGraphDescription } from "./agentConfig";

// Helper to decompress base64 payload for Edge Runtime
async function decompressPayload(base64String: string): Promise<string> {
  // In Node.js runtime, we can use native modules
  const zlib = require('zlib');
  const buffer = Buffer.from(base64String, 'base64');
  return zlib.gunzipSync(buffer).toString();
}

export default async function handler(req: any, res: any) {
  try {
    console.log('=== VERCEL STREAM REQUEST (with CORS fix) ===');
    console.log('Method:', req.method);
    console.log('Content-Type:', req.headers['content-type']);
    
    // Check environment variables
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY not found');
      res.status(500).json({ error: 'Missing OpenAI API key' });
      return;
    }
    
    console.log('✅ Environment check passed');
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Encoding, x-session-id');
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
      console.error('❌ No payload provided');
      res.status(400).json({ error: 'No payload provided' });
      return;
    }

    console.log('📦 Processing payload...');
    
    let parsedPayload;
    try {
      parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch (error) {
      console.error('❌ Failed to parse payload:', error);
      res.status(400).json({ error: 'Invalid payload format' });
      return;
    }

    // Parse conversation array (like the working local server)
    const conversation = Array.isArray(parsedPayload) ? parsedPayload : [];
    
    // Add comprehensive system message if conversation doesn't already have one
    let messages = conversation;
    if (messages.length === 0 || messages[0]?.role !== 'system') {
      const systemMessage = {
        role: 'system' as const,
        // Pull all static instructions from central config
        content: elkGraphDescription
      };
      
      if (messages.length === 0) {
        messages = [systemMessage];
      } else {
        messages = [systemMessage, ...messages];
      }
    }
    
    console.log(`🔍 Conversation length: ${messages.length}`);
    console.log(`🔍 Processing conversation for reasoning agent`);

    // Initialize OpenAI client
    console.log('🤖 Initializing OpenAI client...');
    const model = modelConfigs.reasoning.model;
    const timeout = timeoutConfigs.requestTimeout;
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: timeout,
    });

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Encoding, x-session-id');

    console.log('🌊 Starting OpenAI stream...');

    // Use the messages array that was already prepared with system message
    // messages is already set above with proper system message

    try {
      console.log('🔄 Starting conversation loop (exact copy from local dev)');
      
      // Extract current graph state from the system message
      let elkGraph = { id: "root", children: [], edges: [] };
      
      // Check if this is a function call output continuation
      const isFunctionCallOutput = messages.length > 0 && 
        messages[0]?.type === "function_call_output";
      
      if (isFunctionCallOutput) {
        console.log(`🔄 Processing function call output: ${messages[0].call_id}`);
      }
      
      // Look for the current graph state in the system message
      const systemMessage = messages.find(msg => msg.role === 'system');
      if (systemMessage && systemMessage.content) {
        const graphMatch = systemMessage.content.match(/```json\n([\s\S]*?)\n```/);
        if (graphMatch) {
          try {
            const parsedGraph = JSON.parse(graphMatch[1]);
            elkGraph = parsedGraph;
            console.log('📊 Extracted current graph state from system message:', elkGraph);
          } catch (error) {
            console.error('❌ Failed to parse graph state from system message:', error);
          }
        } else {
          console.log('⚠️ No graph state found in system message, using empty graph');
        }
      }
      
      let finalCleanedConversation = [...messages];
      let turnCount = 0;
      
      // Send helper function
      const send = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      
      while (true) { // Continue until natural completion
        turnCount++;
        console.log(`🔄 Starting conversation turn ${turnCount} with ${finalCleanedConversation.length} items`);
        
        const stream = await openai.responses.create({
          model: model,
          input: finalCleanedConversation,
          tools: allTools.map(tool => ({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            strict: false
          })),
          tool_choice: "auto",
          parallel_tool_calls: true,
          stream: true
        });

        console.log('🔍 OpenAI stream created successfully');

        let messageCount = 0;
        for await (const delta of stream) {
          // Check if client has disconnected
          if (res.destroyed) {
            console.warn('⚠️ Client disconnected during stream - stopping');
            break;
          }
          
          messageCount++;
          
          try {
            send(delta);
            
            if (delta.type === "response.output_item.done" && delta.item?.type === "function_call") {
              const funcCall = delta.item;
              console.log(`🎯 Processing function call: ${funcCall.name}`);
              
              // Skip providing function call outputs - the frontend handles all function calls locally
              console.log(`📥 Skipping function call output - frontend handles execution locally`);
            }

            if (delta.type === "response.completed") {
              const calls = delta.response?.output?.filter((x: any) => x.type === "function_call") ?? [];
              const textResponses = delta.response?.output?.filter((x: any) => x.type === "message") ?? [];
              
              // Check if the response indicates completion
              const responseText = textResponses.map((msg: any) => msg.content || '').join(' ').toLowerCase();
              console.log(`🔍 Checking response text for completion: "${responseText}"`);
              
              const completionIndicators = [
                'all user requirements have been fully implemented',
                'architecture completely fulfills the user requirements',
                'user requirements are completely satisfied',
                'the architecture is now complete and fulfills all requirements',
                'all aspects of the user requirements have been implemented',
                'architecture diagram complete and requirements satisfied',
                'final architecture complete - all requirements met'
              ];
              
              const hasCompletionIndicator = completionIndicators.some(indicator => 
                responseText.includes(indicator)
              );
              
              console.log(`🔍 Completion indicator found: ${hasCompletionIndicator}`);
              
              if (calls.length === 0 && hasCompletionIndicator) {
                console.log('✅ Conversation complete - AI indicated completion');
                send({ type: "done", data: "[DONE]" });
                res.write("data: [DONE]\n\n");
                res.end();
                return;
              } else if (calls.length > 0) {
                console.log(`🔄 ${calls.length} function call(s) processed, continuing conversation loop`);
                console.log(`🔄 About to break from delta loop and continue to next conversation turn`);
                
                // Add a continuation prompt when function calls were made
                finalCleanedConversation.push({
                  type: "message",
                  role: "user", 
                  content: "Continue calling functions until the architecture completely fulfills the user requirements. The architecture is NOT complete yet. Keep adding components, services, databases, networking, security, monitoring, and all infrastructure needed. Connect all components with proper edges. Only stop when every aspect of the user's requirements has been fully implemented in the architecture diagram."
                });
                console.log("🔄 Added continuation prompt to encourage more architecture building");
              } else {
                console.log('🔄 No function calls this turn, but no completion indicated - continuing...');
              }
              
              // Filter out function calls without outputs to avoid OpenAI API errors
              const outputToAdd = delta.response.output.filter((item: any) => {
                if (item.type === "function_call") {
                  // Only include function calls that have been executed (frontend handles them)
                  return false; // Skip function calls since frontend handles them locally
                }
                return true; // Include all other types (messages, etc.)
              });
              
              finalCleanedConversation.push(...outputToAdd);
              console.log(`🔄 Added ${outputToAdd.length} items to conversation (filtered ${delta.response.output.length - outputToAdd.length} function calls). Total items: ${finalCleanedConversation.length}`);
              break;
            }
          } catch (deltaError) {
            console.error('❌ Error processing delta:', deltaError);
          }
        }
        
        // No need to check maxTurns since we let it run until natural completion
      }
      
      // Final completion if we exit the loop
      console.log(`✅ Conversation naturally completed after ${turnCount} turns`);
      send({ type: "done", data: "[DONE]" });
      res.write('data: [DONE]\n\n');
      res.end();

    } catch (openaiError) {
      console.error('❌ OpenAI API error:', openaiError);
      
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'OpenAI API failed',
          details: openaiError instanceof Error ? openaiError.message : String(openaiError)
        });
      } else {
        res.write(`data: {"error": "OpenAI API failed: ${openaiError instanceof Error ? openaiError.message : String(openaiError)}"}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }

  } catch (error) {
    console.error('❌ Stream handler error:', error);
    
    try {
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Stream handler failed',
          details: error instanceof Error ? error.message : String(error)
        });
      } else {
        res.write(`data: {"error": "Stream failed: ${error instanceof Error ? error.message : String(error)}"}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } catch (responseError) {
      console.error('❌ Failed to send error response:', responseError);
    }
  }
} 