import { getDb } from "@/lib/db";

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getJson<T>(key: string): T | null {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM kv WHERE key = ? LIMIT 1")
    .get(key) as { value: string } | undefined;

  if (!row) return null;
  return safeJsonParse<T>(String(row.value ?? ""));
}

export function setJson<T>(key: string, value: T): void {
  const db = getDb();
  const updatedTs = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO kv(key, value, updated_ts)
     VALUES(@key, @value, @updated_ts)`
  ).run({
    key,
    value: JSON.stringify(value),
    updated_ts: updatedTs,
  });
}
