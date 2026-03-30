import { Hono } from "hono";
import { db } from "../db";
import { settings } from "../db/schema";
import { eq } from "drizzle-orm";
import { sseStream } from "../lib/sse";
import type { Settings } from "../types";

const app = new Hono();

app.get("/stream", (c) => {
  return sseStream(c, async (send) => {
    const rows = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
    const data = rows[0]?.data as Settings | undefined;
    if (data) {
      send({ event: "update", data });
    }
  });
});

app.get("/", async (c) => {
  const rows = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  const data = rows[0]?.data as Settings | undefined;
  return c.json(data ?? {});
});

app.put("/", async (c) => {
  const body = await c.req.json();
  await db
    .insert(settings)
    .values({ id: 1, data: body, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.id, set: { data: body, updatedAt: new Date() } });
  return c.json({ status: "updated" });
});

app.post("/assistant", async (c) => {
  const { assistantId } = await c.req.json<{ assistantId: string }>().catch(() => ({ assistantId: "" }));
  if (!assistantId) throw new Error("Missing assistantId");

  const rows = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  const current = (rows[0]?.data ?? {}) as Settings;
  const updated = { ...current, assistantId };
  await db
    .insert(settings)
    .values({ id: 1, data: updated, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.id, set: { data: updated, updatedAt: new Date() } });
  return c.json({ status: "updated" });
});

export { app as settingsRoutes };
