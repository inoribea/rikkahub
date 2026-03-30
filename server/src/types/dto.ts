import type { TokenUsage } from "./message";
import type { UIMessageAnnotation } from "./message";
import type { UIMessagePart } from "./parts";

export interface ConversationListDto {
  id: string;
  assistantId: string;
  title: string;
  isPinned: boolean;
  createAt: number;
  updateAt: number;
  isGenerating?: boolean;
}

export interface PagedResult<T> {
  items: T[];
  nextOffset?: number | null;
  hasMore: boolean;
}

export interface UploadedFileDto {
  id: number;
  url: string;
  fileName: string;
  mime: string;
  size: number;
}

export interface UploadFilesResponseDto {
  files: UploadedFileDto[];
}

export interface MessageDto {
  id: string;
  role: string;
  parts: UIMessagePart[];
  annotations?: UIMessageAnnotation[];
  createdAt: string;
  finishedAt?: string | null;
  modelId?: string | null;
  usage?: TokenUsage | null;
  translation?: string | null;
}

export interface MessageNodeDto {
  id: string;
  messages: MessageDto[];
  selectIndex: number;
}

export interface ConversationDto {
  id: string;
  assistantId: string;
  title: string;
  messages: MessageNodeDto[];
  truncateIndex: number;
  chatSuggestions: string[];
  isPinned: boolean;
  createAt: number;
  updateAt: number;
  isGenerating?: boolean;
}

export interface ConversationSnapshotEventDto {
  type: "snapshot";
  seq: number;
  conversation: ConversationDto;
  serverTime: number;
}

export interface ConversationNodeUpdateEventDto {
  type: "node_update";
  seq: number;
  conversationId: string;
  nodeId: string;
  nodeIndex: number;
  node: MessageNodeDto;
  updateAt: number;
  isGenerating: boolean;
  serverTime: number;
}

export interface ConversationErrorEventDto {
  type: "error";
  message: string;
}

export interface ConversationListInvalidateEventDto {
  type: "invalidate";
  assistantId: string;
  timestamp: number;
}

export interface MessageSearchResultDto {
  nodeId: string;
  messageId: string;
  conversationId: string;
  title: string;
  updateAt: number;
  snippet: string;
}

export interface ErrorResponse {
  error: string;
  code: number;
}
