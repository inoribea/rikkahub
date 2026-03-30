import { Hono } from "hono";
import { db } from "../db";
import { conversations, messageNodes, messages, settings as settingsTable } from "../db/schema";
import { eq, desc, and, asc, sql, ilike } from "drizzle-orm";
import { sseStream } from "../lib/sse";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { generateId, now, nowEpochMs } from "../lib/utils";
import { eventBus, ConversationEvents } from "../lib/events";
import type { ConversationListInvalidateEvent, ConversationNodeUpdateEvent } from "../lib/events";
import { GenerationHandler } from "../services/generation";
import { generateChatCompletions } from "../services/provider";
import type { Settings } from "../types";
import type { UIMessage, UIMessagePart } from "../types";
import type {
  ConversationDto,
  ConversationListDto,
  MessageNodeDto,
  MessageDto,
  PagedResult,
  ConversationSnapshotEventDto,
  ConversationNodeUpdateEventDto,
  ConversationListInvalidateEventDto,
  MessageSearchResultDto,
} from "../types";

const generationHandler = new GenerationHandler();

const app = new Hono();

app.get("/", async (c) => {
  const assistantId = c.req.query("assistantId") ?? "";
  const rows = await db.select().from(conversations)
    .where(eq(conversations.assistantId, assistantId))
    .orderBy(desc(conversations.updatedAt));
  return c.json(rows.map(toListDto));
});

app.get("/paged", async (c) => {
  const assistantId = c.req.query("assistantId") ?? "";
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const query = c.req.query("query")?.trim() ?? "";

  if (offset < 0) throw new BadRequestError("offset must be >= 0");
  if (limit < 1 || limit > 100) throw new BadRequestError("limit must be in 1..100");

  const where = query
    ? and(eq(conversations.assistantId, assistantId), ilike(conversations.title, `%${query}%`))
    : eq(conversations.assistantId, assistantId);

  const rows = await db.select().from(conversations)
    .where(where)
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
    .offset(offset);

  const nextOffset = rows.length === limit ? offset + limit : null;
  return c.json<PagedResult<ConversationListDto>>({
    items: rows.map(toListDto),
    hasMore: nextOffset !== null,
    nextOffset,
  });
});

app.get("/search", async (c) => {
  const query = c.req.query("query")?.trim() ?? "";
  if (!query) return c.json<MessageSearchResultDto[]>([]);

  const results = await db.execute(sql`
    SELECT m.id as message_id, mn.id as node_id, mn.conversation_id, c.title, c.updated_at, m.parts
    FROM messages m
    JOIN message_nodes mn ON m.node_id = mn.id
    JOIN conversations c ON mn.conversation_id = c.id
    WHERE m.parts::text ILIKE ${`%${query}%`}
    ORDER BY c.updated_at DESC
    LIMIT 50
  `);

  return c.json<MessageSearchResultDto[]>((results as any).rows.map((r: any) => ({
    nodeId: r.node_id,
    messageId: r.message_id,
    conversationId: r.conversation_id,
    title: r.title,
    updateAt: new Date(r.updated_at).getTime(),
    snippet: extractSnippet(r.parts, query),
  })));
});

app.get("/stream", (c) => {
  return sseStream(c, async (send) => {
    const unsubscribe = eventBus.on<ConversationListInvalidateEvent>(
      ConversationEvents.LIST_INVALIDATE,
      (data) => {
        send({
          event: "invalidate",
          data: {
            type: "invalidate" as const,
            assistantId: data.assistantId,
            timestamp: nowEpochMs(),
          } satisfies ConversationListInvalidateEventDto,
        });
      },
    );

    try {
      await new Promise<void>((_, reject) => {
        const timer = setInterval(() => {
          send({
            event: "ping",
            data: { type: "ping", timestamp: nowEpochMs() },
          });
        }, 30000);

        const cleanup = () => {
          clearInterval(timer);
          unsubscribe();
        };

        process.on("SIGTERM", () => { cleanup(); reject(new Error("shutdown")); });
      });
    } finally {
      unsubscribe();
    }
  });
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const dto = await buildConversationDto(id);
  return c.json(dto);
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError("Conversation not found");
  await db.delete(conversations).where(eq(conversations.id, id));
  eventBus.emit(ConversationEvents.LIST_INVALIDATE, { assistantId: existing[0].assistantId });
  return c.json({ status: "deleted" });
});

app.post("/:id/pin", async (c) => {
  const id = c.req.param("id");
  const existing = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError("Conversation not found");
  await db.update(conversations).set({ isPinned: !existing[0].isPinned, updatedAt: new Date() }).where(eq(conversations.id, id));
  eventBus.emit(ConversationEvents.LIST_INVALIDATE, { assistantId: existing[0].assistantId });
  eventBus.emit(ConversationEvents.SNAPSHOT, { conversationId: id });
  return c.json({ status: "updated" });
});

app.post("/:id/title", async (c) => {
  const id = c.req.param("id");
  const { title } = await c.req.json<{ title: string }>().catch(() => ({ title: "" }));
  if (!title.trim()) throw new BadRequestError("Title must not be blank");
  const existing = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  await db.update(conversations).set({ title: title.trim(), updatedAt: new Date() }).where(eq(conversations.id, id));
  if (existing.length) {
    eventBus.emit(ConversationEvents.LIST_INVALIDATE, { assistantId: existing[0].assistantId });
  }
  eventBus.emit(ConversationEvents.SNAPSHOT, { conversationId: id });
  return c.json({ status: "updated" });
});

app.post("/:id/move", async (c) => {
  const id = c.req.param("id");
  const { assistantId: newAssistantId } = await c.req.json<{ assistantId: string }>().catch(() => ({ assistantId: "" }));
  if (!newAssistantId) throw new BadRequestError("Missing assistantId");
  const existing = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  const oldAssistantId = existing[0]?.assistantId ?? "";
  await db.update(conversations).set({ assistantId: newAssistantId, updatedAt: new Date() }).where(eq(conversations.id, id));
  eventBus.emit(ConversationEvents.LIST_INVALIDATE, { assistantId: oldAssistantId });
  eventBus.emit(ConversationEvents.LIST_INVALIDATE, { assistantId: newAssistantId });
  eventBus.emit(ConversationEvents.SNAPSHOT, { conversationId: id });
  return c.json({ status: "updated" });
});

app.post("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const { parts } = await c.req.json<{ parts: UIMessagePart[] }>().catch(() => ({ parts: [] }));
  if (!parts.length) throw new BadRequestError("No message parts");

  const userMsg: UIMessage = {
    id: generateId(),
    role: "user",
    parts,
    annotations: [],
    createdAt: now(),
  };

  const nodeCount = await db.select({ count: sql<number>`count(*)` }).from(messageNodes)
    .where(eq(messageNodes.conversationId, id));
  const nextIndex = Number(nodeCount[0]?.count ?? 0);

  const nodeId = generateId();
  await db.insert(messageNodes).values({
    id: nodeId, conversationId: id, nodeIndex: nextIndex, selectIndex: 0,
  });
  await db.insert(messages).values({
    id: userMsg.id, nodeId, messageIndex: 0,
    role: userMsg.role, parts: userMsg.parts as unknown as Record<string, unknown>[],
    annotations: userMsg.annotations as unknown as Record<string, unknown>[],
    createdAt: userMsg.createdAt,
  });

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, id));
  emitNodeUpdate(id, nodeId, nextIndex);
  return c.json({ status: "accepted" }, 202);
});

app.post("/:id/messages/:messageId/edit", async (c) => {
  const id = c.req.param("id");
  const messageId = c.req.param("messageId");
  const { parts } = await c.req.json<{ parts: UIMessagePart[] }>().catch(() => ({ parts: [] }));

  const msgRows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msgRows.length) throw new NotFoundError("Message not found");

  const newMsg: UIMessage = {
    id: generateId(),
    role: msgRows[0].role as UIMessage["role"],
    parts,
    annotations: [],
    createdAt: now(),
  };

  await db.insert(messages).values({
    id: newMsg.id, nodeId: msgRows[0].nodeId,
    messageIndex: msgRows[0].messageIndex + 1,
    role: newMsg.role,
    parts: newMsg.parts as unknown as Record<string, unknown>[],
    annotations: newMsg.annotations as unknown as Record<string, unknown>[],
    createdAt: newMsg.createdAt,
  });

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, id));

  const nodeRow = await db.select().from(messageNodes).where(eq(messageNodes.id, msgRows[0].nodeId)).limit(1);
  if (nodeRow.length) {
    emitNodeUpdate(id, msgRows[0].nodeId, nodeRow[0].nodeIndex);
  }
  return c.json({ status: "accepted" }, 202);
});

app.post("/:id/fork", async (c) => {
  const id = c.req.param("id");
  const { messageId } = await c.req.json<{ messageId: string }>().catch(() => ({ messageId: "" }));
  if (!messageId) throw new BadRequestError("Missing messageId");

  const msgRows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msgRows.length) throw new NotFoundError("Message not found");

  const sourceNodeId = msgRows[0].nodeId;
  const nodeRows = await db.select().from(messageNodes)
    .where(eq(messageNodes.conversationId, id))
    .orderBy(asc(messageNodes.nodeIndex));

  const sourceIndex = nodeRows.findIndex(n => n.id === sourceNodeId);
  if (sourceIndex < 0) throw new NotFoundError("Node not found");

  const sourceConv = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  const newAssistantId = sourceConv[0]?.assistantId ?? "";

  const newConvId = generateId();
  await db.insert(conversations).values({
    id: newConvId, assistantId: newAssistantId, title: "", truncateIndex: 0,
  });

  const nodesToCopy = nodeRows.slice(0, sourceIndex + 1);
  for (let i = 0; i < nodesToCopy.length; i++) {
    const srcNode = nodesToCopy[i];
    const newNodeId = generateId();
    await db.insert(messageNodes).values({
      id: newNodeId, conversationId: newConvId, nodeIndex: i, selectIndex: srcNode.selectIndex,
    });
    const msgs = await db.select().from(messages)
      .where(eq(messages.nodeId, srcNode.id)).orderBy(asc(messages.messageIndex));
    for (const m of msgs) {
      await db.insert(messages).values({
        id: generateId(), nodeId: newNodeId, messageIndex: m.messageIndex,
        role: m.role, parts: m.parts, annotations: m.annotations,
        createdAt: m.createdAt, finishedAt: m.finishedAt, modelId: m.modelId,
        usage: m.usage, translation: m.translation,
      });
    }
  }

  eventBus.emit(ConversationEvents.LIST_INVALIDATE, { assistantId: newAssistantId });
  return c.json({ conversationId: newConvId }, 201);
});

app.delete("/:id/messages/:messageId", async (c) => {
  const id = c.req.param("id");
  const messageId = c.req.param("messageId");

  const msgRows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msgRows.length) throw new NotFoundError("Message not found");
  const nodeId = msgRows[0].nodeId;

  await db.delete(messages).where(eq(messages.id, messageId));
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, id));

  const nodeRow = await db.select().from(messageNodes).where(eq(messageNodes.id, nodeId)).limit(1);
  if (nodeRow.length) {
    emitNodeUpdate(id, nodeId, nodeRow[0].nodeIndex);
  }
  return c.json({ status: "deleted" });
});

app.post("/:id/nodes/:nodeId/select", async (c) => {
  const id = c.req.param("id");
  const nodeId = c.req.param("nodeId");
  const { selectIndex } = await c.req.json<{ selectIndex: number }>().catch(() => ({ selectIndex: 0 }));
  await db.update(messageNodes).set({ selectIndex }).where(eq(messageNodes.id, nodeId));
  const nodeRow = await db.select().from(messageNodes).where(eq(messageNodes.id, nodeId)).limit(1);
  if (nodeRow.length) {
    emitNodeUpdate(id, nodeId, nodeRow[0].nodeIndex);
  }
  return c.json({ status: "accepted" }, 202);
});

app.post("/:id/regenerate", async (c) => {
  const id = c.req.param("id");

  if (generationHandler.isGenerating(id)) {
    throw new BadRequestError("Already generating");
  }

  const dto = await buildConversationDto(id);
  const appSettings = await loadSettings();
  const assistant = appSettings?.assistants?.find((a) => a.id === dto.assistantId);
  const providerConfig = resolveProvider(appSettings, assistant?.chatModelId);

  if (!providerConfig) {
    throw new BadRequestError("No provider configured for this assistant's model");
  }

  const convMessages = collectConversationMessages(dto);
  const job = generationHandler.createJob(id);

  const lastNode = dto.messages[dto.messages.length - 1];
  const nextNodeIndex = lastNode ? dto.messages.length : 0;
  const newNodeId = generateId();

  await db.insert(messageNodes).values({
    id: newNodeId, conversationId: id, nodeIndex: nextNodeIndex, selectIndex: 0,
  });

  generationHandler.generate({
    providerConfig,
    model: providerConfig.modelId,
    messages: convMessages,
    systemPrompt: undefined,
    job,
    onEvent: (event) => {
      if (event.type === "messages") {
        const lastMsg = event.messages[event.messages.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          persistAssistantMessage(newNodeId, nextNodeIndex, lastMsg, id);
        }
      }
      if (event.type === "done" || event.type === "error") {
        eventBus.emit(ConversationEvents.SNAPSHOT, { conversationId: id });
      }
    },
  }).catch(console.error);

  return c.json({ status: "accepted" }, 202);
});

app.post("/:id/stop", async (c) => {
  const id = c.req.param("id");
  const stopped = generationHandler.stopByConversationId(id);
  if (!stopped) {
    throw new NotFoundError("No active generation for this conversation");
  }
  eventBus.emit(ConversationEvents.SNAPSHOT, { conversationId: id });
  return c.json({ status: "stopped" });
});

app.post("/:id/tool-approval", async (c) => {
  const body = await c.req.json<{ toolCallId: string; state: "approved" | "denied" | "answered"; answer?: string; reason?: string }>().catch(() => ({ toolCallId: "", state: "approved" as const }));

  if (!body.toolCallId) throw new BadRequestError("Missing toolCallId");

  let approvalState;
  if (body.state === "denied") {
    approvalState = { type: "denied" as const, reason: body.reason ?? "" };
  } else if (body.state === "answered") {
    approvalState = { type: "answered" as const, answer: body.answer ?? "" };
  } else {
    approvalState = { type: "approved" as const };
  }

  const resolved = generationHandler.resolveToolApproval(body.toolCallId, approvalState);
  if (!resolved) {
    throw new NotFoundError("No pending tool approval for this toolCallId");
  }

  return c.json({ status: "accepted" }, 202);
});

app.post("/:id/regenerate-title", async (c) => {
  const id = c.req.param("id");

  const dto = await buildConversationDto(id);
  const convMessages = collectConversationMessages(dto);

  if (convMessages.length === 0) {
    throw new BadRequestError("No messages to generate title from");
  }

  const appSettings = await loadSettings();
  const assistant = appSettings?.assistants?.find((a) => a.id === dto.assistantId);
  const providerConfig = resolveProvider(appSettings, assistant?.chatModelId);

  if (!providerConfig) {
    throw new BadRequestError("No provider configured");
  }

  const titlePrompt: UIMessage = {
    id: generateId(),
    role: "user",
    parts: [{ type: "text", text: "Based on the conversation above, generate a short title (max 50 characters). Output ONLY the title text, nothing else. No quotes." }],
    annotations: [],
    createdAt: now(),
  };

  const systemMsg: UIMessage = {
    id: generateId(),
    role: "system",
    parts: [{ type: "text", text: "You are a title generator. Generate a concise title for the conversation. Output only the title." }],
    annotations: [],
    createdAt: now(),
  };

  try {
    const result = await generateChatCompletions(
      { baseUrl: providerConfig.baseUrl, apiKey: providerConfig.apiKey, chatCompletionsPath: providerConfig.chatCompletionsPath, customHeaders: providerConfig.customHeaders },
      { model: providerConfig.modelId, messages: [systemMsg, ...convMessages.slice(-6), titlePrompt], maxTokens: 60 },
    );

    const titleText = result.message.parts
      .filter((p): p is UIMessagePart & { type: "text" } => p.type === "text")
      .map((p) => p.text)
      .join("")
      .trim()
      .replace(/^["']|["']$/g, "")
      .slice(0, 100);

    if (titleText) {
      await db.update(conversations).set({ title: titleText, updatedAt: new Date() }).where(eq(conversations.id, id));
      const convRows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
      if (convRows.length) {
        eventBus.emit(ConversationEvents.LIST_INVALIDATE, { assistantId: convRows[0].assistantId });
      }
      eventBus.emit(ConversationEvents.SNAPSHOT, { conversationId: id });
    }

    return c.json({ status: "updated", title: titleText });
  } catch (err) {
    throw new Error(`Failed to generate title: ${err instanceof Error ? err.message : String(err)}`);
  }
});

app.get("/:id/stream", (c) => {
  return sseStream(c, async (send) => {
    const id = c.req.param("id");
    let seq = 0;

    const dto = await buildConversationDto(id);
    seq++;
    send({
      event: "snapshot",
      data: { type: "snapshot" as const, seq, conversation: dto, serverTime: nowEpochMs() } satisfies ConversationSnapshotEventDto,
    });

    const unsubNodeUpdate = eventBus.on<ConversationNodeUpdateEvent>(
      ConversationEvents.NODE_UPDATE,
      (data) => {
        if (data.conversationId !== id) return;
        buildNodeDto(data.nodeId, data.nodeIndex).then((nodeDto) => {
          if (!nodeDto) return;
          seq++;
          send({
            event: "node_update",
            data: {
              type: "node_update" as const,
              seq,
              conversationId: id,
              nodeId: data.nodeId,
              nodeIndex: data.nodeIndex,
              node: nodeDto,
              updateAt: nowEpochMs(),
              isGenerating: false,
              serverTime: nowEpochMs(),
            } satisfies ConversationNodeUpdateEventDto,
          });
        }).catch(console.error);
      },
    );

    const unsubSnapshot = eventBus.on<{ conversationId: string }>(
      ConversationEvents.SNAPSHOT,
      async (data) => {
        if (data.conversationId !== id) return;
        try {
          const updatedDto = await buildConversationDto(id);
          seq++;
          send({
            event: "snapshot",
            data: { type: "snapshot" as const, seq, conversation: updatedDto, serverTime: nowEpochMs() } satisfies ConversationSnapshotEventDto,
          });
        } catch { /* conversation might have been deleted */ }
      },
    );

    try {
      await new Promise<void>(() => {
        setInterval(() => {
          send({ event: "ping", data: { type: "ping", timestamp: nowEpochMs() } });
        }, 30000);
        // keep-alive until client disconnects (hono handles abort cleanup)
      });
    } finally {
      unsubNodeUpdate();
      unsubSnapshot();
    }
  });
});

function emitNodeUpdate(conversationId: string, nodeId: string, nodeIndex: number) {
  const existing = db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  existing.then((rows) => {
    if (rows.length) {
      eventBus.emit(ConversationEvents.LIST_INVALIDATE, { assistantId: rows[0].assistantId });
    }
  });
  eventBus.emit(ConversationEvents.NODE_UPDATE, { conversationId, nodeId, nodeIndex });
}

async function buildNodeDto(nodeId: string, _nodeIndex: number): Promise<MessageNodeDto | null> {
  const nodeRows = await db.select().from(messageNodes).where(eq(messageNodes.id, nodeId)).limit(1);
  if (!nodeRows.length) return null;
  const msgs = await db.select().from(messages)
    .where(eq(messages.nodeId, nodeId))
    .orderBy(asc(messages.messageIndex));
  return {
    id: nodeId,
    messages: msgs.map(toMessageDto),
    selectIndex: nodeRows[0].selectIndex,
  };
}

function toListDto(row: typeof conversations.$inferSelect): ConversationListDto {
  return {
    id: row.id,
    assistantId: row.assistantId,
    title: row.title,
    isPinned: row.isPinned,
    createAt: new Date(row.createdAt).getTime(),
    updateAt: new Date(row.updatedAt).getTime(),
  };
}

async function buildConversationDto(id: string): Promise<ConversationDto> {
  const conv = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv.length) throw new NotFoundError("Conversation not found");
  const c = conv[0];

  const nodes = await db.select().from(messageNodes)
    .where(eq(messageNodes.conversationId, id))
    .orderBy(asc(messageNodes.nodeIndex));

  const nodeDtos: MessageNodeDto[] = [];
  for (const node of nodes) {
    const msgs = await db.select().from(messages)
      .where(eq(messages.nodeId, node.id))
      .orderBy(asc(messages.messageIndex));
    nodeDtos.push({
      id: node.id,
      messages: msgs.map(toMessageDto),
      selectIndex: node.selectIndex,
    });
  }

  return {
    id: c.id,
    assistantId: c.assistantId,
    title: c.title,
    messages: nodeDtos,
    truncateIndex: c.truncateIndex,
    chatSuggestions: (c.chatSuggestions as string[]) ?? [],
    isPinned: c.isPinned,
    createAt: new Date(c.createdAt).getTime(),
    updateAt: new Date(c.updatedAt).getTime(),
  };
}

function toMessageDto(row: typeof messages.$inferSelect): MessageDto {
  return {
    id: row.id,
    role: row.role,
    parts: (row.parts ?? []) as UIMessagePart[],
    annotations: (row.annotations ?? []) as any[],
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
    modelId: row.modelId,
    usage: row.usage as any,
    translation: row.translation,
  };
}

function extractSnippet(parts: unknown, query: string): string {
  try {
    const text = JSON.stringify(parts);
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return "";
    const start = Math.max(0, idx - 30);
    const end = Math.min(text.length, idx + query.length + 60);
    return (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
  } catch {
    return "";
  }
}

async function loadSettings(): Promise<Settings | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1)).limit(1);
  return (rows[0]?.data as Settings) ?? null;
}

function resolveProvider(
  appSettings: Settings | null,
  chatModelId?: string | null,
): { baseUrl: string; apiKey: string; chatCompletionsPath?: string; customHeaders?: Record<string, string>; modelId: string } | null {
  if (!appSettings) return null;
  const targetModelId = chatModelId ?? appSettings.chatModelId;

  for (const provider of appSettings.providers ?? []) {
    if (!provider.enabled) continue;
    const model = provider.models?.find((m) => m.id === targetModelId);
    if (model) {
      return {
        baseUrl: (provider as any).baseUrl ?? "",
        apiKey: (provider as any).apiKey ?? "",
        chatCompletionsPath: (provider as any).chatCompletionsPath,
        customHeaders: (provider as any).customHeaders,
        modelId: model.modelId,
      };
    }
  }
  return null;
}

function collectConversationMessages(dto: ConversationDto): UIMessage[] {
  const result: UIMessage[] = [];
  for (const node of dto.messages) {
    const selected = node.messages[node.selectIndex] ?? node.messages[0];
    if (selected) {
      result.push({
        id: selected.id,
        role: selected.role as UIMessage["role"],
        parts: selected.parts,
        annotations: selected.annotations ?? [],
        createdAt: selected.createdAt,
        finishedAt: selected.finishedAt,
        modelId: selected.modelId,
        usage: selected.usage,
        translation: selected.translation,
      });
    }
  }
  return result;
}

const pendingMessageBuffer = new Map<string, { nodeId: string; nodeIndex: number; msgId: string; timer: ReturnType<typeof setTimeout> }>();

function persistAssistantMessage(nodeId: string, nodeIndex: number, msg: UIMessage, conversationId: string) {
  const existing = pendingMessageBuffer.get(msg.id);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(async () => {
    pendingMessageBuffer.delete(msg.id);
    try {
      const existingMsgs = await db.select().from(messages).where(eq(messages.nodeId, nodeId)).orderBy(asc(messages.messageIndex));
      const msgIndex = existingMsgs.length;

      await db.insert(messages).values({
        id: msg.id || generateId(),
        nodeId,
        messageIndex: msgIndex,
        role: "assistant",
        parts: msg.parts as unknown as Record<string, unknown>[],
        annotations: msg.annotations as unknown as Record<string, unknown>[],
        createdAt: msg.createdAt,
        finishedAt: msg.finishedAt ?? now(),
        modelId: msg.modelId,
        usage: msg.usage as any,
      }).onConflictDoNothing();

      await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
      emitNodeUpdate(conversationId, nodeId, nodeIndex);
    } catch (err) {
      console.error("Failed to persist assistant message:", err);
    }
  }, 200);

  pendingMessageBuffer.set(msg.id, { nodeId, nodeIndex, msgId: msg.id, timer });
}

export { app as conversationRoutes };
