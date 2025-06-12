import { Request, Response } from 'express';
import OpenAI from "openai";
import { gunzipSync } from 'node:zlib';
import { allTools } from "../client/realtime/toolCatalog";

const client = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 60000, // 60 seconds
});

// Helper to decompress base64 payload using Node.js APIs
const decompressPayload = (compressed: string): string => {
  // base64 → Buffer
  const buf = Buffer.from(compressed, 'base64');
  // gunzip
  const decompressed = gunzipSync(buf);
  return decompressed.toString('utf8');
};

export default async function streamHandler(req: Request, res: Response) {
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
    
    // Get payload from request
    let payload: string | undefined;
    let isCompressed = false;
    
    if (req.method === "POST") {
      payload = req.body?.payload;
      isCompressed = req.body?.isCompressed === true;
      
      // Decompress if needed
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
      payload = req.query.payload as string | undefined;
    }

    if (!payload) {
      return res.status(400).json({ error: "missing payload" });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Helper to send SSE messages
    const send = (obj: unknown) => {
      const data = `data: ${JSON.stringify(obj)}\n\n`;
      res.write(data);
    };

    try {
      // Parse initial conversation
      const conversation = JSON.parse(payload);
      let elkGraph = { id: "root", children: [], edges: [] };
      
      while (true) {
        console.log(`🔄 Starting conversation turn with ${conversation.length} items`);
        console.log('🐛 DEBUG: About to call OpenAI API...');
        
        // Track which function calls we've already handled in this turn
        const handledCallIds = new Set<string>();
        
        try {
          console.log('🐛 DEBUG: Creating OpenAI stream with client...');
          let retryCount = 0;
          let stream;
          
          while (retryCount < 3) {
            try {
              stream = await client.responses.create({
                model: "o4-mini",
                input: conversation,
                tools: allTools.map(tool => ({
                  type: "function",
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                  strict: false
                })),
                tool_choice: "auto",
                parallel_tool_calls: false,
                reasoning: { effort: "low", summary: "detailed" },
                stream: true
              });
              break; // If successful, exit retry loop
            } catch (streamError) {
              retryCount++;
              console.error(`❌ Stream creation failed (attempt ${retryCount}/3):`, streamError);
              if (retryCount === 3) {
                throw streamError; // Re-throw after all retries exhausted
              }
              // Wait before retrying (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
            }
          }
          
          console.log('🐛 DEBUG: OpenAI stream created successfully');

          let messageCount = 0;
          for await (const delta of stream!) {
            messageCount++;
            if (messageCount % 10 === 0) {
              console.log(`🐛 DEBUG: Processed ${messageCount} stream messages so far...`);
            }
            
            // Handle errors in the stream
            if (delta.type === "error") {
              const errorDelta = delta as { type: "error"; error: any };
              console.error('❌ Stream error:', errorDelta);
              send({ 
                type: "error", 
                error: errorDelta.error.message || "Stream error",
                debug: {
                  type: errorDelta.error.type,
                  details: errorDelta.error
                }
              });
              continue;
            }
            
            send(delta);

            // Handle function calls and generate outputs
            if (delta.type === "response.output_item.done" && delta.item?.type === "function_call") {
              const funcCall = delta.item;
              console.log(`🎯 Processing function call: ${funcCall.name}`);
              
              // Build function call output
              const fco = {
                type: "function_call_output",
                call_id: funcCall.call_id,
                output: JSON.stringify(elkGraph)
              };
              
              // Send it back to the model
              send(fco);
              
              // Keep it in history
              conversation.push(fco);
            }

            if (delta.type === "response.completed") {
              const calls = delta.response?.output?.filter((x: any) => x.type === "function_call") ?? [];
              if (calls.length === 0) {
                console.log('✅ No function calls found, ending conversation');
                console.log(`🐛 DEBUG: Total stream messages processed: ${messageCount}`);
                send({ type: "done", data: "[DONE]" });
                res.write("data: [DONE]\n\n");
                res.end();
                return;
              }
              
              console.log(`🔄 ${calls.length} function call(s) processed, continuing conversation loop`);
              console.log(`🐛 DEBUG: Total stream messages processed this turn: ${messageCount}`);
              
              // Keep everything the model sent so it remembers its own tool use
              conversation.push(...delta.response.output);
              break;
            }
          }
        } catch (apiError) {
          console.error('🐛 DEBUG: OpenAI API Error:', apiError?.constructor?.name);
          console.error('🐛 DEBUG: OpenAI API Error message:', apiError instanceof Error ? apiError.message : String(apiError));
          
          // Check if it's a connection error
          const isConnectionError = 
            apiError?.constructor?.name === 'APIConnectionError' ||
            String(apiError).toLowerCase().includes('connection') ||
            String(apiError).toLowerCase().includes('network') ||
            String(apiError).toLowerCase().includes('timeout');
          
          send({ 
            type: "error", 
            error: `OpenAI API Error: ${apiError instanceof Error ? apiError.message : String(apiError)}`,
            debug: {
              type: apiError?.constructor?.name,
              stack: apiError instanceof Error ? apiError.stack : undefined,
              isConnectionError,
              suggestion: isConnectionError ? 
                "This appears to be a temporary connection issue. Please try again in a few moments." :
                "An unexpected error occurred. Please check the console for details."
            }
          });
          
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }
      }
    } catch (error) {
      console.error('=== REQUEST ERROR ===');
      console.error('Error:', error);
      
      send({ 
        type: "error", 
        error: error instanceof Error ? error.message : String(error),
        debug: {
          type: error?.constructor?.name,
          stack: error instanceof Error ? error.stack : undefined
        }
      });
      
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (error) {
    console.error('=== OUTER ERROR ===');
    console.error('Error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : String(error),
      debug: {
        type: error?.constructor?.name,
        stack: error instanceof Error ? error.stack : undefined
      }
    });
  }
} 