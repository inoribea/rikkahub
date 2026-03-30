import { pgTable, uuid, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  assistantId: uuid("assistant_id").notNull(),
  title: text("title").notNull().default(""),
  isPinned: boolean("is_pinned").notNull().default(false),
  truncateIndex: integer("truncate_index").notNull().default(0),
  chatSuggestions: text("chat_suggestions").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
