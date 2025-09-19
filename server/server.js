/**
 * ======================================================================
 * LOCAL DEVELOPMENT SERVER
 * ======================================================================
 * 
 * IMPORTANT: API ENDPOINT GUIDELINES
 * 
 * ⚠️  DO NOT ADD NEW API LOGIC DIRECTLY TO THIS FILE ⚠️
 * 
 * When adding new API endpoints:
 * 
 * 1. CREATE NEW FILES IN /api/ DIRECTORY
 *    - Example: /api/myNewEndpoint.ts
 *    - This ensures Vercel production uses the same logic
 * 
 * 2. IMPORT AND USE THE API HANDLER HERE
 *    - Example: 
 *      const myHandler = (await import('../api/myNewEndpoint.ts')).default;
 *      app.post("/api/myNewEndpoint", myHandler);
 * 
 * 3. NEVER DUPLICATE LOGIC BETWEEN server.js AND /api/
 *    - This causes inconsistencies between local and production
 *    - Always use the /api/ files as the single source of truth
 * 
 * EXCEPTIONS (local-only endpoints):
 * - /token (OpenAI realtime sessions for local dev)
 * - /api/questionnaire (uses local connection manager)
 * 
 * This approach ensures:
 * ✅ Local and Vercel production behave identically
 * ✅ Single source of truth for API logic
 * ✅ Easy testing and maintenance
 * ✅ No environment-specific bugs
 * 
 * ======================================================================
 */

import express from "express";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import "dotenv/config";
import cors from 'cors';
import multer from 'multer';
// Import tools from catalog
import { allTools } from "../api/toolCatalog.js";
import ConnectionManager from './connectionManager.js';
import { modelConfigs } from '../api/agentConfig.ts';

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

// ============================================================================
// API ROUTES - Import handlers from /api/ directory (shared with Vercel)
// ============================================================================
// REMINDER: Always create new API endpoints in /api/ directory, not here!
// This ensures local development and Vercel production use identical logic.

import streamHandler from '../api/stream.ts';
import embedHandler from '../api/embed.ts';
import simpleAgentHandler from '../api/simple-agent.ts';
import chatHandler from '../api/chat.js';
app.post("/api/stream", upload.array('images', 5), streamHandler);
app.post("/api/embed", embedHandler);
app.post("/api/simple-agent", simpleAgentHandler);
app.post("/api/chat", chatHandler);

// Chat naming - uses same sophisticated AI logic as production
const generateChatNameHandler = (await import('../api/generateChatName.ts')).default;
app.post("/api/generateChatName", generateChatNameHandler);

// ============================================================================
// LOCAL-ONLY ENDPOINTS (exceptions to the /api/ rule)
// ============================================================================
// These endpoints are only needed for local development and use local resources
// like ConnectionManager that don't exist in the Vercel serverless environment.

app.post("/api/questionnaire", async (req, res) => {
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

// Connection manager stats endpoint removed - not needed for real-time agent



// Duplicate questionnaire endpoint removed - using /api/questionnaire instead

// Configure Vite middleware for React client
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
  configFile: resolve(__dirname, "../vite.config.js"),
  root: resolve(__dirname, "../client"),
});
// Short-circuit noisy crawlers or platform probes hitting "/.well-known/..."
app.use('/.well-known', (req, res) => {
  res.status(404).send('Not found');
});

// Serve precomputed embeddings JSON file with correct Content-Type
app.get('/precomputed-icon-embeddings.json', (req, res) => {
  const filePath = resolve(__dirname, '../public/precomputed-icon-embeddings.json');
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(filePath);
});

app.use(vite.middlewares);

// OpenAI Realtime Session Token - Local development only
// (Vercel production doesn't need this as it uses different auth patterns)
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
