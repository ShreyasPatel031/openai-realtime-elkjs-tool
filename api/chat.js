import OpenAI from 'openai';

export default async function handler(req, res) {
  console.log('🚀 Chat API called:', req.method, req.url);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('📡 Handling CORS preflight');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    console.log('🔑 Checking API key...');
    // Check for API key
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key-here') {
      console.log('❌ API key not configured');
      res.status(500).json({ 
        error: 'OpenAI API key not configured',
        message: 'Please set your OpenAI API key in the .env file'
      });
      return;
    }

    console.log('✅ API key found');
    const { messages } = req.body;
    console.log('📨 Received messages:', messages);

    if (!messages || !Array.isArray(messages)) {
      console.log('❌ Invalid messages format');
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    console.log('🤖 Initializing OpenAI client');
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    console.log('📡 Setting up streaming response');
    // Set up streaming response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    console.log('🔄 Creating chat completion...');
    // Create chat completion with streaming and tools
    const stream = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 1000,
      tools: [
        {
          type: "function",
          function: {
            name: "create_architecture_diagram",
            description: "Create an architecture diagram based on the user's requirements and conversation summary",
            parameters: {
              type: "object",
              properties: {
                requirements_summary: {
                  type: "string",
                  description: "A clear summary of the user's architecture requirements based on the conversation"
                },
                architecture_type: {
                  type: "string",
                  description: "The type of architecture being requested (e.g., microservices, serverless, monolith, etc.)"
                }
              },
              required: ["requirements_summary", "architecture_type"]
            }
          }
        }
      ],
      tool_choice: "auto"
    });

    console.log('📦 Starting to stream response...');
    let toolCallDetected = false;
    let toolCallData = null;
    let accumulatedArguments = '';
    
    // Stream the response
    for await (const chunk of stream) {
      const data = JSON.stringify(chunk);
      console.log('📤 Streaming chunk:', data);
      
      // Check if this chunk contains a tool call
      if (chunk.choices?.[0]?.delta?.tool_calls) {
        toolCallDetected = true;
        console.log('🔧 Tool call detected in chunk');
        console.log('🔍 Tool call chunk:', JSON.stringify(chunk.choices[0].delta.tool_calls, null, 2));
        
        // If we have tool call data, handle it
        if (chunk.choices[0].delta.tool_calls[0]?.function?.name === 'create_architecture_diagram') {
          toolCallData = chunk.choices[0].delta.tool_calls[0];
          console.log('🏗️ Architecture diagram tool call detected');
          console.log('🔍 Tool call data:', JSON.stringify(toolCallData, null, 2));
        }
        
        // Accumulate arguments if they exist
        if (chunk.choices[0].delta.tool_calls[0]?.function?.arguments) {
          accumulatedArguments += chunk.choices[0].delta.tool_calls[0].function.arguments;
          console.log('📝 Accumulated arguments so far:', accumulatedArguments);
        }
      }
      
      res.write(`data: ${data}\n\n`);
    }

    // If a tool call was detected, handle it
    if (toolCallDetected && toolCallData && accumulatedArguments) {
      console.log('🛠️ Processing tool call...');
      console.log('🔍 Tool call data:', JSON.stringify(toolCallData, null, 2));
      console.log('📝 Final accumulated arguments:', accumulatedArguments);
      
      try {
        // Parse the accumulated tool call arguments
        console.log('📝 Raw arguments string:', accumulatedArguments);
        const args = JSON.parse(accumulatedArguments);
        console.log('📋 Parsed tool call arguments:', args);
        
        // Validate required fields
        if (!args.requirements_summary || !args.architecture_type) {
          throw new Error(`Missing required fields. Got: ${JSON.stringify(args)}`);
        }
        
        // Send a special message indicating diagram creation
        const diagramMessage = {
          type: "diagram_creation",
          message: `Creating architecture diagram for: ${args.architecture_type}`,
          requirements: args.requirements_summary
        };
        
        console.log('📤 Sending diagram creation message:', diagramMessage);
        res.write(`data: ${JSON.stringify(diagramMessage)}\n\n`);
        
        // Trigger the diagram creation on the frontend
        const triggerMessage = {
          type: "trigger_diagram",
          requirements: args.requirements_summary,
          architecture_type: args.architecture_type
        };
        
        console.log('🚀 Sending trigger message:', triggerMessage);
        res.write(`data: ${JSON.stringify(triggerMessage)}\n\n`);
        
        console.log('✅ Diagram creation triggered successfully');
        
      } catch (error) {
        console.error('❌ Error processing tool call:', error);
        console.error('❌ Error details:', error.message);
        console.error('❌ Tool call data:', JSON.stringify(toolCallData, null, 2));
        console.error('❌ Accumulated arguments:', accumulatedArguments);
        
        res.write(`data: ${JSON.stringify({
          type: "error",
          message: `Failed to process diagram creation request: ${error.message}`
        })}\n\n`);
      }
    } else {
      console.log('ℹ️ No tool call detected or tool call data missing');
      console.log('🔍 toolCallDetected:', toolCallDetected);
      console.log('🔍 toolCallData:', toolCallData);
      console.log('🔍 accumulatedArguments:', accumulatedArguments);
    }

    console.log('✅ Stream completed, sending [DONE]');
    // Send completion signal
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Chat API error:', error);
    
    if (error.code === 'insufficient_quota') {
      res.status(402).json({ 
        error: 'Insufficient quota',
        message: 'OpenAI API quota exceeded. Please check your billing.'
      });
    } else if (error.code === 'invalid_api_key') {
      res.status(401).json({ 
        error: 'Invalid API key',
        message: 'Please check your OpenAI API key in the .env file'
      });
    } else {
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message || 'An unexpected error occurred'
      });
    }
  }
}
