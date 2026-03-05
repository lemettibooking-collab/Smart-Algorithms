import type { EventRow } from "../model/types";

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

export function isEventRow(v: unknown): v is EventRow {
  const o = asRecord(v);
  if (!o) return false;
  const hasEventId = typeof o.eventId === "string" && o.eventId.length > 0;
  const hasTs = typeof o.ts === "number" && Number.isFinite(o.ts);
  const hasSymbol = typeof o.symbol === "string" && o.symbol.length > 0;
  return hasEventId || (hasTs && hasSymbol);
}

export function getEventStableKey(ev: EventRow): string {
  return ev.eventId ?? `${ev.tf}:${ev.baseAsset ?? ev.symbol}:${ev.ts}:${ev.eventType ?? ev.signal ?? ""}:${Math.round((ev.score ?? 0) * 100)}`;
}

export function getEventTs(ev: EventRow): number {
  return Number(ev.ts ?? 0) || 0;
}
