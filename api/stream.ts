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

export default async function handler(req: Request) {
  try {
    console.log('=== VERCEL STREAM REQUEST ===');
    console.log('Method:', req.method);
    console.log('Content-Type:', req.headers.get('content-type'));
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Content-Encoding',
        },
      });
    }

    // Get payload from request
    let payload: string;
    let isCompressed = false;
    
    if (req.method === "POST") {
      const body = await req.json();
      
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
          return new Response(JSON.stringify({ 
            error: "Failed to decompress payload",
            details: decompressError instanceof Error ? decompressError.message : String(decompressError)
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    } else {
      const url = new URL(req.url);
      payload = url.searchParams.get('payload') || '';
    }

    if (!payload) {
      return new Response(JSON.stringify({ error: "missing payload" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
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

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        const send = (data: any) => {
          const chunk = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
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
          
          const stream = await client.responses.create(requestPayload);
          
          console.log(`🔍 [${requestId}] OpenAI stream created successfully`);

          let messageCount = 0;
          for await (const delta of stream) {
            messageCount++;
            if (messageCount % 10 === 0) {
              console.log(`🔍 [${requestId}] Processed ${messageCount} stream messages...`);
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
              continue;
            }
            
            // Send all deltas to client
            send(delta);

            // Handle completion
            if (delta.type === "response.completed") {
              console.log(`✅ [${requestId}] Response completed after ${messageCount} messages`);
              break;
            }
          }
          
          console.log(`🔍 [${requestId}] Total stream messages processed: ${messageCount}`);
          
          // Send completion signal
          send('[DONE]');
          controller.close();
          
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
          
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Content-Encoding',
      },
    });

  } catch (error) {
    console.error('Stream handler error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Configure this endpoint to run in Edge Runtime for better performance
export const config = {
  runtime: 'edge',
};
