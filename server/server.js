// Bypass SSL certificate validation for development
// This MUST be at the very top before any other imports
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import express from "express";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import "dotenv/config";
import cors from 'cors';
import multer from 'multer';
// Import tools from catalog
import { allTools } from "./toolCatalog.js";
import ConnectionManager from './connectionManager.js';

const app = express();
const apiKey = process.env.OPENAI_API_KEY;
const __dirname = dirname(fileURLToPath(import.meta.url));
const connectionManager = ConnectionManager.getInstance();

if (!apiKey) {
  console.error("OPENAI_API_KEY is not set in .env file");
  process.exit(1);
}

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
import streamHandler from './streamRoute.js';
app.post("/stream", upload.array('images', 5), streamHandler);

// Connection manager stats endpoint
app.get("/api/connection-stats", (req, res) => {
  const stats = connectionManager.getStats();
  res.json({
    ...stats,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

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

    // Use connection manager for chat completions
    const response = await connectionManager.queueRequest(async () => {
      const client = connectionManager.getAvailableClient();
      return client.chat.completions.create({
        model: "o3-mini",
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
    }, 'low');

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

    // Use connection manager for questionnaire completions
    const response = await connectionManager.queueRequest(async () => {
      const client = connectionManager.getAvailableClient();
      return client.chat.completions.create({
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
    }, 'normal');

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
    console.log("🔍 Token endpoint called");
    console.log("🔍 API Key available:", !!apiKey);
    console.log("🔍 API Key prefix:", apiKey ? apiKey.substring(0, 7) + "..." : "none");
    
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "verse",
        }),
      },
    );

    console.log("🔍 OpenAI API response status:", response.status);
    console.log("🔍 OpenAI API response headers:", response.headers);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ OpenAI API error:", response.status, errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (parseError) {
        errorData = { error: { message: errorText } };
      }
      
      return res.status(response.status).json({ 
        error: errorData.error?.message || errorData.error || "Failed to generate token",
        details: errorData,
        status: response.status
      });
    }

    const data = await response.json();
    console.log("✅ OpenAI API response data structure:", {
      hasData: !!data,
      hasClientSecret: !!data?.client_secret,
      hasClientSecretValue: !!data?.client_secret?.value,
      keys: Object.keys(data || {})
    });
    
    if (!data || !data.client_secret || !data.client_secret.value) {
      console.error("❌ Invalid response from OpenAI:", data);
      return res.status(500).json({ 
        error: "Invalid response from OpenAI - missing client_secret",
        receivedData: data
      });
    }

    console.log("✅ Token generated successfully");
    res.json(data);
  } catch (error) {
    console.error("❌ Token generation error:", error);
    console.error("❌ Error stack:", error.stack);
    res.status(500).json({ 
      error: "Failed to generate token",
      details: error.message,
      type: error.constructor.name
    });
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

// Function to find the next available port
async function findAvailablePort(startPort = 3000) {
  return new Promise((resolve, reject) => {
    const server = app.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => {
        resolve(port);
      });
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port is in use, try the next one
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

// Start the server on the next available port
const startPort = process.env.PORT ? parseInt(process.env.PORT) : 3000;
findAvailablePort(startPort).then(port => {
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    if (port !== startPort) {
      console.log(`   (Port ${startPort} was in use, using ${port} instead)`);
    }
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
