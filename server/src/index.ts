import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { env } from "./lib/env";
import { verifyToken } from "./lib/auth";
import { AppError } from "./lib/errors";
import { authRoutes } from "./routes/auth";
import { settingsRoutes } from "./routes/settings";
import { conversationRoutes } from "./routes/conversations";
import { fileRoutes } from "./routes/files";
import type { ErrorResponse } from "./types";

const app = new Hono();

app.use("*", logger());
app.use("*", cors({ origin: env.CORS_ORIGIN, allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], allowHeaders: ["Content-Type", "Authorization"] }));

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  if (err instanceof AppError) {
    return c.json<ErrorResponse>({ error: err.message, code: err.code }, err.code as any);
  }
  return c.json<ErrorResponse>({ error: "Internal server error", code: 500 }, 500);
});

app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/auth/token") return next();

  const auth = c.req.header("Authorization");
  const queryToken = new URL(c.req.url).searchParams.get("access_token");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : queryToken;

  if (!token || !(await verifyToken(token, env.JWT_SECRET))) {
    return c.json<ErrorResponse>({ error: "Unauthorized", code: 401 }, 401);
  }
  await next();
});

app.route("/api/auth", authRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/conversations", conversationRoutes);
app.route("/api/files", fileRoutes);

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.get("*", serveStatic({ root: "./public" }));

export { app };

console.log(`RikkaHub Server starting on http://localhost:${env.PORT}`);
serve({ fetch: app.fetch, port: env.PORT });
