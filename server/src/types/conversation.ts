import type { UIMessage } from "./message";

export interface MessageNode {
  id: string;
  messages: UIMessage[];
  selectIndex: number;
}

export interface Conversation {
  id: string;
  assistantId: string;
  title: string;
  messageNodes: MessageNode[];
  truncateIndex: number;
  chatSuggestions: string[];
  isPinned: boolean;
  createAt: number;
  updateAt: number;
}
