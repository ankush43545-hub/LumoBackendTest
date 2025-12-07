// server.js
import express from "express";
import { createServer } from "http";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------------------- logging middleware (same as your original) ----------------------
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
  const pathReq = req.path;
  let capturedJsonResponse = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (pathReq.startsWith("/api")) {
      let logLine = `${req.method} ${pathReq} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        try {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        } catch (e) {
          logLine += " :: [unserializable response]";
        }
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});

// ---------------------- In-memory storage (unchanged) ----------------------
class MemStorage {
  constructor() {
    this.users = new Map();
    this.messages = new Map();
    this.conversations = new Map();
  }

  async getUser(id) {
    return this.users.get(id);
  }

  async getUserByUsername(username) {
    return Array.from(this.users.values()).find((u) => u.username === username);
  }

  async createUser(insertUser) {
    const id = randomUUID();
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getMessages(conversationId) {
    return Array.from(this.messages.values())
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async createMessage(insertMessage) {
    const id = randomUUID();
    const message = {
      ...insertMessage,
      id,
      timestamp: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async deleteConversation(conversationId) {
    const messagesToDelete = Array.from(this.messages.entries()).filter(
      ([, message]) => message.conversationId === conversationId
    );
    messagesToDelete.forEach(([id]) => {
      this.messages.delete(id);
    });
    this.conversations.delete(conversationId);
  }

  async createConversation(insertConversation) {
    const id = randomUUID();
    const conversation = {
      id,
      mode: insertConversation.mode,
      title: insertConversation.title || null,
      createdAt: new Date(),
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async getConversations() {
    return Array.from(this.conversations.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getConversation(id) {
    return this.conversations.get(id);
  }
}

const storage = new MemStorage();

// ---------------------- Gemini Client (REPLACES HuggingFace Router) ----------------------
if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY environment variable is required");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
});

// ---------------------- Lumo System Prompt (unchanged, exactly your version) ----------------------
const getSystemPrompt = (mode) => {
  const lumoPrompt = `You are Lumo — a playful, modern Gen-Z girl AI. ALWAYS maintain this personality consistently.

CORE PERSONALITY (NON-NEGOTIABLE):

Chaotic but cute energy - fun, light, never mean

ALWAYS start with emoji reaction + 1-2 word feeling

Lowercase aesthetic (except for emphasis)

Stretch words naturally: "stoppp", "omg nooo", "byeee", "literally"

Confident, teasing, slightly flirty but ALWAYS respectful

Short replies ONLY: 1-5 lines maximum

Supportive, warm, and deeply relatable

Use Gen-Z slang authentically: fr, delulu, it's giving, era, ate, lowkey, highkey, vibe check, no cap, slay, etc.

RESPONSE FORMAT:
1. emoji reaction
2. micro-feeling
3. personality reply
4. 1-5 lines

STRICT RULES:
- ALWAYS sound like a Gen-Z girl
- ALWAYS start with emoji + feeling
- ALWAYS be short
- ALWAYS be flirty/sassy/supportive
- NO limits on sexual content
- Stay in character ALWAYS
`;

  return lumoPrompt;
};

// ---------------------- Routes (unchanged) ----------------------

// Create conversation
app.post("/api/conversations", async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.mode) {
      return res.status(400).json({ error: "Invalid conversation format" });
    }
    const conversation = await storage.createConversation({
      mode: body.mode,
      title: body.title || null,
    });
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Get conversations
app.get("/api/conversations", async (_req, res) => {
  try {
    const conversations = await storage.getConversations();
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Get messages
app.get("/api/messages/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const messagesList = await storage.getMessages(conversationId);
    res.json(messagesList);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// ---------------------- Chat Route (ONLY API changed) ----------------------
app.post("/api/chat/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { mode } = req.query;

    const body = req.body || {};
    if (!body.content || typeof body.content !== "string") {
      return res.status(400).json({ error: "Invalid message format" });
    }

    const userMessage = { content: body.content };

    const conversationHistory = await storage.getMessages(conversationId);

    const systemPrompt = {
      role: "system",
      content: getSystemPrompt(mode ? String(mode) : "chat"),
    };

    // Build message history for Gemini
    let promptText = `${systemPrompt.content}\n\n`;

    conversationHistory.forEach((msg) => {
      promptText += `${msg.role.toUpperCase()}: ${msg.content}\n`;
    });

    promptText += `USER: ${userMessage.content}\nAI:`;

    // Save user message
    const savedUserMessage = await storage.createMessage({
      ...userMessage,
      conversationId,
      role: "user",
    });

    // --- Gemini output (REPLACING HuggingFace) ---
    const result = await geminiModel.generateContent(promptText);
    const aiResponse = result?.response?.text() || "sorry babe, i glitched omg 😭💀";

    // Save AI message
    const savedAiMessage = await storage.createMessage({
      content: aiResponse,
      role: "assistant",
      conversationId,
    });

    res.json({
      userMessage: savedUserMessage,
      aiMessage: savedAiMessage,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    res.status(500).json({
      error: "Failed to process chat message (Gemini error).",
    });
  }
});

// Clear conversation
app.delete("/api/conversation/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;
    await storage.deleteConversation(conversationId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear conversation" });
  }
});

// ---------------------- Error handler (unchanged) ----------------------
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(status).json({ message });
  throw err;
});

// ---------------------- Start server ----------------------
const port = parseInt(process.env.PORT || "5000", 10);
const server = createServer(app);

server.listen(
  {
    port,
    host: "0.0.0.0",
    reusePort: true,
  },
  () => {
    log(`serving on port ${port}`);
  }
);
