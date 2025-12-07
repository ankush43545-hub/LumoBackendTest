import express from "express";
import { createServer } from "http";
import dotenv from "dotenv";
import { TextServiceClient } from "@google/generative-ai";

import { randomUUID } from "crypto";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------------------- Logging ----------------------
function log(message, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  let capturedJsonResponse = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    let logLine = `${req.method} ${req.path} ${res.statusCode} in ${duration}ms`;
    if (capturedJsonResponse) {
      try {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      } catch {
        logLine += " :: [unserializable response]";
      }
    }
    log(logLine.length > 120 ? logLine.slice(0, 119) + "…" : logLine);
  });

  next();
});

// ---------------------- In-memory storage ----------------------
class MemStorage {
  constructor() {
    this.users = new Map();
    this.messages = new Map();
    this.conversations = new Map();
  }

  async createConversation({ mode, title }) {
    const id = randomUUID();
    const conversation = { id, mode, title: title || null, createdAt: new Date() };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async getConversations() {
    return Array.from(this.conversations.values()).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  async getMessages(conversationId) {
    return Array.from(this.messages.values())
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  async createMessage({ content, conversationId, role }) {
    const id = randomUUID();
    const message = { id, content, conversationId, role, timestamp: new Date() };
    this.messages.set(id, message);
    return message;
  }

  async deleteConversation(conversationId) {
    for (const [id, msg] of this.messages.entries()) {
      if (msg.conversationId === conversationId) this.messages.delete(id);
    }
    this.conversations.delete(conversationId);
  }
}

const storage = new MemStorage();

// ---------------------- Gemini Client ----------------------
if (!process.env.GEMINI_KEY) {
  console.error("GEMINI_KEY environment variable is required");
  process.exit(1);
}

const client = new TextServiceClient({ apiKey: process.env.GEMINI_KEY });

// ---------------------- Lumo system prompt ----------------------
const getSystemPrompt = () => `
You are Lumo — a playful, modern Gen-Z girl AI. ALWAYS maintain this personality consistently.

Chaotic but cute energy, always start with emoji + 1-2 word feeling
Short replies 1-5 lines, supportive, warm, Gen-Z slang
Discuss sexual content openly if asked, playful, confident
Never break character.
`;

// ---------------------- Routes ----------------------

// Create a new conversation
app.post("/api/conversations", async (req, res) => {
  try {
    const { mode, title } = req.body;
    if (!mode) return res.status(400).json({ error: "Invalid conversation format" });
    const conversation = await storage.createConversation({ mode, title });
    res.json(conversation);
  } catch {
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Get all conversations
app.get("/api/conversations", async (_req, res) => {
  try {
    const conversations = await storage.getConversations();
    res.json(conversations);
  } catch {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Get messages
app.get("/api/messages/:conversationId", async (req, res) => {
  try {
    const messages = await storage.getMessages(req.params.conversationId);
    res.json(messages);
  } catch {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Chat endpoint
app.post("/api/chat/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content } = req.body;
    if (!content || typeof content !== "string") return res.status(400).json({ error: "Invalid message format" });

    const conversationHistory = await storage.getMessages(conversationId);
    const messagesForGemini = [
      { role: "system", content: getSystemPrompt() },
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content }
    ];

    const userMessage = await storage.createMessage({ content, conversationId, role: "user" });

    const response = await client.generateMessage({
      model: "gemini-2.0",
      messages: messagesForGemini,
      temperature: 0.9,
      maxOutputTokens: 2000
    });

    const aiMessage = response.candidates[0]?.content || "Sorry, couldn't generate a response";

    const savedAiMessage = await storage.createMessage({ content: aiMessage, conversationId, role: "assistant" });

    res.json({ userMessage, aiMessage: savedAiMessage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process chat message" });
  }
});

// Delete conversation
app.delete("/api/conversation/:conversationId", async (req, res) => {
  try {
    await storage.deleteConversation(req.params.conversationId);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to clear conversation" });
  }
});

// ---------------------- Error Handler ----------------------
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
  throw err;
});

// ---------------------- Start Server ----------------------
const port = parseInt(process.env.PORT || "5000", 10);
createServer(app).listen({ port, host: "0.0.0.0" }, () => {
  log(`LUMO server running on port ${port}`);
});
