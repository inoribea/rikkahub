import { pgTable, serial, text, bigint, timestamp } from "drizzle-orm/pg-core";

export const managedFiles = pgTable("managed_files", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
  storagePath: text("storage_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
