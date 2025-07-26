import OpenAI from "openai";

// Import tools from catalog
import { allTools } from "../client/realtime/toolCatalog";

const client = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 60000, // 60 seconds
});

export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log("Received questionnaire request:", req.body);
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      console.error("Invalid messages format:", messages);
      return res.status(400).json({ error: "Messages must be an array" });
    }

    console.log("Calling OpenAI with questionnaire agent messages:", messages);

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      tools: allTools.map(tool => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      })),
      tool_choice: {
        type: "function",
        function: { name: "log_requirements_and_generate_questions" }
      },
      temperature: 0.2,
      max_tokens: 4096
    });

    console.log("OpenAI questionnaire response received:", response);

    // Convert Chat Completions response to match expected format
    const output = [];
    
    if (response.choices?.[0]?.message?.tool_calls) {
      // Handle new tools format
      const toolCall = response.choices[0].message.tool_calls[0];
      output.push({
        type: "function_call",
        function_call: {
          name: toolCall.function.name,
          arguments: toolCall.function.arguments
        },
        call_id: toolCall.id
      });
    } else if (response.choices?.[0]?.message?.content) {
      output.push({
        type: "message",
        content: response.choices[0].message.content
      });
    }

    // Return the response
    return res.json({
      output: output,
      output_text: response.choices?.[0]?.message?.content || ""
    });

  } catch (error) {
    console.error('OpenAI questionnaire API error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Error calling OpenAI questionnaire API',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 