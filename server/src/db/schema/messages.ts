import { pgTable, uuid, text, integer, jsonb, unique } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";

export const messageNodes = pgTable("message_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  nodeIndex: integer("node_index").notNull(),
  selectIndex: integer("select_index").notNull().default(0),
}, (t) => ({
  unq: unique().on(t.conversationId, t.nodeIndex),
}));

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  nodeId: uuid("node_id").notNull().references(() => messageNodes.id, { onDelete: "cascade" }),
  messageIndex: integer("message_index").notNull(),
  role: text("role").notNull().$type<"system" | "user" | "assistant" | "tool">(),
  parts: jsonb("parts").notNull().default([]),
  annotations: jsonb("annotations").notNull().default([]),
  createdAt: text("created_at").notNull(),
  finishedAt: text("finished_at"),
  modelId: uuid("model_id"),
  usage: jsonb("usage"),
  translation: text("translation"),
}, (t) => ({
  unq: unique().on(t.nodeId, t.messageIndex),
}));
