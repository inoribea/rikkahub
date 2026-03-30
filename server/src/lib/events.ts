type Listener<T = unknown> = (data: T) => void;

class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on<T>(event: string, listener: Listener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener as Listener);
    return () => {
      set.delete(listener as Listener);
      if (set.size === 0) this.listeners.delete(event);
    };
  }

  emit<T>(event: string, data: T): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(data);
      } catch (err) {
        console.error(`EventBus error in "${event}":`, err);
      }
    }
  }
}

export interface ConversationListInvalidateEvent {
  assistantId: string;
}

export interface ConversationNodeUpdateEvent {
  conversationId: string;
  nodeId: string;
  nodeIndex: number;
}

export interface ConversationSnapshotEvent {
  conversationId: string;
}

export const eventBus = new EventBus();

export const ConversationEvents = {
  /** A conversation was created/deleted/renamed/pinned/moved — list needs refresh */
  LIST_INVALIDATE: "conversation:list-invalidate",
  /** A specific node in a conversation was updated (new message, edit, delete) */
  NODE_UPDATE: "conversation:node-update",
  /** Full conversation snapshot needed (e.g. after generation completes) */
  SNAPSHOT: "conversation:snapshot",
} as const;
