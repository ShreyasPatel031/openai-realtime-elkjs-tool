import OpenAI from 'openai';

// Import allTools from the catalog
import { allTools } from "./toolCatalog.js";
import { modelConfigs, timeoutConfigs, isReasoningModel } from "./agentConfig";

// Helper to decompress base64 payload for Edge Runtime
async function decompressPayload(base64String: string): Promise<string> {
  // In Node.js runtime, we can use native modules
  const zlib = require('zlib');
  const buffer = Buffer.from(base64String, 'base64');
  return zlib.gunzipSync(buffer).toString();
}

export default async function handler(req: any, res: any) {
  try {
    console.log('=== VERCEL STREAM REQUEST ===');
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
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Encoding');
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
        content: `**CRITICAL FIRST RULE: CREATE ALL EDGES INCREMENTALLY GROUP BY GROUP - NEVER DEFER EDGE CREATION TO THE END. EACH GROUP MUST BE COMPLETE WITH ALL ITS NODES AND ALL ITS EDGES IN THE SAME BATCH_UPDATE CALL.**

**CRITICAL EDGE LABEL RULE: EVERY SINGLE EDGE MUST HAVE A DESCRIPTIVE LABEL. Never create edges without labels. Use action verbs that describe the relationship (e.g., "calls", "sends", "queries", "processes", "stores", "authenticates", "routes", "validates", "monitors", "triggers", "publishes", "subscribes", "deploys", "serves", "protects", "caches", "transforms", "configures", "notifies", "syncs", "flows to", "connects to", "backs up", etc.).**

You are a technical architecture diagram assistant that MUST build complete architectures through multiple batch_update calls until the full architecture is complete.

**CRITICAL: NEVER STOP AFTER JUST ONE FUNCTION CALL**
- Make MULTIPLE batch_update calls to build ALL logical groups
- Continue building until the COMPLETE architecture is done
- Do NOT stop after displaying the graph once - keep building!

**CRITICAL GROUP CREATION PATTERN:**
1. First: Create individual nodes with add_node operations
2. Second: Group related nodes with group_nodes operation using groupIconName
3. Third: Add all edges for that group

Each batch_update call must include ALL nodes, the group_nodes operation, AND ALL edges for one complete logical group.

When requirements are provided always follow this logic:
Group: logical part of architecture (created with group_nodes + groupIconName)
Node: component of architecture (created with add_node)
Edge: relationship between components (created with add_edge)

**MANDATORY PATTERN FOR EACH GROUP:**
batch_update({
  operations: [
    // 1. Create all individual nodes first
    { name:"add_node", nodename:"...", parentId:"...", data:{label:"...", icon:"..."} },
    { name:"add_node", nodename:"...", parentId:"...", data:{label:"...", icon:"..."} },
    // 2. Group the nodes with proper groupIconName
    { name:"group_nodes", nodeIds:["...", "..."], parentId:"...", groupId:"...", groupIconName:"gcp_logical_grouping_services_instances" },
    // 3. Then add edges with proper hierarchy
    { name:"add_edge", edgeId:"...", sourceId:"...", targetId:"...", label:"..." }
  ]
})

**CRITICAL BATCH_UPDATE FORMAT:**
✅ CORRECT: batch_update({operations: [{name:"add_node", ...}, {name:"group_nodes", ...}]})
❌ WRONG: batch_update({graph: {...}}) - This will cause errors!

## Example Architecture Build Process:
/* ───────── 1. users group (create nodes first, then group them) */
batch_update({
  operations: [
    { name:"add_node", nodename:"web_user", parentId:"root",
      data:{ label:"Web", icon:"browser_client" } },
    { name:"add_node", nodename:"mobile_user", parentId:"root",
      data:{ label:"Mobile", icon:"mobile_app" } },
    { name:"group_nodes", nodeIds:["web_user", "mobile_user"], parentId:"root", groupId:"users", groupIconName:"gcp_system" }
  ]
})

/* ───────── 2. gcp edge/CDN group (create nodes first, then group them) */
batch_update({
  operations: [
    { name:"add_node", nodename:"gcp", parentId:"root",
      data:{ label:"Google Cloud Platform", icon:"gcp_logo" } },
    { name:"add_node", nodename:"cloud_cdn", parentId:"gcp",
      data:{ label:"Cloud CDN", icon:"gcp_cloud_cdn" } },
    { name:"add_node", nodename:"lb_https", parentId:"gcp",
      data:{ label:"HTTPS LB", icon:"load_balancer_generic" } },
    { name:"add_node", nodename:"cloud_armor", parentId:"gcp",
      data:{ label:"Cloud Armor", icon:"gcp_cloud_armor" } },
    { name:"group_nodes", nodeIds:["cloud_cdn", "lb_https", "cloud_armor"], parentId:"gcp", groupId:"edge", groupIconName:"gcp_logical_grouping_services_instances" },
    { name:"add_edge", edgeId:"e_cdn_lb", sourceId:"cloud_cdn", targetId:"lb_https", label:"route" },
    { name:"add_edge", edgeId:"e_waf_lb", sourceId:"cloud_armor", targetId:"lb_https", label:"protect" },
    { name:"add_edge", edgeId:"e_web_edge", sourceId:"web_user", targetId:"cloud_cdn", label:"HTTPS" },
    { name:"add_edge", edgeId:"e_mobile_edge", sourceId:"mobile_user", targetId:"cloud_cdn", label:"HTTPS" }
  ]
})

Always build complete architectures using multiple batch_update function calls. Never just describe - always BUILD the actual interactive diagram!`
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
    const model = 'gpt-4.1-2025-04-14';
    const timeout = 180000;
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: timeout,
    });

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
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
      
      // Check if this is a function call output continuation
      const isFunctionCallOutput = messages.length > 0 && 
        messages[0]?.type === "function_call_output";
      
      if (isFunctionCallOutput) {
        console.log(`🔄 Processing function call output: ${messages[0].call_id}`);
      }
      
      let elkGraph = { id: "root", children: [], edges: [] };
      let finalCleanedConversation = [...messages];
      let turnCount = 0;
      const maxTurns = 20;
      let consecutiveNoFunctionCallTurns = 0;
      const maxConsecutiveNoFunctionCallTurns = 2;
      
      // Send helper function
      const send = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      
      while (turnCount < maxTurns) {
        turnCount++;
        console.log(`🔄 Starting conversation turn with ${finalCleanedConversation.length} items`);
        
        const stream = await openai.responses.create({
          model: model,
          input: finalCleanedConversation,
          tools: allTools.map(tool => ({
            type: "function",
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
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
              const calls = delta.response?.output?.filter((x: any) => x.type === "function_call") ?? [];
              const textResponses = delta.response?.output?.filter((x: any) => x.type === "message") ?? [];
              
              if (calls.length === 0) {
                consecutiveNoFunctionCallTurns++;
                console.log(`⚠️  No function calls in this turn (${consecutiveNoFunctionCallTurns}/${maxConsecutiveNoFunctionCallTurns})`);
                
                // Check if the response indicates completion
                const responseText = textResponses.map((msg: any) => msg.content || '').join(' ').toLowerCase();
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
          } catch (deltaError) {
            console.error('❌ Error processing delta:', deltaError);
          }
        }
        
        if (turnCount >= maxTurns) {
          console.log('⚠️ Reached maximum conversation turns');
          break;
        }
      }
      
      // Final completion if we exit the loop
      console.log(`✅ Conversation loop completed after ${turnCount} turns`);
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