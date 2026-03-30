import type { UIMessage, UIMessagePart, TokenUsage, ToolApprovalState } from "../types";
import { generateId, now } from "../lib/utils";

export type GenerationEvent =
  | { type: "messages"; messages: UIMessage[] }
  | { type: "error"; message: string }
  | { type: "done" };

export interface GenerationJob {
  id: string;
  conversationId: string;
  abortController: AbortController;
  isGenerating: boolean;
}

export class GenerationHandler {
  private jobs = new Map<string, GenerationJob>();
  private toolApprovalResolvers = new Map<string, (state: ToolApprovalState) => void>();

  createJob(conversationId: string): GenerationJob {
    const job: GenerationJob = {
      id: generateId(),
      conversationId,
      abortController: new AbortController(),
      isGenerating: true,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  stopByConversationId(conversationId: string): boolean {
    for (const [id, job] of this.jobs) {
      if (job.conversationId === conversationId && job.isGenerating) {
        job.abortController.abort();
        job.isGenerating = false;
        this.jobs.delete(id);
        return true;
      }
    }
    return false;
  }

  stopGeneration(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.abortController.abort();
    job.isGenerating = false;
    this.jobs.delete(jobId);
    return true;
  }

  isGenerating(conversationId: string): boolean {
    for (const job of this.jobs.values()) {
      if (job.conversationId === conversationId && job.isGenerating) return true;
    }
    return false;
  }

  getJobForConversation(conversationId: string): GenerationJob | undefined {
    for (const job of this.jobs.values()) {
      if (job.conversationId === conversationId) return job;
    }
    return undefined;
  }

  resolveToolApproval(toolCallId: string, state: ToolApprovalState): boolean {
    const resolver = this.toolApprovalResolvers.get(toolCallId);
    if (!resolver) return false;
    resolver(state);
    this.toolApprovalResolvers.delete(toolCallId);
    return true;
  }

  async generate(
    params: {
      providerConfig: { baseUrl: string; apiKey: string; chatCompletionsPath?: string; customHeaders?: Record<string, string> };
      model: string;
      messages: UIMessage[];
      systemPrompt?: string;
      temperature?: number;
      topP?: number;
      maxTokens?: number;
      tools?: ToolDef[];
      maxSteps?: number;
      job: GenerationJob;
      onEvent: (event: GenerationEvent) => void;
    },
  ): Promise<void> {
    const { providerConfig, model, messages: inputMessages, systemPrompt, temperature, topP, maxTokens, tools, maxSteps = 256, job, onEvent } = params;

    let messages = [...inputMessages];

    try {
      for (let step = 0; step < maxSteps; step++) {
        if (job.abortController.signal.aborted) break;

        const allMessages: UIMessage[] = [];
        if (systemPrompt?.trim()) {
          allMessages.push({ id: generateId(), role: "system", parts: [{ type: "text", text: systemPrompt }], annotations: [], createdAt: now() });
        }
        allMessages.push(...messages);

        const { streamChatCompletions } = await import("./provider");
        let currentMessages: UIMessage[] = messages;

        await streamChatCompletions(
          { baseUrl: providerConfig.baseUrl, apiKey: providerConfig.apiKey, chatCompletionsPath: providerConfig.chatCompletionsPath, customHeaders: providerConfig.customHeaders },
          { model, messages: allMessages, temperature, topP, maxTokens, tools, signal: job.abortController.signal },
          (chunk) => {
            currentMessages = mergeChunk(currentMessages, chunk);
            onEvent({ type: "messages", messages: currentMessages });
          },
        );

        if (job.abortController.signal.aborted) break;

        const lastMsg = currentMessages[currentMessages.length - 1];
        const pendingTools = lastMsg.parts
          .filter((p): p is UIMessagePart & { type: "tool" } => p.type === "tool" && p.output.length === 0);

        if (pendingTools.length === 0) {
          onEvent({ type: "done" });
          return;
        }

        const needsApproval = tools?.some((t) => t.needsApproval);
        if (needsApproval) {
          const updatedParts = lastMsg.parts.map((p) => {
            if (p.type === "tool" && (p as any).output.length === 0) {
              const toolDef = tools?.find((t) => t.name === (p as any).toolName);
              if (toolDef?.needsApproval) {
                return { ...p, approvalState: { type: "pending" as const } };
              }
            }
            return p;
          });
          currentMessages = [...currentMessages.slice(0, -1), { ...lastMsg, parts: updatedParts as UIMessagePart[] }];
          onEvent({ type: "messages", messages: currentMessages });

          for (const tool of pendingTools as { toolCallId: string }[]) {
            const state = await new Promise<ToolApprovalState>((resolve) => {
              this.toolApprovalResolvers.set(tool.toolCallId, resolve);
            });

            if (state.type === "denied") {
              const idx = currentMessages.length - 1;
              const parts = currentMessages[idx].parts.map((p) => {
                if (p.type === "tool" && (p as any).toolCallId === tool.toolCallId) {
                  return { ...p, output: [{ type: "text", text: JSON.stringify({ error: `Tool denied: ${(state as any).reason ?? "No reason"}` }) }] };
                }
                return p;
              });
              currentMessages = [...currentMessages.slice(0, idx), { ...currentMessages[idx], parts: parts as UIMessagePart[] }];
              continue;
            }

            if (state.type === "answered") {
              const idx = currentMessages.length - 1;
              const parts = currentMessages[idx].parts.map((p) => {
                if (p.type === "tool" && (p as any).toolCallId === tool.toolCallId) {
                  return { ...p, output: [{ type: "text", text: (state as any).answer }] };
                }
                return p;
              });
              currentMessages = [...currentMessages.slice(0, idx), { ...currentMessages[idx], parts: parts as UIMessagePart[] }];
              continue;
            }
          }
        }

        const executedParts = lastMsg.parts.map((p) => {
          if (p.type === "tool" && (p as any).output.length === 0) {
            return { ...p, output: [{ type: "text", text: JSON.stringify({ error: "Tool execution not yet implemented in server mode" }) }] };
          }
          return p;
        });

        currentMessages = [...currentMessages.slice(0, -1), { ...lastMsg, parts: executedParts as UIMessagePart[] }];
        messages = currentMessages;
        onEvent({ type: "messages", messages: currentMessages });
      }

      onEvent({ type: "done" });
    } catch (err) {
      if (job.abortController.signal.aborted) {
        onEvent({ type: "done" });
        return;
      }
      onEvent({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      job.isGenerating = false;
      this.jobs.delete(job.id);
    }
  }
}

function mergeChunk(messages: UIMessage[], chunk: import("./provider").StreamChunk): UIMessage[] {
  if (!chunk.choices.length) return messages;

  for (const choice of chunk.choices) {
    const delta = choice.delta;
    if (messages.length === 0) {
      messages = [{ ...delta, id: delta.id || generateId() }];
      continue;
    }

    const last = messages[messages.length - 1];
    if (last.role !== delta.role) {
      messages = [...messages, { ...delta, modelId: chunk.model || undefined }];
    } else {
      const merged = appendParts(last.parts, delta.parts);
      const mergedAnnotations = delta.annotations.length > 0 ? delta.annotations : last.annotations;
      messages = [...messages.slice(0, -1), { ...last, parts: merged, annotations: mergedAnnotations }];
    }
  }

  if (chunk.usage) {
    const last = messages[messages.length - 1];
    if (last) {
      const merged = last.usage ? mergeUsage(last.usage, chunk.usage) : chunk.usage;
      messages = [...messages.slice(0, -1), { ...last, usage: merged }];
    }
  }

  return messages;
}

function appendParts(existing: UIMessagePart[], delta: UIMessagePart[]): UIMessagePart[] {
  let result = [...existing];

  for (const part of delta) {
    if (part.type === "text") {
      if (part.text === "") continue;
      const last = result[result.length - 1];
      if (last?.type === "text") {
        result = [...result.slice(0, -1), { ...last, text: last.text + part.text }];
      } else {
        result.push(part);
      }
    } else if (part.type === "reasoning") {
      if (part.reasoning === "") continue;
      const last = result[result.length - 1];
      if (last?.type === "reasoning") {
        result = [...result.slice(0, -1), { ...last, reasoning: last.reasoning + part.reasoning, finishedAt: null }];
      } else {
        result.push(part);
      }
    } else if (part.type === "tool") {
      const existingTool = result.find(
        (p): p is UIMessagePart & { type: "tool"; toolCallId: string } => p.type === "tool" && (p as any).toolCallId === part.toolCallId
      );
      if (existingTool) {
        result = result.map((p) => {
          if ((p as any).type === "tool" && (p as any).toolCallId === part.toolCallId) {
            return { ...p, input: (p as any).input + (part as any).input };
          }
          return p;
        });
      } else {
        result.push(part);
      }
    } else {
      result.push(part);
    }
  }

  if (delta.length > 0 && !delta.some((p) => p.type === "reasoning")) {
    result = result.map((p) => {
      if (p.type === "reasoning" && p.finishedAt == null) {
        return { ...p, finishedAt: new Date().toISOString() };
      }
      return p;
    });
  }

  return result;
}

function mergeUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: b.promptTokens || a.promptTokens,
    completionTokens: (a.completionTokens || 0) + (b.completionTokens || 0),
    totalTokens: b.totalTokens || a.totalTokens,
    cachedTokens: b.cachedTokens || a.cachedTokens,
  };
}

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  needsApproval?: boolean;
}
