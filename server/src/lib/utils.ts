import { nanoid } from "nanoid";

export function generateId(): string {
  return nanoid();
}

export function now(): string {
  return new Date().toISOString();
}

export function nowEpochMs(): number {
  return Date.now();
}

export function validateUuid(value: string): string {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!re.test(value)) throw new Error(`Invalid UUID: ${value}`);
  return value.toLowerCase();
}
