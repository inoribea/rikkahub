import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

interface SSEMessage {
  event?: string;
  data: unknown;
  id?: string;
}

export async function sseStream(
  c: Context,
  handler: (send: (msg: SSEMessage) => void) => Promise<void>,
) {
  return streamSSE(c, async (stream) => {
    const send = (msg: SSEMessage) => {
      const data = typeof msg.data === "string" ? msg.data : JSON.stringify(msg.data);
      stream.writeSSE({ data, event: msg.event, id: msg.id }).catch(() => {});
    };

    try {
      await handler(send);
    } catch (err) {
      if (err instanceof Error && err.message.includes("stream")) return;
      console.error("SSE error:", err);
    }
  });
}
