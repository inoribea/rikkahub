export type ToolApprovalState =
  | { type: "auto" }
  | { type: "pending" }
  | { type: "approved" }
  | { type: "denied"; reason: string }
  | { type: "answered"; answer: string };

export interface TextPart {
  type: "text";
  text: string;
  metadata?: Record<string, unknown> | null;
}

export interface ImagePart {
  type: "image";
  url: string;
  metadata?: Record<string, unknown> | null;
}

export interface VideoPart {
  type: "video";
  url: string;
  metadata?: Record<string, unknown> | null;
}

export interface AudioPart {
  type: "audio";
  url: string;
  metadata?: Record<string, unknown> | null;
}

export interface DocumentPart {
  type: "document";
  url: string;
  fileName: string;
  mime: string;
  metadata?: Record<string, unknown> | null;
}

export interface ReasoningPart {
  type: "reasoning";
  reasoning: string;
  createdAt?: string;
  finishedAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ToolPart {
  type: "tool";
  toolCallId: string;
  toolName: string;
  input: string;
  output: UIMessagePart[];
  approvalState: ToolApprovalState;
  metadata?: Record<string, unknown> | null;
}

export type UIMessagePart =
  | TextPart
  | ImagePart
  | VideoPart
  | AudioPart
  | DocumentPart
  | ReasoningPart
  | ToolPart;
