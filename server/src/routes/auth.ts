import { Hono } from "hono";
import { z } from "zod";
import { env } from "../lib/env";
import { createToken } from "../lib/auth";
import { BadRequestError } from "../lib/errors";

const app = new Hono();

app.post("/token", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { password } = z.object({ password: z.string().min(1) }).parse(body);

  if (password !== env.WEB_PASSWORD) {
    throw new BadRequestError("Invalid password");
  }

  const { token, expiresAt } = await createToken(env.JWT_SECRET);
  return c.json({ token, expiresAt });
});

export { app as authRoutes };
