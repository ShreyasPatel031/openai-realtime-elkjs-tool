import { Router } from "express";
import OpenAI from "openai";
import { allTools } from "../client/realtime/toolCatalog.ts";

const router = Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Unified handler function for both GET and POST requests.
 * Always returns Server-Sent Events.
 */
const handleStreamRequest = async (req: any, res: any) => {
  console.log('=== STREAM REQUEST ===');
  console.log('Method:', req.method);
  console.log('Content-Type:', req.headers['content-type']);
  
  // ---------- 1. pull payload & previous_response_id ----------
  const payload = req.method === "POST"
    ? (req.body?.payload ?? req.body.payload)
    : req.query.payload;

  console.log('Has payload:', !!payload);
  console.log('Payload length:', typeof payload === 'string' ? payload.length : 0);

  if (!payload) {
    return res.status(400).json({ error: "missing payload" });
  }

  // ---------- 2. open SSE ----------
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    // ---------- 3. Parse initial conversation ----------
    let conversation = JSON.parse(payload);
    console.log('Initial conversation:', conversation);
    
    // ---------- 4. Run the conversation loop ----------
    await runConversationLoop(conversation, res);
    
  } catch (error) {
    console.error('=== STREAMING ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    
    res.write(`data: ${JSON.stringify({ 
      type: "error", 
      error: error instanceof Error ? error.message : "Unknown error", 
      details: error 
    })}\n\n`);
    res.end();
  }
};

async function runConversationLoop(conversation: any[], res: any) {
  let elkGraph = { id: "root", children: [], edges: [] };
  
  // helper to push an SSE chunk to the browser
  const send = (obj: any) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  // Track all function calls across turns to prevent duplicates
  const allHandledCallIds = new Set<string>();
  let turnCount = 0;
  const MAX_TURNS = 10; // Safety limit

  while (true) {
    turnCount++;
    if (turnCount > MAX_TURNS) {
      console.log('⚠️ Reached maximum turns limit');
      send({ 
        type: "error", 
        error: "Reached maximum conversation turns limit", 
        debug: { turnCount, MAX_TURNS } 
      });
      break;
    }

    console.log(`🔄 Starting conversation turn ${turnCount} with ${conversation.length} items`);
    
    try {
      const stream = await client.responses.create({
        model: "o4-mini",
        input: conversation,
        tools: allTools.map(tool => ({
          type: "function" as const,
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

      for await (const delta of stream) {
        // Debug: Log ALL delta types
        console.log("📨 Delta type:", delta.type, delta);

        // Check for OpenAI API errors
        if (delta.type === "error" && delta.error) {
          console.error("❌ OpenAI API Error:", delta.error);
          send({ 
            type: "error", 
            error: `OpenAI API Error: ${delta.error}`,
            debug: delta 
          });
          continue;
        }

        send(delta); // mirror chunk to client

        // Handle function calls
        if (delta.type === "response.output_item.done" && (delta as any).item?.type === "function_call") {
          const fc = (delta as any).item;
          
          if (allHandledCallIds.has(fc.call_id)) {
            console.log(`⚠️ Skipping duplicate call_id: ${fc.call_id}`);
            continue;
          }

          console.log("🔧 Function call completed →", {
            name: fc.name,
            call_id: fc.call_id,
            args: fc.args
          });

          allHandledCallIds.add(fc.call_id);
        }

        // Handle turn completion
        if (delta.type === "response.completed") {
          const calls = delta.response?.output?.filter((x: any) => x.type === "function_call") ?? [];
          
          if (calls.length === 0) {
            console.log('✅ No function calls found, ending conversation');
            send({ type: "done", data: "[DONE]" });
            res.write("data: [DONE]\n\n");
            res.end();
            return;
          }
          
          console.log(`🔄 Turn ${turnCount} complete: ${calls.length} function call(s) processed`);
          
          // Only add persistent items to conversation
          const persistentItems = delta.response.output.filter((item: any) => 
            item.type === "message"
          );
          conversation.push(...persistentItems);
          break; // Continue to next turn
        }
      }
    } catch (error) {
      console.error('❌ Stream error:', error);
      send({ 
        type: "error", 
        error: error instanceof Error ? error.message : "Stream error",
        debug: { error, turn: turnCount }
      });
      break;
    }
  }

  // Ensure we always end the response
  res.write("data: [DONE]\n\n");
  res.end();
}

// Handle both GET and POST requests to the same endpoint
router.get("/stream", handleStreamRequest);
router.post("/stream", handleStreamRequest);

export default router; 