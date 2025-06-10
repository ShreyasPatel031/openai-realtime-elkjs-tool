import OpenAI from 'openai';
import { allTools } from '../client/realtime/toolCatalog.js';
const app = require('../server/server.js');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Handle the request using the existing server logic
  app(req, res);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log("Received chat request:", req.body);
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      console.error("Invalid messages format:", messages);
      return res.status(400).json({ error: "Messages must be an array" });
    }

    console.log("Calling OpenAI with messages:", messages);

    // Use Chat Completions API with tools from catalog
    const response = await client.chat.completions.create({
      model: "o4-mini-2025-04-16",
      messages: messages,
      tools: allTools.map(tool => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      })),
      tool_choice: "auto"
    });

    console.log("OpenAI response received:", response);

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
    console.error('OpenAI API error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Error calling OpenAI API',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 