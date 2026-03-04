import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";

export type EventRecord = {
  id: string;
  ts: number;
  exchange: string;
  symbol: string;
  type: string;
  payload: Record<string, unknown>;
};

export type ListEventsParams = {
  limit?: number;
  symbol?: string;
  type?: string;
  exchange?: string;
  sinceTs?: number;
};

export type ComputeEventIdInput = {
  exchange: string;
  symbol: string;
  type: string;
  importantKey?: string;
  bucketMs?: number;
  ts?: number;
};

function capLimit(limit: number | undefined): number {
  const n = Number(limit ?? 100);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(2000, Math.floor(n));
}

function safeObjectJsonParse(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return {};
}

export function computeEventId(input: ComputeEventIdInput): string {
  const exchange = String(input.exchange ?? "").trim().toLowerCase();
  const symbol = String(input.symbol ?? "").trim().toUpperCase();
  const type = String(input.type ?? "").trim().toLowerCase();
  const importantKey = String(input.importantKey ?? "").trim();
  const bucketMs = Math.max(1, Number(input.bucketMs ?? 30_000) || 30_000);
  const ts = Number(input.ts ?? Date.now()) || Date.now();
  const bucket = Math.floor(ts / bucketMs) * bucketMs;

  const basis = `${exchange}|${symbol}|${type}|${importantKey}|${bucket}`;
  return createHash("sha1").update(basis).digest("hex");
}

export function putEvent(ev: EventRecord, mode: "ignore" | "replace" = "ignore"): void {
  const db = getDb();
  const sql =
    mode === "replace"
      ? `INSERT OR REPLACE INTO events(id, ts, exchange, symbol, type, payload)
         VALUES(@id, @ts, @exchange, @symbol, @type, @payload)`
      : `INSERT OR IGNORE INTO events(id, ts, exchange, symbol, type, payload)
         VALUES(@id, @ts, @exchange, @symbol, @type, @payload)`;

  db.prepare(sql).run({
    id: ev.id,
    ts: ev.ts,
    exchange: ev.exchange,
    symbol: ev.symbol,
    type: ev.type,
    payload: JSON.stringify(ev.payload ?? {}),
  });
}

export function listEvents(params: ListEventsParams = {}): EventRecord[] {
  const db = getDb();
  const where: string[] = [];
  const bind: Record<string, unknown> = { limit: capLimit(params.limit) };

  if (params.symbol) {
    where.push("symbol = @symbol");
    bind.symbol = String(params.symbol).trim().toUpperCase();
  }
  if (params.type) {
    where.push("type = @type");
    bind.type = String(params.type).trim().toLowerCase();
  }
  if (params.exchange) {
    where.push("exchange = @exchange");
    bind.exchange = String(params.exchange).trim().toLowerCase();
  }
  if (Number.isFinite(Number(params.sinceTs))) {
    where.push("ts >= @sinceTs");
    bind.sinceTs = Number(params.sinceTs);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `
    SELECT id, ts, exchange, symbol, type, payload
    FROM events
    ${whereSql}
    ORDER BY ts DESC
    LIMIT @limit
  `;

  const rows = db.prepare(sql).all(bind) as Array<{
    id: string;
    ts: number;
    exchange: string;
    symbol: string;
    type: string;
    payload: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    ts: Number(r.ts) || 0,
    exchange: String(r.exchange ?? ""),
    symbol: String(r.symbol ?? ""),
    type: String(r.type ?? ""),
    payload: safeObjectJsonParse(String(r.payload ?? "{}")),
  }));
}
