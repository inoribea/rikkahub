import { Hono } from "hono";
import { db } from "../db";
import { managedFiles } from "../db/schema";
import { eq } from "drizzle-orm";
import { put, del, head } from "@vercel/blob";
import { BadRequestError, NotFoundError } from "../lib/errors";
import type { UploadedFileDto, UploadFilesResponseDto } from "../types";

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

const app = new Hono();

app.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const uploaded: UploadedFileDto[] = [];

  for (const [, value] of Object.entries(body)) {
    if (!(value instanceof File)) continue;

    if (value.size > MAX_UPLOAD_SIZE) {
      throw new BadRequestError(`File too large: max ${MAX_UPLOAD_SIZE / 1024 / 1024} MB`);
    }

    const id = await db.insert(managedFiles).values({
      displayName: value.name,
      originalName: value.name,
      mimeType: value.type || "application/octet-stream",
      sizeBytes: value.size,
      storagePath: "",
    }).returning({ id: managedFiles.id }).then(r => r[0]?.id);

    const buffer = Buffer.from(await value.arrayBuffer());
    const blobPath = `rikkahub-uploads/${id}_${value.name}`;

    const blob = await put(blobPath, buffer, {
      access: "public",
      contentType: value.type || "application/octet-stream",
    });

    await db.update(managedFiles).set({ storagePath: blob.url }).where(eq(managedFiles.id, id!));

    uploaded.push({
      id: id!,
      url: `/api/files/id/${id}`,
      fileName: value.name,
      mime: value.type || "application/octet-stream",
      size: value.size,
    });
  }

  if (!uploaded.length) throw new BadRequestError("No files uploaded");
  return c.json<UploadFilesResponseDto>({ files: uploaded }, 201);
});

app.get("/id/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) throw new BadRequestError("Invalid file id");

  const file = await db.select().from(managedFiles).where(eq(managedFiles.id, id)).limit(1);
  if (!file.length) throw new NotFoundError("File not found");

  const storageUrl = file[0].storagePath;
  if (!storageUrl.startsWith("http")) throw new NotFoundError("File URL not available");

  const blob = await head(storageUrl);
  if (!blob) throw new NotFoundError("File not found in blob storage");

  const response = await fetch(storageUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  return new Response(buffer, {
    headers: { "Content-Type": file[0].mimeType, "Content-Length": String(buffer.length) },
  });
});

app.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) throw new BadRequestError("Invalid file id");

  const file = await db.select().from(managedFiles).where(eq(managedFiles.id, id)).limit(1);
  if (!file.length) throw new NotFoundError("File not found");

  const storageUrl = file[0].storagePath;
  if (storageUrl.startsWith("http")) {
    await del(storageUrl).catch(() => {});
  }

  await db.delete(managedFiles).where(eq(managedFiles.id, id));
  return c.json({ status: "deleted" });
});

export { app as fileRoutes };

