import OpenAI from "openai";
import { allTools } from "../client/realtime/toolCatalog.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    console.log('=== STREAM REQUEST ===');
    console.log('Method:', req.method);
    console.log('Content-Type:', req.headers['content-type']);
    
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error("OPENAI_API_KEY is not set");
      return res.status(500).json({ error: "API key not configured" });
    }
    
    // Get payload from request
    const payload = req.method === "POST"
      ? (req.body?.payload ?? req.body.payload)
      : req.query.payload;

    console.log('Has payload:', !!payload);

    if (!payload) {
      return res.status(400).json({ error: "missing payload" });
    }

    // Set up Server-Sent Events
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Parse initial conversation
    let conversation = JSON.parse(payload);
    console.log('Parsed conversation with', conversation.length, 'items');
    
    // Actually run the conversation loop with o4-mini reasoning model
    await runConversationLoop(conversation, res);
    
  } catch (error) {
    console.error('=== STREAMING ERROR ===');
    console.error('Error:', error.message);
    
    res.write(`data: ${JSON.stringify({ 
      type: "error", 
      error: error.message 
    })}\n\n`);
    res.end();
  }
}

async function runConversationLoop(conversation, res) {
  let elkGraph = { id: "root", children: [], edges: [] };
  
  // helper to push an SSE chunk to the browser
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  while (true) {
    console.log(`🔄 Starting conversation turn with ${conversation.length} items`);
    
    // Track which function calls we've already handled in this turn
    const handledCallIds = new Set();
    
    const stream = await client.responses.create({
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
      if (delta.type === "response.output_item.done" && delta.item?.type === "function_call") {
        const fc = delta.item;
        
        if (!handledCallIds.has(fc.call_id)) {
          handledCallIds.add(fc.call_id);
          console.log("🔧 immediate exec →", fc.name, "(call_id:", fc.call_id + ")");

          // For now, just return the current graph state for all functions
          // The actual execution will happen on the client side
          let toolResult;
          try {
            toolResult = { graph: elkGraph };
            console.log(`✅ Function ${fc.name} executed successfully`);
          } catch (e) {
            console.error(`❌ Function ${fc.name} failed:`, e);
            toolResult = { error: e.message };
          }

          const fco = {
            type: "function_call_output",
            call_id: fc.call_id,
            output: JSON.stringify(toolResult)      // ← back to JSON string, API expects string
          };

          send(fco);                 // give result to the model *immediately*
          conversation.push(fco);    // keep it in history
          console.log(`📝 Added function output to conversation for call_id: ${fc.call_id}`);
        } else {
          console.log(`⚠️ Skipping already handled call_id: ${fc.call_id}`);
        }
      }

      /* ─── finished turn? decide to loop or exit ─── */
      if (delta.type === "response.completed") {
        const calls = delta.response?.output?.filter((x) => x.type === "function_call") ?? [];
        if (calls.length === 0) {           // model is done
          console.log('✅ No function calls found, ending conversation');
          send({ type: "done", data: "[DONE]" });
          res.write("data: [DONE]\n\n");
          res.end();
          return;                  // model finished – no more calls
        }
        
        console.log(`🔄 ${calls.length} function call(s) processed, continuing conversation loop`);
        
        // Only add persistent items to conversation - exclude reasoning items that cause 404 errors
        const persistentItems = delta.response.output.filter((item) => 
          item.type === "function_call" || item.type === "message"
        );
        conversation.push(...persistentItems);
        break;                              // outer while continues
      }
    }
  }
} 