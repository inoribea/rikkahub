import type { UIMessage, UIMessagePart, UIMessageAnnotation, TokenUsage } from "../types";

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  chatCompletionsPath?: string;
  customHeaders?: Record<string, string>;
  customBody?: Record<string, unknown>;
  useResponseApi?: boolean;
}

export interface TextGenParams {
  model: string;
  messages: UIMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  tools?: ToolDef[];
  thinkingBudget?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  needsApproval?: boolean;
}

export interface StreamChunk {
  id: string;
  model: string;
  choices: StreamChoice[];
  usage?: TokenUsage | null;
  finishReason?: string | null;
}

export interface StreamChoice {
  index: number;
  delta: UIMessage;
  finishReason?: string | null;
}

export function buildOpenAIRequest(config: ProviderConfig, params: TextGenParams): Record<string, unknown> {
  const { model, messages, temperature, topP, maxTokens, tools, stream = false } = params;
  const host = new URL(config.baseUrl).host;

  const body: Record<string, unknown> = {
    model,
    messages: buildMessages(messages),
  };

  if (temperature != null && host !== "api.mistral.ai") {
    body.temperature = temperature;
  }
  if (topP != null) body.top_p = topP;
  if (maxTokens != null) body.max_tokens = maxTokens;
  if (stream) {
    body.stream = true;
    if (host !== "api.mistral.ai") {
      body.stream_options = { include_usage: true };
    }
  }

  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  return body;
}

export async function streamChatCompletions(
  config: ProviderConfig,
  params: TextGenParams,
  onChunk: (chunk: StreamChunk) => void,
): Promise<TokenUsage | null> {
  const body = buildOpenAIRequest(config, { ...params, stream: true });
  const url = `${config.baseUrl.replace(/\/+$/, "")}${config.chatCompletionsPath ?? "/v1/chat/completions"}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    ...config.customHeaders,
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: params.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  if (!response.body) throw new Error("Response body is not readable");

  let finalUsage: TokenUsage | null = null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.replace(/\r$/, "");
      if (!trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);

        if (parsed.error) {
          throw new Error(parsed.error.message ?? JSON.stringify(parsed.error));
        }

        const id: string = parsed.id ?? "";
        const model: string = parsed.model ?? "";
        const choices = parsed.choices ?? [];

        const streamChoices: StreamChoice[] = [];
        for (const choice of choices) {
          const messageData = choice.delta ?? choice.message;
          if (!messageData) continue;

          const delta = parseMessageData(messageData);
          streamChoices.push({
            index: choice.index ?? 0,
            delta,
            finishReason: choice.finish_reason ?? null,
          });
        }

        if (parsed.usage) {
          finalUsage = parseUsage(parsed.usage);
        }

        onChunk({ id, model, choices: streamChoices, usage: finalUsage, finishReason: choices[0]?.finish_reason });
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  return finalUsage;
}

export async function generateChatCompletions(
  config: ProviderConfig,
  params: TextGenParams,
): Promise<{ message: UIMessage; usage: TokenUsage | null }> {
  const body = buildOpenAIRequest(config, { ...params, stream: false });
  const url = `${config.baseUrl.replace(/\/+$/, "")}${config.chatCompletionsPath ?? "/v1/chat/completions"}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    ...config.customHeaders,
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: params.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  const parsed = await response.json();
  const choice = parsed.choices?.[0];
  if (!choice) throw new Error("No choices in response");

  const messageData = choice.message ?? choice.delta;
  if (!messageData) throw new Error("No message in choice");

  return {
    message: parseMessageData(messageData),
    usage: parseUsage(parsed.usage),
  };
}

function buildMessages(messages: UIMessage[]): Record<string, unknown>[] {
  return messages
    .filter((m) => isValidToUpload(m))
    .map((msg) => {
      if (msg.role === "assistant") {
        return buildAssistantMessage(msg);
      }
      return buildNonAssistantMessage(msg);
    })
    .filter(Boolean) as Record<string, unknown>[];
}

function buildAssistantMessage(msg: UIMessage): Record<string, unknown> | null {
  const reasoning = msg.parts.find((p): p is UIMessagePart & { type: "reasoning" } => p.type === "reasoning") as { reasoning: string } | undefined;
  const texts = msg.parts.filter((p): p is UIMessagePart & { type: "text" } => p.type === "text");
  const images = msg.parts.filter((p): p is UIMessagePart & { type: "image" } => p.type === "image");
  const tools = msg.parts.filter((p): p is UIMessagePart & { type: "tool" } => p.type === "tool");

  const hasContent = texts.some((t) => t.text.trim()) || images.some((i) => i.url.trim());
  const hasReasoning = !!reasoning?.reasoning?.trim();
  if (!hasContent && !hasReasoning && tools.length === 0) return null;

  const result: Record<string, unknown> = { role: "assistant" };

  if (hasReasoning) {
    result.reasoning_content = reasoning!.reasoning;
  }

  if (texts.length === 1 && !images.length) {
    result.content = texts[0].text;
  } else {
    const content: unknown[] = [];
    for (const t of texts) content.push({ type: "text", text: t.text });
    for (const i of images) content.push({ type: "image_url", image_url: { url: i.url } });
    result.content = content;
  }

  if (tools.length > 0) {
    result.tool_calls = tools.map((t: any) => ({
      id: t.toolCallId,
      type: "function",
      function: { name: t.toolName, arguments: t.input },
    }));
  }

  return result;
}

function buildNonAssistantMessage(msg: UIMessage): Record<string, unknown> {
  const texts = msg.parts.filter((p): p is UIMessagePart & { type: "text" } => p.type === "text");
  const images = msg.parts.filter((p): p is UIMessagePart & { type: "image" } => p.type === "image");
  const docs = msg.parts.filter((p): p is UIMessagePart & { type: "document" } => p.type === "document");
  const audios = msg.parts.filter((p): p is UIMessagePart & { type: "audio" } => p.type === "audio");
  const videos = msg.parts.filter((p): p is UIMessagePart & { type: "video" } => p.type === "video");

  const multimodal = [...images, ...docs, ...audios, ...videos].length > 0;

  const result: Record<string, unknown> = {
    role: msg.role === "system" ? "system" : msg.role === "tool" ? "tool" : "user",
  };

  if (texts.length === 1 && !multimodal) {
    result.content = texts[0].text;
  } else {
    const content: unknown[] = [];
    for (const t of texts) content.push({ type: "text", text: t.text });
    for (const i of images) content.push({ type: "image_url", image_url: { url: i.url } });
    for (const d of docs) content.push({ type: "text", text: `[Document: ${d.fileName}]` });
    for (const a of audios) content.push({ type: "input_audio", input_audio: { data: a.url, format: "wav" } });
    for (const v of videos) content.push({ type: "video_url", video_url: { url: v.url } });
    result.content = content;
  }

  return result;
}

function parseMessageData(obj: Record<string, unknown>): UIMessage {
  const role = (obj.role as string)?.toUpperCase() === "SYSTEM" ? "system"
    : (obj.role as string)?.toUpperCase() === "USER" ? "user"
    : (obj.role as string)?.toUpperCase() === "TOOL" ? "tool"
    : "assistant";

  const content = typeof obj.content === "string" ? obj.content : "";
  const reasoning = (obj.reasoning_content as string) || (obj.reasoning as string) || "";
  const toolCalls = (obj.tool_calls as Record<string, unknown>[]) ?? [];
  const rawAnnotations = (obj.annotations as Record<string, unknown>[]) ?? [];

  const parts: UIMessagePart[] = [];

  if (reasoning) {
    parts.push({ type: "reasoning", reasoning, createdAt: new Date().toISOString(), finishedAt: null });
  }

  for (const tc of toolCalls) {
    const fn = tc.function as Record<string, unknown> | undefined;
    parts.push({
      type: "tool",
      toolCallId: (tc.id as string) ?? "",
      toolName: (fn?.name as string) ?? "",
      input: (fn?.arguments as string) ?? "",
      output: [],
      approvalState: { type: "auto" },
    });
  }

  if (content) {
    parts.push({ type: "text", text: content });
  }

  const annotations: UIMessageAnnotation[] = rawAnnotations.map((a): UIMessageAnnotation => {
    const cit = a.url_citation as Record<string, unknown> | undefined;
    return {
      type: "url_citation",
      title: (cit?.title as string) ?? "",
      url: (cit?.url as string) ?? "",
    };
  });

  return {
    id: "",
    role,
    parts,
    annotations,
    createdAt: new Date().toISOString(),
  };
}

function parseUsage(obj: Record<string, unknown>): TokenUsage | null {
  if (!obj) return null;
  const details = obj.prompt_tokens_details as Record<string, unknown> | undefined;
  return {
    promptTokens: (obj.prompt_tokens as number) ?? 0,
    completionTokens: (obj.completion_tokens as number) ?? 0,
    totalTokens: (obj.total_tokens as number) ?? 0,
    cachedTokens: (details?.cached_tokens as number) ?? 0,
  };
}

function isValidToUpload(msg: UIMessage): boolean {
  return msg.parts.some((p) => {
    if (p.type === "text") return p.text.trim().length > 0;
    if (p.type === "image") return p.url.trim().length > 0;
    if (p.type === "document") return p.url.trim().length > 0;
    if (p.type === "reasoning") return p.reasoning.trim().length > 0;
    return true;
  });
}
