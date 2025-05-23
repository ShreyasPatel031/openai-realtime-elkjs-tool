import { Router } from "express";
import OpenAI from "openai";
import { allTools } from "./client/realtime/toolCatalog.ts";

const router = Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.get("/stream", async (req, res) => {
  // required SSE headers
  res.set({
    "Content-Type":  "text/event-stream",
    "Cache-Control": "no-cache",
    Connection:      "keep-alive"
  });

  try {
    const stream = await client.responses.create({
      model: "o4-mini-2025-04-16",
      input: JSON.parse(req.query.payload as string),
      tools: allTools.map(tool => ({
        type: "function" as const,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: false
      })),
      tool_choice: "auto",
      reasoning: { effort: "high", summary: "detailed" },
      stream: true
    });

    for await (const delta of stream) {
      res.write(`data: ${JSON.stringify(delta)}\n\n`);
    }
    res.end();
  } catch (error) {
    console.error('Streaming error:', error);
    res.write(`data: ${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Unknown error" })}\n\n`);
    res.end();
  }
});

export default router; 