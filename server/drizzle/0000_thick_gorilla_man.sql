CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assistant_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"truncate_index" integer DEFAULT 0 NOT NULL,
	"chat_suggestions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"node_index" integer NOT NULL,
	"select_index" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "message_nodes_conversation_id_node_index_unique" UNIQUE("conversation_id","node_index")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"message_index" integer NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"annotations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text NOT NULL,
	"finished_at" text,
	"model_id" uuid,
	"usage" jsonb,
	"translation" text,
	CONSTRAINT "messages_node_id_message_index_unique" UNIQUE("node_id","message_index")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managed_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"storage_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_nodes" ADD CONSTRAINT "message_nodes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_node_id_message_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."message_nodes"("id") ON DELETE cascade ON UPDATE no action;