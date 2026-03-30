export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/rikkahub",
  POSTGRES_URL: process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/rikkahub",
  JWT_SECRET: process.env.JWT_SECRET ?? "change-me-in-production",
  PORT: parseInt(process.env.PORT ?? "3001", 10),
  WEB_PASSWORD: process.env.WEB_PASSWORD ?? "rikkahub",
  DATA_DIR: process.env.DATA_DIR ?? "./data",
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "*",
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN ?? "",
} as const;
