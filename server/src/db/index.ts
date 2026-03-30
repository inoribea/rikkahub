import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/rikkahub";
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient);
export { queryClient as sql };
