import express from "express";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import "dotenv/config";
import cors from 'cors';
import OpenAI from 'openai';
import multer from 'multer';
// Import tools from catalog
import { allTools } from "../client/realtime/toolCatalog.ts";

const app = express();
const port = process.env.PORT | 3000;
const apiKey = process.env.OPENAI_API_KEY;
const __dirname = dirname(fileURLToPath(import.meta.url));

if (!apiKey) {
  console.error("OPENAI_API_KEY is not set in .env file");
  process.exit(1);
}

// Initialize OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for handling image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());                     // for application/json
app.use(express.urlencoded({ extended: false })); // for x-www-form-urlencoded

// Stream route for development
import streamHandler from './streamRoute.ts';
app.post("/stream", upload.array('images', 5), streamHandler);

// API route for chat completions - MUST be before Vite middleware
app.post("/chat", async (req, res) => {
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
});

// API route for questionnaire agent - uses GPT-4o and forces log_requirements_and_generate_questions
app.post("/questionnaire", async (req, res) => {
  try {
    console.log("Received questionnaire request:", req.body);
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      console.error("Invalid messages format:", messages);
      return res.status(400).json({ error: "Messages must be an array" });
    }

    console.log("Calling OpenAI with questionnaire agent messages:", messages);

    // Use Chat Completions API with tools from catalog, forcing log_requirements_and_generate_questions
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
});

// Configure Vite middleware for React client
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
  configFile: resolve(__dirname, "../vite.config.js"),
  root: resolve(__dirname, "../client"),
});
app.use(vite.middlewares);

// API route for token generation
app.get("/token", async (req, res) => {
  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-realtime-preview",
          voice: "verse",
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API error:", errorData);
      return res.status(response.status).json({ 
        error: errorData.error?.message || "Failed to generate token" 
      });
    }

    const data = await response.json();
    if (!data || !data.client_secret || !data.client_secret.value) {
      console.error("Invalid response from OpenAI:", data);
      return res.status(500).json({ error: "Invalid response from OpenAI" });
    }

    res.json(data);
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// Render the React client
app.use("*", async (req, res, next) => {
  const url = req.originalUrl;

  try {
    const template = await vite.transformIndexHtml(
      url,
      fs.readFileSync("./client/index.html", "utf-8"),
    );
    const { render } = await vite.ssrLoadModule("./client/entry-server.jsx");
    const appHtml = await render(url);
    const html = template.replace(`<!--ssr-outlet-->`, appHtml?.html);
    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  } catch (e) {
    vite.ssrFixStacktrace(e);
    next(e);
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
