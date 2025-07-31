import OpenAI from 'openai';

// Simple model config without heavy imports
const defaultModel = 'gpt-4o-2024-08-06';
const defaultTimeout = 180000;

// Basic tool definition - just the essentials
const basicTools = [
  {
    type: "function" as const,
    function: {
      name: "batch_update",
      description: "Add/update multiple nodes and create groups in a single operation",
      parameters: {
        type: "object",
        properties: {
          operations: {
            type: "array",
            description: "Array of operations to perform",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  enum: ["add_node", "update_node", "group_nodes"]
                },
                nodename: { type: "string" },
                parentId: { type: "string" },
                data: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    icon: { type: "string" }
                  }
                },
                nodeIds: {
                  type: "array",
                  items: { type: "string" }
                },
                groupId: { type: "string" },
                groupIconName: { type: "string" }
              }
            }
          }
        },
        required: ["operations"]
      }
    }
  }
];

export default async function handler(req: any, res: any) {
  try {
    console.log('🔄 Simple stream handler called');
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Encoding, x-session-id');
    
  if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Check environment
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY not found');
      res.status(500).json({ error: 'Missing OpenAI API key' });
      return;
    }

    // Get payload
    let payload: string;
    if (req.method === "POST") {
      payload = req.body?.conversation || req.body?.payload;
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

    // Initialize OpenAI client
    console.log('🤖 Initializing OpenAI client...');
    console.log('🔑 API Key present:', !!process.env.OPENAI_API_KEY);
    console.log('🔑 API Key length:', process.env.OPENAI_API_KEY?.length);
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: defaultTimeout,
    });

    // Simple system message
    const systemMessage = `You are an architecture generation assistant. Use the batch_update function to create cloud architecture diagrams. Generate a complete GCP Kubernetes architecture with nodes for containers, services, ingress, pods, etc.`;

    const userInput = parsedPayload.textInput || 'gcp kubernetes';
    
    console.log(`🔍 User input: ${userInput}`);

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    console.log('🌊 Starting OpenAI stream...');

    let stream;
    try {
      stream = await openai.chat.completions.create({
        model: defaultModel,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: `Create a comprehensive ${userInput} architecture diagram` }
        ],
        tools: basicTools,
        stream: true,
        temperature: 0.1,
      });
      console.log('✅ OpenAI stream created successfully');
    } catch (openaiError) {
      console.error('❌ OpenAI API error:', openaiError);
      throw new Error(`OpenAI API failed: ${openaiError instanceof Error ? openaiError.message : String(openaiError)}`);
    }

    let functionCallBuffer = '';
    let currentFunctionCall: any = null;

    for await (const delta of stream) {
      try {
        // Write delta to stream
        res.write(`data: ${JSON.stringify(delta)}\n\n`);

        // Handle function calls
        if (delta.choices?.[0]?.delta?.tool_calls) {
          for (const toolCall of delta.choices[0].delta.tool_calls) {
            if (toolCall.function?.name) {
              currentFunctionCall = {
                id: toolCall.id,
                name: toolCall.function.name,
                arguments: toolCall.function.arguments || ''
              };
              functionCallBuffer = currentFunctionCall.arguments;
            } else if (toolCall.function?.arguments && currentFunctionCall) {
              functionCallBuffer += toolCall.function.arguments;
              currentFunctionCall.arguments = functionCallBuffer;
            }
          }
        }

        // Check for completion
        if (delta.choices?.[0]?.finish_reason === 'tool_calls' && currentFunctionCall) {
          console.log('🎯 Function call completed:', currentFunctionCall.name);
          
          // Send function call result
          const resultDelta = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: defaultModel,
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  id: currentFunctionCall.id,
                  type: 'function',
                  function: {
                    name: currentFunctionCall.name,
                    arguments: currentFunctionCall.arguments
                  }
                }]
              },
              finish_reason: 'tool_calls'
            }]
          };
          
          res.write(`data: ${JSON.stringify(resultDelta)}\n\n`);
        }

      } catch (deltaError) {
        console.error('❌ Error processing delta:', deltaError);
      }
    }

    // Send final completion
    console.log('✅ Stream completed successfully');
    res.write('data: [DONE]\n\n');
    res.end();

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