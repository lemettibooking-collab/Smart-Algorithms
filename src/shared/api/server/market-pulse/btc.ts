import { TTLCache, InFlight, fetchWithRetry } from "@/lib/server-cache";
import { MARKET_PULSE_TTL } from "@/src/shared/config/market-pulse";
import type { BtcPulseDto } from "@/src/entities/market-pulse";
import { classifyDirection } from "@/src/shared/lib/market-pulse/scoring";

const cache = new TTLCache<BtcPulseDto>(MARKET_PULSE_TTL.btcSnapshotMs, 16);
const inflight = new InFlight<BtcPulseDto>();
const KEY = "btc-pulse:v1";

export function fallbackBtcPulse(): BtcPulseDto {
  return {
    price: 0,
    change24hPct: 0,
    direction: "flat",
    updatedAt: Date.now(),
    source: "binance",
  };
}

export async function getBtcPulseSnapshot(): Promise<BtcPulseDto> {
  const cached = cache.get(KEY);
  if (cached) return cached;
  const current = inflight.get(KEY);
  if (current) return current;

  const task = (async () => {
    const res = await fetchWithRetry("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT", { cache: "no-store" }, { retries: 1 });
    if (!res.ok) throw new Error(`btc_http_${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;
    const price = Number(json.lastPrice ?? 0);
    const change24hPct = Number(json.priceChangePercent ?? 0);
    const dto: BtcPulseDto = {
      price: Number.isFinite(price) ? price : 0,
      change24hPct: Number.isFinite(change24hPct) ? change24hPct : 0,
      direction: classifyDirection(change24hPct),
      updatedAt: Date.now(),
      source: "binance",
    };
    cache.set(KEY, dto, MARKET_PULSE_TTL.btcSnapshotMs);
    return dto;
  })();

  inflight.set(KEY, task);
  return task;
}
