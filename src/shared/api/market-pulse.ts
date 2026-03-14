import type { MarketPulseDto, BtcPulseDto } from "@/src/entities/market-pulse";

export async function fetchMarketPulseSnapshot(signal?: AbortSignal): Promise<MarketPulseDto> {
  const res = await fetch("/api/market-pulse", { cache: "no-store", signal });
  if (!res.ok) throw new Error(`market_pulse_http_${res.status}`);
  return (await res.json()) as MarketPulseDto;
}

export function marketPulseStreamUrl() {
  return "/api/stream/market-pulse";
}

export type MarketPulseStreamEvent =
  | { type: "snapshot"; data: MarketPulseDto }
  | { type: "btc"; data: BtcPulseDto }
  | { type: "ping"; data: { ts: number } };
