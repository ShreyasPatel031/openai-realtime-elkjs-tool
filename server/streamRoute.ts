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

  while (true) {
    console.log(`🔄 Starting conversation turn with ${conversation.length} items`);
    
    // Track which function calls we've already handled in this turn
    const handledCallIds = new Set<string>();
    
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
      send(delta);                                   // mirror every chunk to client

      // Debug: Log ALL delta types to see what we're actually receiving
      console.log("📨 Delta type:", delta.type);

      // Debug logs to see what the model is actually sending
      if (delta.type?.startsWith("function_call")) {
        console.log("🔔 delta function_call.* →", JSON.stringify(delta, null, 2));
      }
      if (delta.type === "response.reasoning_summary_text.delta") {
        console.log("🧠 reasoning →", delta.delta);
      }
      if (delta.type === "response.completed") {
        console.log("🏁 completed – output:", JSON.stringify(delta.response?.output, null, 2));
      }

      /* ─── execute as soon as the call is complete ─── */
      if (delta.type === "response.output_item.done" && (delta as any).item?.type === "function_call") {
        const fc = (delta as any).item;
        
        if (!handledCallIds.has(fc.call_id)) {
          handledCallIds.add(fc.call_id);
          console.log("🔧 immediate exec →", fc.name, "(call_id:", fc.call_id + ")");

          // For now, just return the current graph state for all functions
          // The actual execution will happen on the client side
          let toolResult: any;
          try {
            toolResult = { graph: elkGraph };
            console.log(`✅ Function ${fc.name} executed successfully`);
          } catch (e: any) {
            console.error(`❌ Function ${fc.name} failed:`, e);
            toolResult = { error: e.message };
          }

          const fco = {
            type: "function_call_output",
            call_id: fc.call_id,
            output: JSON.stringify(toolResult)      // ← back to JSON string, API expects string
          };

          send(fco);                 // give result to the model *immediately*
          console.log(`📝 Added function output to conversation for call_id: ${fc.call_id}`);
        } else {
          console.log(`⚠️ Skipping already handled call_id: ${fc.call_id}`);
        }
      }

      /* ─── finished turn? decide to loop or exit ─── */
      if (delta.type === "response.completed") {
        const calls = delta.response?.output?.filter((x: any) => x.type === "function_call") ?? [];
        if (calls.length === 0) {           // model is done
          console.log('✅ No function calls found, ending conversation');
          send({ type: "done", data: "[DONE]" });
          res.write("data: [DONE]\n\n");
          res.end();
          return;                  // model finished – no more calls
        }
        
        console.log(`🔄 ${calls.length} function call(s) processed, continuing conversation loop`);
        
        // Only add persistent items to conversation - exclude reasoning and function_call items to prevent API errors
        const persistentItems = delta.response.output.filter((item: any) => 
          item.type === "message"
        );
        conversation.push(...persistentItems);
        break;                              // outer while continues
      }
    }
  }
}

// Handle both GET and POST requests to the same endpoint
router.get("/stream", handleStreamRequest);
router.post("/stream", handleStreamRequest);

export default router; 