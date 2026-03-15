import { cacheGet, cacheSet } from "@/lib/repos/cacheRepo";
import { InFlight, TTLCache } from "@/lib/server-cache";
import type { AltBreadthDto } from "@/src/entities/market-pulse";
import { computeAltBreadthSnapshot, fallbackAltBreadth, type AltBreadthInput } from "@/src/entities/market-pulse/lib/alt-breadth-score";
import { MARKET_PULSE_TTL } from "@/src/shared/config/market-pulse";
import { getAltMarketMoodInputs } from "@/src/shared/lib/market-universe";

const cache = new TTLCache<AltBreadthDto>(MARKET_PULSE_TTL.altBreadthMs, 8);
const inflight = new InFlight<AltBreadthDto>();
const KEY = "market-pulse:alt-breadth:v1";
const PREV_SCORE_KEY = "market-pulse:alt-breadth:prev-score:v1";

function addAge(dto: AltBreadthDto): AltBreadthDto {
  return {
    ...dto,
    ageSec: Math.max(0, Math.round((Date.now() - dto.updatedAt) / 1000)),
  };
}

export function fallbackAltBreadthPulse(errorCode = "provider_unavailable") {
  return addAge(fallbackAltBreadth(errorCode));
}

export async function getAltBreadthSnapshot(): Promise<AltBreadthDto> {
  const cached = cache.get(KEY);
  if (cached) return addAge(cached);

  const pending = inflight.get(KEY);
  if (pending) return pending.then(addAge);

  const task = (async () => {
    try {
      const inputs = await getAltMarketMoodInputs();
      const eligibleRows = inputs.eligibleAltMembers;
      const includedRows = inputs.liquidAltMembers;
      if (!eligibleRows.length) {
        const dto = fallbackAltBreadth("empty_provider_payload");
        cache.set(KEY, dto, MARKET_PULSE_TTL.altBreadthMs);
        return dto;
      }

      const prevScore = cacheGet<number>(PREV_SCORE_KEY);
      const dto = computeAltBreadthSnapshot({
        rows: includedRows.map(
          (member) =>
            ({
              baseAsset: member.baseAsset,
              exchange: member.selectedExchange as "binance" | "mexc",
              return24hPct: member.selectedTicker.changePct24h,
              quoteVolumeUsd: member.selectedTicker.quoteVolumeUsd,
              marketCap: member.marketCapUsd ?? 0,
            }) satisfies AltBreadthInput,
        ),
        eligibleCount: eligibleRows.length,
        exchangeMix: {
          binance: inputs.exchangeMix.binance,
          mexc: inputs.exchangeMix.mexc,
        },
        prevScore: typeof prevScore === "number" && Number.isFinite(prevScore) ? prevScore : null,
      });

      cache.set(KEY, dto, MARKET_PULSE_TTL.altBreadthMs);
      cacheSet(PREV_SCORE_KEY, dto.score, MARKET_PULSE_TTL.altBreadthPrevMs);
      return dto;
    } catch (error) {
      console.warn("[market-pulse] alt-breadth failed", error);
      const fallback = fallbackAltBreadth("upstream_error");
      cache.set(KEY, fallback, MARKET_PULSE_TTL.altBreadthMs);
      return fallback;
    }
  })();

  inflight.set(KEY, task);
  return task.then(addAge);
}
