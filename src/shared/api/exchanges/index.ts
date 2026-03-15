import { binanceSpotAdapter } from "@/src/shared/api/exchanges/binance";
import { bybitSpotAdapter } from "@/src/shared/api/exchanges/bybit";
import { mexcSpotAdapter } from "@/src/shared/api/exchanges/mexc";
import { okxSpotAdapter } from "@/src/shared/api/exchanges/okx";
import type { SpotExchangeAdapter } from "@/src/shared/api/exchanges/types";
import type { ExchangeId } from "@/src/shared/lib/market-universe-types";

export const SPOT_EXCHANGE_ADAPTERS: Record<ExchangeId, SpotExchangeAdapter> = {
  binance: binanceSpotAdapter,
  mexc: mexcSpotAdapter,
  okx: okxSpotAdapter,
  bybit: bybitSpotAdapter,
  kucoin: {
    exchange: "kucoin",
    enabled: false,
    supportsProductionUniverse: false,
    normalizeSpotSymbol: () => null,
    fetchSpotTickers: async () => [],
    fetchSpotCandles: async () => [],
  },
  gate: {
    exchange: "gate",
    enabled: false,
    supportsProductionUniverse: false,
    normalizeSpotSymbol: () => null,
    fetchSpotTickers: async () => [],
    fetchSpotCandles: async () => [],
  },
};

export function getSpotExchangeAdapter(exchange: ExchangeId) {
  return SPOT_EXCHANGE_ADAPTERS[exchange];
}

export function listSpotExchangeAdapters() {
  return Object.values(SPOT_EXCHANGE_ADAPTERS);
}
