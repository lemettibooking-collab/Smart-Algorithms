import { TTLCache, InFlight, fetchWithRetry } from "@/lib/server-cache";
import { MARKET_PULSE_TTL } from "@/src/shared/config/market-pulse";
import type { FearGreedDto } from "@/src/entities/market-pulse";

const cache = new TTLCache<FearGreedDto>(MARKET_PULSE_TTL.fearGreedMs, 16);
const inflight = new InFlight<FearGreedDto>();
const KEY = "fear-greed:v1";

function normalizeLabel(value: string): FearGreedDto["label"] {
  const label = String(value).trim().toLowerCase().replace(/\s+/g, "-");
  if (label === "extreme-fear" || label === "fear" || label === "neutral" || label === "greed" || label === "extreme-greed") {
    return label;
  }
  return "neutral";
}

export function fallbackFearGreed(): FearGreedDto {
  return {
    value: 50,
    label: "neutral",
    updatedAt: Date.now(),
    nextUpdateInSec: 0,
    source: "alternative.me",
  };
}

export async function getFearGreedSnapshot(): Promise<FearGreedDto> {
  const cached = cache.get(KEY);
  if (cached) return cached;
  const current = inflight.get(KEY);
  if (current) return current;

  const task = (async () => {
    const res = await fetchWithRetry("https://api.alternative.me/fng/?limit=1", { cache: "no-store" }, { retries: 1 });
    if (!res.ok) throw new Error(`fear_greed_http_${res.status}`);
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const item = Array.isArray(json.data) ? json.data[0] : null;
    if (!item) throw new Error("fear_greed_empty");

    const value = Math.max(0, Math.min(100, Number(item.value ?? 50)));
    const updatedAt = Number(item.timestamp ?? Date.now()) * 1000 || Date.now();
    const dto: FearGreedDto = {
      value,
      label: normalizeLabel(String(item.value_classification ?? "neutral")),
      updatedAt,
      nextUpdateInSec: Number(item.time_until_update ?? 0) || 0,
      source: "alternative.me",
    };
    cache.set(KEY, dto, MARKET_PULSE_TTL.fearGreedMs);
    return dto;
  })();

  inflight.set(KEY, task);
  return task;
}
