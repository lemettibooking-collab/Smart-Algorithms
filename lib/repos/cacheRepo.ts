import { getDb } from "@/lib/db";

function nowMs() {
  return Date.now();
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function cacheGet<T>(key: string): T | null {
  const db = getDb();
  const row = db
    .prepare("SELECT value, expire_ts FROM cache WHERE key = ? LIMIT 1")
    .get(key) as { value: string; expire_ts: number } | undefined;

  if (!row) return null;
  const expireTs = Number(row.expire_ts) || 0;

  if (expireTs <= nowMs()) {
    db.prepare("DELETE FROM cache WHERE key = ?").run(key);
    return null;
  }

  const parsed = safeJsonParse<T>(String(row.value ?? ""));
  if (parsed === null) {
    db.prepare("DELETE FROM cache WHERE key = ?").run(key);
    return null;
  }

  return parsed;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  const db = getDb();
  const now = nowMs();
  const expireTs = now + Math.max(1, Number(ttlMs) || 1);

  db.prepare(
    `INSERT OR REPLACE INTO cache(key, value, expire_ts, updated_ts)
     VALUES(@key, @value, @expire_ts, @updated_ts)`
  ).run({
    key,
    value: JSON.stringify(value),
    expire_ts: expireTs,
    updated_ts: now,
  });
}

export function cacheSweepExpired(maxDelete = 500): number {
  const db = getDb();
  const limit = Math.max(1, Math.min(5000, Math.floor(maxDelete)));
  const now = nowMs();

  const rows = db
    .prepare("SELECT key FROM cache WHERE expire_ts <= ? ORDER BY expire_ts ASC LIMIT ?")
    .all(now, limit) as Array<{ key: string }>;

  if (!rows.length) return 0;

  const del = db.prepare("DELETE FROM cache WHERE key = ?");
  const tx = db.transaction((keys: string[]) => {
    for (const k of keys) del.run(k);
  });
  tx(rows.map((r) => r.key));

  return rows.length;
}
