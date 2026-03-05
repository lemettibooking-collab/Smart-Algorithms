import type { SymbolCandle } from "@/src/entities/symbol/model/types";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export function isSymbolCandle(v: unknown): v is SymbolCandle {
  const o = asRecord(v);
  if (!o) return false;
  return typeof o.openTime === "number" && typeof o.close === "number";
}

export function normalizeKlines(rows: unknown[]): SymbolCandle[] {
  return rows
    .filter(isSymbolCandle)
    .map((row) => ({
      ...row,
      closeTime: typeof row.closeTime === "number" ? row.closeTime : row.openTime,
      quoteVolume: typeof row.quoteVolume === "number" ? row.quoteVolume : row.volume * row.close,
    }))
    .slice()
    .sort((a, b) => a.openTime - b.openTime);
}
