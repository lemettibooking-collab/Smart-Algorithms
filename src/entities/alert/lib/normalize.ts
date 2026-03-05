import type { AlertRow } from "@/src/entities/alert/model/types";

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

export function isAlertRow(v: unknown): v is AlertRow {
  const o = asRecord(v);
  if (!o) return false;
  return typeof o.symbol === "string" && typeof o.exchange === "string";
}

export function normalizeAlertRows(rows: unknown[]): AlertRow[] {
  return rows.filter(isAlertRow);
}
