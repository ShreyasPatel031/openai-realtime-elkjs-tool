import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tools = [
  {
    type: "function",
    name: "add_node",
    description: "Adds a node",
    parameters: {
      type: "object",
      properties: {
        nodename: { type: "string" },
        parentId: { type: "string" }
      },
      required: ["nodename", "parentId"]
    }
  }
];

const initialMessages = [
  { role: "system", content: "You may call add_node." },
  { role: "user",   content: "Please add node X under root." }
];

console.log("🚀 Starting streaming test with reasoning model...\n");

const stream = await client.chat.completions.create({
  model: "o3-mini",
  messages: initialMessages,
  tools,
  tool_choice: "auto",
  stream: true               // ⭐️ this turns on incremental deltas
});

for await (const delta of stream) {
  console.log("Δ:", JSON.stringify(delta, null, 2));
} 