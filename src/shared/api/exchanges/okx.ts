import type { SpotExchangeAdapter } from "@/src/shared/api/exchanges/types";

function normalizeSpotSymbol(symbol: string) {
  const clean = String(symbol ?? "").trim().toUpperCase();
  const normalized = clean.replace(/_/g, "-");
  if (normalized.endsWith("-USDT")) {
    return {
      baseAsset: normalized.slice(0, -5),
      quoteAsset: "USDT",
    };
  }
  if (clean.endsWith("USDT") && clean.length > 4) {
    return {
      baseAsset: clean.slice(0, -4),
      quoteAsset: "USDT",
    };
  }
  return null;
}

export const okxSpotAdapter: SpotExchangeAdapter = {
  exchange: "okx",
  enabled: false,
  supportsProductionUniverse: false,
  normalizeSpotSymbol,
  fetchSpotTickers: async () => [],
  fetchSpotCandles: async () => [],
};
