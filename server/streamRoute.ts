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
    console.log('Content-Type:', req.get('Content-Type'));
    
    // Get payload from request
    let payload: string | undefined;
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
      
      // If we have uploaded files, add them to the conversation
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        console.log(`📸 Processing ${req.files.length} uploaded image(s)...`);
        
        // Find the last user message
        const lastUserMessageIndex = conversation.findLastIndex((msg: any) => msg.role === 'user');
        
        if (lastUserMessageIndex !== -1) {
          const lastUserMessage = conversation[lastUserMessageIndex];
          
          // Convert content to array format if it's a string
          if (typeof lastUserMessage.content === 'string') {
            lastUserMessage.content = [
              { type: 'input_text', text: lastUserMessage.content }
            ];
          }
          
          // Add images to the content
          req.files.forEach((file: any, index: number) => {
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
      
      while (true) {
        console.log(`🔄 Starting conversation turn with ${conversation.length} items`);
        
        try {
          console.log('🐛 DEBUG: Creating OpenAI stream...');
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
              break;
            } catch (streamError) {
              retryCount++;
              console.error(`❌ Stream creation failed (attempt ${retryCount}/3):`, streamError);
              if (retryCount === 3) {
                throw streamError;
              }
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
            }
          }
          
          console.log('✅ OpenAI stream created successfully');

          let messageCount = 0;
          for await (const delta of stream!) {
            messageCount++;
            if (messageCount % 10 === 0) {
              console.log(`🐛 DEBUG: Processed ${messageCount} stream messages so far...`);
            }
            
            if (delta.type === "error") {
              const errorDelta = delta as { type: "error"; error: any };
              console.error('❌ Stream error:', errorDelta);
              send({ 
                type: "error", 
                error: errorDelta.error.message || "Stream error"
              });
              continue;
            }
            
            send(delta);

            if (delta.type === "response.output_item.done" && delta.item?.type === "function_call") {
              const funcCall = delta.item;
              console.log(`🎯 Processing function call: ${funcCall.name}`);
              
              const fco = {
                type: "function_call_output",
                call_id: funcCall.call_id,
                output: JSON.stringify(elkGraph)
              };
              
              send(fco);
              conversation.push(fco);
            }

            if (delta.type === "response.completed") {
              const calls = delta.response?.output?.filter((x: any) => x.type === "function_call") ?? [];
              if (calls.length === 0) {
                console.log('✅ No function calls found, ending conversation');
                send({ type: "done", data: "[DONE]" });
                res.write("data: [DONE]\n\n");
                res.end();
                return;
              }
              
              console.log(`🔄 ${calls.length} function call(s) processed, continuing conversation loop`);
              conversation.push(...delta.response.output);
              break;
            }
          }
        } catch (apiError) {
          console.error('❌ OpenAI API Error:', apiError);
          send({ 
            type: "error", 
            error: apiError instanceof Error ? apiError.message : "OpenAI API error"
          });
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }
      }
    } catch (error) {
      console.error('=== STREAMING ERROR ===', error);
      send({ 
        type: "error", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (error) {
    console.error('=== REQUEST ERROR ===', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : String(error)
    });
  }
} 