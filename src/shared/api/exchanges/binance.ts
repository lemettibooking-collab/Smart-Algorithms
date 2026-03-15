import { fetch24hTicker, fetchKlinesCached } from "@/lib/binance";
import type { SpotExchangeAdapter } from "@/src/shared/api/exchanges/types";

function normalizeSpotSymbol(symbol: string) {
  const compact = String(symbol ?? "").trim().toUpperCase().replace(/[_-]/g, "");
  if (!compact.endsWith("USDT") || compact.length <= 4) return null;
  return {
    baseAsset: compact.slice(0, -4),
    quoteAsset: "USDT",
  };
}

export const binanceSpotAdapter: SpotExchangeAdapter = {
  exchange: "binance",
  enabled: true,
  supportsProductionUniverse: true,
  normalizeSpotSymbol,
  fetchSpotTickers: () => fetch24hTicker(),
  fetchSpotCandles: (symbol, interval, limit) => fetchKlinesCached(symbol, interval, limit),
};
