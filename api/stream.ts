import OpenAI from "openai";
import type { APIError } from "openai";

// Import allTools from the catalog
import { allTools } from "../client/realtime/toolCatalog";

const client = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 60000, // 60 seconds
});

// Helper to decompress base64 payload
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

export default async function handler(req: Request) {
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Content-Encoding'
      }
    });
  }

  try {
    console.log('=== STREAM REQUEST ===');
    console.log('Method:', req.method);
    
    // Get payload from request
    let payload: string | undefined;
    let isCompressed = false;
    
    if (req.method === "POST") {
      const body = await req.json();
      payload = body?.payload;
      isCompressed = body?.isCompressed === true;
      
      // Decompress if needed
      if (isCompressed && payload) {
        try {
          console.log('🔄 Decompressing payload...');
          payload = await decompressPayload(payload);
          console.log('✅ Payload decompressed successfully');
        } catch (decompressError) {
          console.error('❌ Failed to decompress payload:', decompressError);
          return new Response(JSON.stringify({ 
            error: "Failed to decompress payload",
            details: decompressError instanceof Error ? decompressError.message : String(decompressError)
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      }
    } else {
      const url = new URL(req.url);
      payload = url.searchParams.get('payload') ?? undefined;
    }

    if (!payload) {
      return new Response(JSON.stringify({ error: "missing payload" }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Create a new ReadableStream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (obj: unknown) => {
          const data = `data: ${JSON.stringify(obj)}\n\n`;
          controller.enqueue(encoder.encode(data));
        };

        try {
          // Parse initial conversation
          const conversation = JSON.parse(payload!);
          await runConversationLoop(conversation, send, controller);
        } catch (error) {
          console.error('=== STREAMING ERROR ===');
          console.error('Error type:', error?.constructor?.name);
          console.error('Error message:', error instanceof Error ? error.message : String(error));
          
          send({ 
            type: "error", 
            error: error instanceof Error ? error.message : "Unknown error",
            debug: {
              type: error?.constructor?.name,
              stack: error instanceof Error ? error.stack : undefined
            }
          });
          
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      }
    });

    // Return the stream response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error('=== REQUEST ERROR ===');
    console.error('Error:', error);
    
    return new Response(JSON.stringify({ 
      type: "error", 
      error: error instanceof Error ? error.message : String(error),
      debug: {
        type: error?.constructor?.name,
        stack: error instanceof Error ? error.stack : undefined
      }
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

async function runConversationLoop(
  conversation: any[],
  send: (obj: unknown) => void,
  controller: ReadableStreamDefaultController
) {
  const encoder = new TextEncoder();
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
          const errorDelta = delta as { type: "error"; error: APIError };
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

        if (delta.type === "response.completed") {
          const calls = delta.response?.output?.filter((x: any) => x.type === "function_call") ?? [];
          if (calls.length === 0) {
            console.log('✅ No function calls found, ending conversation');
            console.log(`🐛 DEBUG: Total stream messages processed: ${messageCount}`);
            send({ type: "done", data: "[DONE]" });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }
          
          console.log(`🔄 ${calls.length} function call(s) processed, continuing conversation loop`);
          console.log(`🐛 DEBUG: Total stream messages processed this turn: ${messageCount}`);
          
          // Only add persistent items to conversation
          const persistentItems = delta.response.output.filter((item: any) => 
            item.type === "message"
          );
          conversation.push(...persistentItems);
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
      
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
      return;
    }
  }
}

// Configure Edge runtime for better streaming support
export const config = {
  runtime: 'edge',
  regions: ['iad1'], // US East (N. Virginia) for lower latency
}; 