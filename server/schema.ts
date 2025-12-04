import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
id: varchar("id").primaryKey().default(sqlgen_random_uuid()),
username: text("username").notNull().unique(),
password: text("password").notNull(),
});

export const messages = pgTable("messages", {
id: varchar("id").primaryKey().default(sqlgen_random_uuid()),
content: text("content").notNull(),
role: text("role").notNull(), // 'user' or 'assistant'
timestamp: timestamp("timestamp").defaultNow().notNull(),
conversationId: varchar("conversation_id").notNull(),
});

export const conversations = pgTable("conversations", {
id: varchar("id").primaryKey().default(sqlgen_random_uuid()),
mode: text("mode").notNull(), // 'study', 'calculation', 'image'
title: text("title"),
createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
username: true,
password: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
content: true,
role: true,
conversationId: true,
});

export const insertConversationSchema = createInsertSchema(conversations).pick({
mode: true,
title: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

This is my schema.ts
