export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

export interface UIMessageAnnotation {
  type: "url_citation";
  title: string;
  url: string;
}

export interface UIMessage {
  id: string;
  role: MessageRole;
  parts: import("./parts").UIMessagePart[];
  annotations: UIMessageAnnotation[];
  createdAt: string;
  finishedAt?: string | null;
  modelId?: string | null;
  usage?: TokenUsage | null;
  translation?: string | null;
}
