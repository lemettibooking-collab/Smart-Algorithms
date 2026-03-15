import type { ExchangeId, NormalizedCandle } from "@/src/shared/lib/market-universe-types";

export type ParsedSpotSymbol = {
  baseAsset: string;
  quoteAsset: string;
};

export type SpotExchangeAdapter = {
  exchange: ExchangeId;
  enabled: boolean;
  supportsProductionUniverse: boolean;
  normalizeSpotSymbol(symbol: string): ParsedSpotSymbol | null;
  fetchSpotTickers(): Promise<unknown[]>;
  fetchSpotCandles(symbol: string, interval: string, limit: number): Promise<NormalizedCandle[]>;
};
