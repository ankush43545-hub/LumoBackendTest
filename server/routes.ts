import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js"; // <- compiled JS import
import { insertMessageSchema, insertConversationSchema } from "./schema.js"; // <- compiled JS import
import OpenAI from "openai";

export async function registerRoutes(app: Express): Promise<Server> {
  if (!process.env.HF_TOKEN) {
    throw new Error("HF_TOKEN environment variable is required");
  }

  const openai = new OpenAI({
    baseURL: "https://router.huggingface.co/v1",
    apiKey: process.env.HF_TOKEN,
  });

  const getSystemPrompt = (mode: string): string => {
    return `You are **Lumo** — a playful, modern Gen-Z girl AI. ALWAYS maintain this personality consistently.
    ... (insert your full Lumo personality prompt here) ...`;
  };

  // ----------------- Routes -----------------

  // Create conversation
  app.post("/api/conversations", async (req, res) => {
    try {
      const validation = insertConversationSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: "Invalid conversation format" });

      const conversation = await storage.createConversation(validation.data);
      res.json(conversation);
    } catch (err) {
      console.error("Create conversation error:", err);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Get all conversations
  app.get("/api/conversations", async (_req, res) => {
    try {
      const conversations = await storage.getConversations();
      res.json(conversations);
    } catch (err) {
      console.error("Get conversations error:", err);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get messages
  app.get("/api/messages/:conversationId", async (req, res) => {
    try {
      const { conversationId } = req.params;
      const messages = await storage.getMessages(conversationId);
      res.json(messages);
    } catch (err) {
      console.error("Get messages error:", err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Chat with AI
  app.post("/api/chat/:conversationId", async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { mode } = req.query;

      const validation = insertMessageSchema.omit({ conversationId: true }).safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: "Invalid message format" });

      const userMessage = validation.data;
      const history = await storage.getMessages(conversationId);

      const systemPrompt = { role: "system" as const, content: getSystemPrompt(String(mode) || "chat") };
      const apiMessages = [
        systemPrompt,
        ...history.map(msg => ({ role: msg.role as any, content: msg.content })),
        { role: "user" as const, content: userMessage.content },
      ];

      const savedUserMessage = await storage.createMessage({ ...userMessage, conversationId, role: "user" });

      const completion = await openai.chat.completions.create({
        model: "meta-llama/Llama-3.1-8B-Instruct:cerebras",
        messages: apiMessages,
        max_tokens: 2000,
        temperature: 0.9,
      });

      const aiResponse = completion.choices?.[0]?.message?.content ?? "Couldn't generate a response";

      const savedAiMessage = await storage.createMessage({
        content: aiResponse,
        role: "assistant",
        conversationId,
      });

      res.json({ userMessage: savedUserMessage, aiMessage: savedAiMessage });
    } catch (err) {
      console.error("Chat API error:", err);
      res.status(500).json({ error: "Failed to process chat message. Check your Hugging Face token." });
    }
  });

  // Delete conversation
  app.delete("/api/conversation/:conversationId", async (req, res) => {
    try {
      const { conversationId } = req.params;
      await storage.deleteConversation(conversationId);
      res.json({ success: true });
    } catch (err) {
      console.error("Delete conversation error:", err);
      res.status(500).json({ error: "Failed to clear conversation" });
    }
  });

  return createServer(app);
          }
