import type { Exchange, HotTf, SpikeMode } from "@/src/entities/hot";

export type SortKey = "score" | "symbol" | "price" | "changePercent" | "volume" | "volSpike" | "signal";
export type SortDir = "asc" | "desc";

export type HotFilters = {
  tf: HotTf;
  exchange: Exchange;
  spikeMode: SpikeMode;
  minVol: number;
};

export const HOT_SPIKE_MODE_KEY = "hot:spikeMode";

export const DEFAULT_HOT_FILTERS: HotFilters = {
  tf: "24h",
  exchange: "binance",
  spikeMode: "pulse",
  minVol: 0,
};

const ALLOWED_TF: HotTf[] = ["24h", "1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M", "1y"];

export function sanitizeTf(v: unknown, fallback: HotTf): HotTf {
  const s = (typeof v === "string" ? v : "").trim() as HotTf;
  return ALLOWED_TF.includes(s) ? s : fallback;
}

export function sanitizeExchange(v: unknown, fallback: Exchange): Exchange {
  const s = (typeof v === "string" ? v : "").trim().toLowerCase();
  if (s === "mexc") return "mexc";
  if (s === "binance") return "binance";
  return fallback;
}

export function sanitizeSpikeMode(v: unknown, fallback: SpikeMode): SpikeMode {
  const s = (typeof v === "string" ? v : "").trim().toLowerCase();
  return s === "scalp" ? "scalp" : fallback;
}

export function tfLabel(tf: HotTf) {
  return tf === "24h" ? "24h %" : `Δ ${tf}`;
}

export function loadSpikeMode(): SpikeMode {
  if (typeof window === "undefined") return DEFAULT_HOT_FILTERS.spikeMode;
  try {
    return sanitizeSpikeMode(localStorage.getItem(HOT_SPIKE_MODE_KEY), DEFAULT_HOT_FILTERS.spikeMode);
  } catch {
    return DEFAULT_HOT_FILTERS.spikeMode;
  }
}

export function saveSpikeMode(mode: SpikeMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HOT_SPIKE_MODE_KEY, mode);
  } catch {
    // ignore
  }
}
