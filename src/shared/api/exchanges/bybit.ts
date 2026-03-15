import type { SpotExchangeAdapter } from "@/src/shared/api/exchanges/types";

function normalizeSpotSymbol(symbol: string) {
  const clean = String(symbol ?? "").trim().toUpperCase().replace(/[_-]/g, "");
  if (!clean.endsWith("USDT") || clean.length <= 4) return null;
  return {
    baseAsset: clean.slice(0, -4),
    quoteAsset: "USDT",
  };
}

export const bybitSpotAdapter: SpotExchangeAdapter = {
  exchange: "bybit",
  enabled: false,
  supportsProductionUniverse: false,
  normalizeSpotSymbol,
  fetchSpotTickers: async () => [],
  fetchSpotCandles: async () => [],
};
