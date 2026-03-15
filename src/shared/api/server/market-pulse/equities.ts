import { TTLCache, InFlight } from "@/lib/server-cache";
import { MARKET_PULSE_RISK_ASSETS, MARKET_PULSE_TTL } from "@/src/shared/config/market-pulse";
import type { EquitiesPulseDto, EquityPulseItemDto } from "@/src/entities/market-pulse";
import { classifyEquitiesRisk, computeEquitiesBreadth } from "@/src/shared/lib/market-pulse/scoring";
import { clearResolvedTwelveDataSymbol, fetchTwelveDataDailySeries, rememberResolvedTwelveDataSymbol, resolveTwelveDataSymbolCandidates } from "./twelve-data";

const cache = new TTLCache<EquitiesPulseDto>(MARKET_PULSE_TTL.equitiesMs, 16);
const lastGoodCache = new TTLCache<EquitiesPulseDto>(MARKET_PULSE_TTL.equitiesLastGoodMs, 4);
const rowLastGoodCache = new TTLCache<EquityPulseItemDto>(MARKET_PULSE_TTL.equitiesLastGoodMs, 16);
const inflight = new InFlight<EquitiesPulseDto>();
const KEY = "equities-pulse:v1";
const LAST_GOOD_KEY = "equities-pulse:last-good:v1";
const DEBUG_MARKET_PULSE = process.env.DEBUG_MARKET_PULSE === "1";

type RiskAssetDef = (typeof MARKET_PULSE_RISK_ASSETS)[number];
type ErrorCode = EquitiesPulseDto["errorCode"];
type ResolvedItem = {
  item: EquityPulseItemDto;
  errorCode: ErrorCode | null;
  usedRowFallback?: boolean;
};

function debugEquities(message: string, payload?: unknown) {
  if (!DEBUG_MARKET_PULSE) return;
  if (payload === undefined) {
    console.warn(`[market-pulse/equities] ${message}`);
    return;
  }
  console.warn(`[market-pulse/equities] ${message}`, payload);
}

function emptyItem(asset: RiskAssetDef): EquityPulseItemDto {
  return {
    key: asset.key,
    name: asset.name,
    price: 0,
    changePct24h: 0,
    group: asset.group,
    isAvailable: false,
  };
}

function classifyErrorCodes(errorCodes: Array<ErrorCode | null>) {
  if (errorCodes.includes("invalid_api_key")) return "invalid_api_key";
  if (errorCodes.includes("rate_limited")) return "rate_limited";
  if (errorCodes.includes("unsupported_symbol")) return "unsupported_symbol";
  if (errorCodes.includes("upstream_error")) return "upstream_error";
  if (errorCodes.includes("provider_unavailable")) return "provider_unavailable";
  return "empty_provider_payload";
}

function getLastGoodSnapshot() {
  return lastGoodCache.get(LAST_GOOD_KEY);
}

function getRowLastGood(asset: RiskAssetDef) {
  return rowLastGoodCache.get(`equities-pulse:row:${asset.key}`);
}

function rememberRowLastGood(item: EquityPulseItemDto) {
  if (!item.isAvailable) return;
  rowLastGoodCache.set(`equities-pulse:row:${item.key}`, item, MARKET_PULSE_TTL.equitiesLastGoodMs);
}

function rememberLastGoodSnapshot(snapshot: EquitiesPulseDto) {
  if (!snapshot.isAvailable) return;
  lastGoodCache.set(LAST_GOOD_KEY, snapshot, MARKET_PULSE_TTL.equitiesLastGoodMs);
  debugEquities("stored last-good snapshot", {
    updatedAt: snapshot.updatedAt,
    availableItems: snapshot.items.filter((item) => item.isAvailable).length,
    totalItems: snapshot.items.length,
    isFallback: snapshot.isFallback,
  });
}

function serveLastGoodSnapshot(errorCode: ErrorCode) {
  const lastGood = getLastGoodSnapshot();
  if (!lastGood) {
    const fallback = fallbackEquitiesPulse(errorCode ?? "provider_unavailable");
    cache.set(KEY, fallback, MARKET_PULSE_TTL.equitiesMs);
    debugEquities("hard empty fallback cached; no usable last-good snapshot has ever been stored", {
      errorCode,
      cacheTtlMs: MARKET_PULSE_TTL.equitiesMs,
      hasLastGoodSnapshot: false,
    });
    return fallback;
  }

  const staleSnapshot: EquitiesPulseDto = {
    ...lastGood,
    isFallback: true,
    errorCode: errorCode ?? undefined,
  };
  cache.set(KEY, staleSnapshot, MARKET_PULSE_TTL.equitiesMs);
  debugEquities(
    errorCode === "rate_limited" ? "rate-limited but serving last-good snapshot" : "provider failed; serving last-good snapshot",
    {
      errorCode,
      updatedAt: lastGood.updatedAt,
      availableItems: lastGood.items.filter((item) => item.isAvailable).length,
      totalItems: lastGood.items.length,
    },
  );
  return staleSnapshot;
}

function resolveItemFromBars(asset: RiskAssetDef, latestClose: number | null, previousClose: number | null): ResolvedItem {
  const changePct24h = latestClose != null && previousClose != null && previousClose !== 0
    ? ((latestClose - previousClose) / previousClose) * 100
    : null;

  const item: EquityPulseItemDto = {
    key: asset.key,
    name: asset.name,
    price: latestClose ?? 0,
    changePct24h: changePct24h ?? 0,
    group: asset.group,
    isAvailable: latestClose != null && changePct24h != null,
  };

  return {
    item,
    errorCode: item.isAvailable ? null : "empty_provider_payload",
  };
}

async function resolveRiskAssetItem(apiKey: string, asset: RiskAssetDef): Promise<ResolvedItem> {
  const attemptCandidates = async (
    candidates: Awaited<ReturnType<typeof resolveTwelveDataSymbolCandidates>>["candidates"],
  ): Promise<ResolvedItem | null> => {
    const attempts: Array<{
      symbol: string;
      resolvedVia: string;
      endpoint: string;
      responseState: "ok" | "empty" | "partial" | "invalid";
      failureReason: string | null;
      latestClose: number | null;
      previousClose: number | null;
    }> = [];

    for (const candidate of candidates) {
      const series = await fetchTwelveDataDailySeries(apiKey, candidate.symbol);
      const latestClose = series.points[0]?.close ?? null;
      const previousClose = series.points[1]?.close ?? null;
      const result = resolveItemFromBars(asset, latestClose, previousClose);

      attempts.push({
        symbol: candidate.symbol,
        resolvedVia: candidate.resolvedVia,
        endpoint: "time_series",
        responseState: result.item.isAvailable ? "ok" : series.points.length === 0 ? "empty" : series.points.length === 1 ? "partial" : "invalid",
        failureReason: result.item.isAvailable ? null : series.errorCode ?? (latestClose == null ? "missing_latest_close" : previousClose == null ? "missing_previous_close" : "invalid_change"),
        latestClose,
        previousClose,
      });

      debugEquities("instrument time_series attempt", {
        key: asset.key,
        candidateNames: asset.twelveDataSearch,
        candidateSymbolsTried: candidates.map((entry) => entry.symbol),
        endpoint: "time_series",
        resolvedSymbol: candidate.symbol,
        symbolResolutionSource: candidate.resolvedVia,
        rawResponseSnippet: series.rawSnippet,
        latestClose,
        previousClose,
        computedChangePct24h: result.item.isAvailable ? result.item.changePct24h : null,
        failureReason: result.item.isAvailable ? null : series.errorCode ?? (latestClose == null ? "missing_latest_close" : previousClose == null ? "missing_previous_close" : "invalid_change"),
      });

      if (result.item.isAvailable) {
        rememberResolvedTwelveDataSymbol(asset, candidate);
        rememberRowLastGood(result.item);
        return result;
      }
    }

    const finalAttempt = attempts[attempts.length - 1] ?? null;
    debugEquities("instrument time_series exhausted", {
      key: asset.key,
      candidateNames: asset.twelveDataSearch,
      candidateSymbolsTried: attempts.map((attempt) => attempt.symbol),
      endpoint: "time_series",
      resolvedSymbol: finalAttempt?.symbol ?? null,
      symbolResolutionSource: finalAttempt?.resolvedVia ?? "none",
      rawResponseSnippet: null,
      latestClose: finalAttempt?.latestClose ?? null,
      previousClose: finalAttempt?.previousClose ?? null,
      computedChangePct24h: null,
      failureReason: finalAttempt?.failureReason ?? "time_series_unresolved",
      attempts,
    });

    return {
      item: emptyItem(asset),
      errorCode: (finalAttempt?.failureReason as ErrorCode | null) ?? "empty_provider_payload",
    };
  };

  const resolved = await resolveTwelveDataSymbolCandidates(apiKey, asset, debugEquities, { includeSearch: false });
  if (!resolved.candidates.length) {
    const rowLastGood = getRowLastGood(asset);
    debugEquities("instrument unresolved", {
      key: asset.key,
      candidateNames: asset.twelveDataSearch,
      candidateSymbolsTried: asset.twelveDataSymbols,
      endpoint: "symbol_search",
      resolvedSymbol: null,
      symbolResolutionSource: "none",
      latestClose: null,
      previousClose: null,
      computedChangePct24h: null,
      failureReason: resolved.errorCode ?? "symbol_unresolved",
      rowLastGoodAvailable: Boolean(rowLastGood),
    });
    if (rowLastGood) {
      debugEquities("instrument serving row-level last-good after unresolved symbol", {
        key: asset.key,
        resolvedSymbol: null,
        latestClose: rowLastGood.price,
        previousClose: null,
        computedChangePct24h: rowLastGood.changePct24h,
        failureReason: resolved.errorCode ?? "symbol_unresolved",
      });
      return {
        item: rowLastGood,
        errorCode: null,
        usedRowFallback: true,
      };
    }
    return {
      item: emptyItem(asset),
      errorCode: resolved.errorCode ?? "empty_provider_payload",
    };
  }

  const firstPass = await attemptCandidates(resolved.candidates);
  if (firstPass?.item.isAvailable) {
    return firstPass;
  }

  if (resolved.candidates.some((candidate) => candidate.resolvedVia === "cache")) {
    clearResolvedTwelveDataSymbol(asset);
    debugEquities("cached symbol failed; retrying fresh search", {
      key: asset.key,
      candidateSymbolsTried: resolved.candidates.map((candidate) => candidate.symbol),
    });
    const refreshed = await resolveTwelveDataSymbolCandidates(apiKey, asset, debugEquities, { skipCache: true });
    const freshOnly = refreshed.candidates.filter(
      (candidate) => !resolved.candidates.some((prior) => prior.symbol === candidate.symbol),
    );
    if (freshOnly.length) {
      const secondPass = await attemptCandidates(freshOnly);
      if (secondPass?.item.isAvailable) {
        return secondPass;
      }
      if (secondPass?.usedRowFallback) {
        return secondPass;
      }
    }
  }

  const searched = await resolveTwelveDataSymbolCandidates(apiKey, asset, debugEquities, {
    skipCache: true,
    includeSearch: true,
  });
  const searchedOnly = searched.candidates.filter(
    (candidate) => !resolved.candidates.some((prior) => prior.symbol === candidate.symbol),
  );
  if (searchedOnly.length) {
    debugEquities("instrument escalating to symbol_search candidates", {
      key: asset.key,
      candidateSymbolsTried: searchedOnly.map((candidate) => candidate.symbol),
    });
    const searchedPass = await attemptCandidates(searchedOnly);
    if (searchedPass?.item.isAvailable) {
      return searchedPass;
    }
    if (searchedPass?.usedRowFallback) {
      return searchedPass;
    }
  }

  const rowLastGood = getRowLastGood(asset);
  if (rowLastGood) {
    debugEquities("instrument serving row-level last-good after refresh failure", {
      key: asset.key,
      resolvedSymbol: null,
      latestClose: rowLastGood.price,
      previousClose: null,
      computedChangePct24h: rowLastGood.changePct24h,
      failureReason: firstPass?.errorCode ?? resolved.errorCode ?? "refresh_failed",
    });
    return {
      item: rowLastGood,
      errorCode: null,
      usedRowFallback: true,
    };
  }

  return firstPass ?? {
    item: emptyItem(asset),
    errorCode: resolved.errorCode ?? "empty_provider_payload",
  };
}

export function fallbackEquitiesPulse(errorCode = "provider_unavailable"): EquitiesPulseDto {
  return {
    label: "mixed",
    breadth: 0,
    items: MARKET_PULSE_RISK_ASSETS.map((asset) => emptyItem(asset)),
    updatedAt: Date.now(),
    source: "twelve-data",
    isAvailable: false,
    isFallback: true,
    errorCode,
  };
}

export async function getEquitiesPulseSnapshot(): Promise<EquitiesPulseDto> {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) return fallbackEquitiesPulse("missing_api_key");

  const cached = cache.get(KEY);
  if (cached) {
    debugEquities("cache hit", {
      updatedAt: cached.updatedAt,
      isAvailable: cached.isAvailable,
      isFallback: cached.isFallback,
      errorCode: cached.errorCode ?? null,
      availableItems: cached.items.filter((item) => item.isAvailable).length,
      totalItems: cached.items.length,
    });
    return cached;
  }
  const current = inflight.get(KEY);
  if (current) {
    debugEquities("inflight hit", {
      key: KEY,
      hasLastGoodSnapshot: Boolean(getLastGoodSnapshot()),
    });
    return current;
  }

  const task = (async () => {
    debugEquities("snapshot refresh start", {
      cacheTtlMs: MARKET_PULSE_TTL.equitiesMs,
      hasLastGoodSnapshot: Boolean(getLastGoodSnapshot()),
    });
    const resolvedItems = await Promise.all(MARKET_PULSE_RISK_ASSETS.map((asset) => resolveRiskAssetItem(apiKey, asset)));
    const items = resolvedItems.map((result) => result.item);
    const availableItems = items.filter((item) => item.isAvailable);

    if (!availableItems.length) {
      debugEquities("snapshot refresh produced no usable rows", {
        errorCode: classifyErrorCodes(resolvedItems.map((result) => result.errorCode)),
        hasLastGoodSnapshot: Boolean(getLastGoodSnapshot()),
      });
      return serveLastGoodSnapshot(classifyErrorCodes(resolvedItems.map((result) => result.errorCode)));
    }

    const dto: EquitiesPulseDto = {
      label: classifyEquitiesRisk(availableItems),
      breadth: computeEquitiesBreadth(availableItems),
      items,
      updatedAt: Date.now(),
      source: "twelve-data",
      isAvailable: true,
      isFallback: availableItems.length !== items.length || resolvedItems.some((result) => result.usedRowFallback),
    };

    cache.set(KEY, dto, MARKET_PULSE_TTL.equitiesMs);
    rememberLastGoodSnapshot(dto);
    debugEquities("fresh success", {
      availableItems: availableItems.length,
      totalItems: items.length,
      isFallback: dto.isFallback,
    });
    return dto;
  })();

  inflight.set(KEY, task);
  return task;
}
