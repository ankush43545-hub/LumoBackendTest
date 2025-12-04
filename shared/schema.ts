import { z } from "zod";

export const insertConversationSchema = z.object({
  mode: z.string(),
  title: z.string().nullable().optional(),
});

export const insertMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
  conversationId: z.string().optional(),
});
