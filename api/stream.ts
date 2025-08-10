import OpenAI from 'openai';

// Import allTools from the catalog
import { allTools } from "./toolCatalog.js";
import { modelConfigs, timeoutConfigs, isReasoningModel, elkGraphDescription } from "./agentConfig";



export default async function handler(req: any, res: any) {
  try {
    // Server request received
    
    // Check environment variables
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY not found');
      res.status(500).json({ error: 'Missing OpenAI API key' });
      return;
    }
    
      // Env OK
    
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
    let previousResponseIdFromClient: string | undefined;
    
    if (req.method === "POST") {
      const body = req.body;
      
      // For FormData requests (with images), conversation is in body?.conversation
      // For JSON requests, payload is in body?.payload
      payload = body?.conversation || body?.payload;
      previousResponseIdFromClient = body?.previous_response_id;
    } else {
      payload = req.query.payload || '';
      previousResponseIdFromClient = req.query.previous_response_id;
    }

    if (!payload) {
      console.error('❌ No payload provided');
      res.status(400).json({ error: 'No payload provided' });
      return;
    }

    // Processing payload
    
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
    
    // Detect if this is a tool output continuation (Responses API item)
    const isFunctionCallOutput = Array.isArray(conversation) && conversation[0]?.type === 'function_call_output';
    
    // Request analysis

    // Add comprehensive system message only for normal role-based conversations
    let messages = conversation;
    if (!isFunctionCallOutput) {
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
    }
    
    // Conversation ready for reasoning agent

    // Initialize OpenAI client
    // Initializing OpenAI client
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

    // Starting OpenAI stream

    // Use the messages array that was already prepared with system message
    // messages is already set above with proper system message

    try {
      // Starting conversation loop
      
      // Extract current graph state from the system message
      let elkGraph = { id: "root", children: [], edges: [] };
      
      // isFunctionCallOutput already computed above
      
      if (isFunctionCallOutput) {
          // Processing function call output
      }
      
      // Look for the current graph state in the system message
      const systemMessage = messages.find(msg => msg.role === 'system');
      if (systemMessage && systemMessage.content) {
        const graphMatch = systemMessage.content.match(/```json\n([\s\S]*?)\n```/);
        if (graphMatch) {
          try {
            const parsedGraph = JSON.parse(graphMatch[1]);
            elkGraph = parsedGraph;
            // Extracted current graph state
          } catch (error) {
            console.error('❌ Failed to parse graph state from system message:', error);
          }
        } else {
          // No graph state found in system message
        }
      }
      
      let finalCleanedConversation = [...messages];
      // For tool output continuations, do not filter; pass raw items through
      if (!isFunctionCallOutput) {
        // Strictly keep only role-based messages (system/user/assistant) as inputs
        finalCleanedConversation = finalCleanedConversation.filter((item: any) => 'role' in item);
      }
      let turnCount = 0;
      let lastResponseId: string | null = null;
      let lastUserNudge: any | null = null;
      
      // Send helper function
      const send = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      
      while (true) { // Continue until natural completion
        turnCount++;
        // Starting conversation turn
        
        // Allow ALL tools. Prompting (not hard restrictions) will steer behavior.
        const allowedTools = allTools.map(tool => ({ type: "function", name: tool.name }));
        const baseRequest: any = {
          model,
          tools: allTools.map(tool => ({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          })),
          // Let the model choose when to call tools vs return messages
          tool_choice: "auto",
          parallel_tool_calls: false,
          stream: true
        };

        // Provide minimal reasoning effort and low verbosity specifically for GPT-5 variants
        if (String(model).includes('gpt-5')) {
          baseRequest.reasoning = { effort: "minimal" };
          baseRequest.text = { verbosity: "low" };
        }

        // If this is a tool output continuation from client, require a valid previous_response_id
        if (isFunctionCallOutput) {
          console.log('🔧 Processing function call output continuation');
          console.log('🔍 Function call outputs:', conversation.map((item: any) => ({
            type: item.type,
            call_id: item.call_id,
            output_length: item.output?.length || 0
          })));
          
          if (!previousResponseIdFromClient || !String(previousResponseIdFromClient).startsWith('resp_')) {
            console.error('❌ Invalid or missing previous_response_id for tool output:', previousResponseIdFromClient);
            if (!res.headersSent) {
              res.status(400).json({
                error: "Missing or invalid previous_response_id for tool output chaining",
                details: "Client must supply a valid previous_response_id (resp_*) when sending function_call_output"
              });
            }
            return;
          }
          
          // Validate that all items are function_call_output types
          const invalidItems = conversation.filter((item: any) => item.type !== 'function_call_output');
          if (invalidItems.length > 0) {
            console.error('❌ Invalid items in function call output request:', invalidItems);
            if (!res.headersSent) {
              res.status(400).json({
                error: "Invalid function call output format",
                details: "All items must be of type 'function_call_output'"
              });
            }
            return;
          }
          
          baseRequest.previous_response_id = previousResponseIdFromClient;
          baseRequest.input = conversation; // pass raw tool output item(s)
          console.log(`✅ Tool output chaining with response ID: ${previousResponseIdFromClient}`);
        } else if (lastResponseId && lastUserNudge) {
          // Normal next turn: chain with last response id and only send nudge
          baseRequest.previous_response_id = lastResponseId;
          baseRequest.input = [lastUserNudge];
        } else {
          baseRequest.input = finalCleanedConversation;
        }

        // Minimal request verification log (headers implied via SDK)
        try {
          const toolsValid = Array.isArray(baseRequest.tools) && baseRequest.tools.every((t: any) => t?.type === 'function' && t?.name && t?.parameters && t?.parameters.type === 'object');
          console.log('REQ /v1/responses', {
            model: baseRequest.model,
            tool_choice: baseRequest.tool_choice,
            stream: baseRequest.stream === true,
            parallel_tool_calls: !!baseRequest.parallel_tool_calls,
            tools_valid: toolsValid,
            tools_count: Array.isArray(baseRequest.tools) ? baseRequest.tools.length : 0,
            has_previous_response_id: !!baseRequest.previous_response_id
          });
        } catch {}

        // Create stream (no fallback – invalid chaining must fail loudly)
        const stream: any = await openai.responses.create(baseRequest);

        // OpenAI stream created

        // Minimal, protocol-aligned logging only
        let createdLogged = false;
        for await (const delta of stream) {
          // Check if client has disconnected more gracefully
          if (res.destroyed || res.writableEnded || !res.writable) {
            console.warn('⚠️ Client disconnected during stream - stopping gracefully');
            try {
              // Attempt to clean up the stream
              if (typeof stream.controller?.abort === 'function') {
                stream.controller.abort();
              }
            } catch (cleanupError) {
              console.warn('⚠️ Error during stream cleanup:', cleanupError);
            }
            break;
          }
          try {
            // Emit the SSE as-is
            send(delta);
            // Protocol visibility logs (strict subset)
            if (delta.type === 'response.created' && !createdLogged) {
              createdLogged = true;
              console.log('EVENT response.created');
            }
            // Suppress noisy per-delta logs; keep minimal visibility
            // function_call_arguments.delta and .done are intentionally not logged per event
            if (delta.type === 'response.output_item.added' && (delta as any)?.item?.type === 'function_call') {
              // Keep a single concise log for tool-call addition
              console.log('EVENT response.output_tool_call.added');
            }
            
            // Do not synthesize function_call_output here; the frontend will send real outputs

            if (delta.type === "response.completed") {
              console.log('EVENT response.completed');
              const calls = delta.response?.output?.filter((x: any) => x.type === "function_call") ?? [];
              const textResponses = delta.response?.output?.filter((x: any) => x.type === "message") ?? [];
              // Server-side debug: log output type counts
              const typeCounts: Record<string, number> = {};
              for (const item of (delta.response?.output ?? [])) {
                typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
              }
              // output type counts
              if (delta.response?.id) {
                lastResponseId = delta.response.id;
                // Echo the response id back to client so the follow-up tool output can chain correctly
                send({ type: 'response.id', id: lastResponseId });
              }
              
              // Check if the response indicates completion
              const responseText = textResponses.map((msg: any) => msg.content || '').join(' ').toLowerCase();
              const completionIndicators = [
                'all user requirements have been fully implemented',
                'architecture completely fulfills the user requirements',
                'user requirements are completely satisfied',
                'the architecture is now complete and fulfills all requirements',
                'all aspects of the user requirements have been implemented',
                'architecture diagram complete and requirements satisfied',
                'final architecture complete - all requirements met'
              ];
              const hasCompletionIndicator = completionIndicators.some(indicator => responseText.includes(indicator));

              // Special handling: for function_call_output continuations, ALWAYS end this turn after response.completed
              if (isFunctionCallOutput) {
                send({ type: 'done', data: '[DONE]' });
                res.write('data: [DONE]\n\n');
                res.end();
                return;
              }

              // Normal conversational handling
              if (calls.length === 0 && hasCompletionIndicator) {
                console.log('✅ Conversation complete - AI indicated completion');
                send({ type: 'done', data: '[DONE]' });
                res.write('data: [DONE]\n\n');
                res.end();
                return;
              } else if (calls.length > 0) {
                // One or more tool calls were issued. Stop the server loop now and
                // let the client execute tools and POST back function_call_output in a new request.
                send({ type: 'done', data: '[DONE]' });
                res.write('data: [DONE]\n\n');
                res.end();
                return;
              } else {
                // hard nudge to force tool use
                lastUserNudge = {
                  role: 'user',
                  content: 'Use batch_update now with a small set of 3–7 operations to make incremental progress. After executing, return the entire current graph JSON in a message. Continue this small-burst cadence across turns until the architecture is complete.'
                };
                finalCleanedConversation.push(lastUserNudge);
              }
              
              // Do NOT feed back any assistant outputs (message/reasoning/function_call) to next turn.
              // GPT-5 may require paired reasoning/message items; excluding them avoids 400 pairing errors.
              const outputToAdd: any[] = [];
              
              finalCleanedConversation.push(...outputToAdd);
              // added assistant items
              break;
            }
          } catch (deltaError) {
            console.error('❌ Error processing delta:', deltaError);
          }
        }
        
        // Capture response id for next turn chaining
        if (lastResponseId == null) {
          // best effort; response id is usually available on response.completed
        }
        // No need to check maxTurns since we let it run until natural completion
      }
      
      // Final completion if we exit the loop
      // conversation completed
      send({ type: "done", data: "[DONE]" });
      res.write('data: [DONE]\n\n');
      res.end();

    } catch (openaiError) {
      console.error('❌ OpenAI API error:', openaiError);
      
      // Extract more detailed error information
      let errorMessage = 'Unknown error';
      let errorCode = 500;
      
      if (openaiError instanceof Error) {
        errorMessage = openaiError.message;
        
        // Handle specific OpenAI API errors
        if (errorMessage.includes('No tool output found')) {
          const callIdMatch = errorMessage.match(/call_[a-zA-Z0-9]+/);
          const missingCallId = callIdMatch ? callIdMatch[0] : 'unknown';
          console.error('🚨 OpenAI "No tool output found" error - function call ID mismatch');
          console.error('🚨 This usually happens when function calls are sent with wrong response ID context');
          console.error('🚨 Missing function call ID:', missingCallId);
          console.error('🚨 Request details:', { 
            method: req.method, 
            hasResponseId: !!previousResponseIdFromClient,
            responseId: previousResponseIdFromClient
          });
          errorMessage = `Function call ID mismatch: OpenAI expected output for ${missingCallId} but received different context`;
          errorCode = 400;
        } else if (errorMessage.includes('Invalid request')) {
          console.error('🚨 OpenAI invalid request error');
          errorCode = 400;
        } else if (errorMessage.includes('rate limit')) {
          console.error('🚨 OpenAI rate limit error');
          errorCode = 429;
        }
      }
      
      if (!res.headersSent) {
        res.status(errorCode).json({ 
          error: 'OpenAI API failed',
          details: errorMessage,
          errorType: openaiError instanceof Error ? openaiError.name : 'UnknownError'
        });
      } else {
        res.write(`data: {"error": "OpenAI API failed: ${errorMessage}", "errorType": "${openaiError instanceof Error ? openaiError.name : 'UnknownError'}"}\n\n`);
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