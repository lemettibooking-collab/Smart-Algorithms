import type { HotRow } from "../model/types";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export function isHotRow(v: unknown): v is HotRow {
  const o = asRecord(v);
  if (!o) return false;
  return typeof o.symbol === "string";
}

export function normalizeHotRows(rows: unknown[]): HotRow[] {
  return rows
    .filter(isHotRow)
    .map((row) => {
      const rec = asRecord(row);
      if (!rec) return row;

      const spikeCandlesNum = Number(rec.spikeCandles);
      const spikeNeedNum = Number(rec.spikeNeed);
      const spikeCandles = Number.isFinite(spikeCandlesNum) ? spikeCandlesNum : undefined;
      const spikeNeed = Number.isFinite(spikeNeedNum) ? spikeNeedNum : undefined;

      const newListingRaw = rec.newListing;
      const newListing = newListingRaw === true || newListingRaw === "true";

      const spikeModeRaw = rec.spikeMode;
      const spikeMode = spikeModeRaw === "scalp" ? "scalp" : spikeModeRaw === "pulse" ? "pulse" : undefined;

      return {
        ...row,
        spikeCandles,
        spikeNeed,
        newListing,
        spikeMode,
      };
    });
}
