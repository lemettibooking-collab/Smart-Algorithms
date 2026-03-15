import { InFlight, TTLCache, fetchWithRetry } from "@/lib/server-cache";
import { MARKET_PULSE_RISK_ASSETS } from "@/src/shared/config/market-pulse";

type RiskAssetDef = (typeof MARKET_PULSE_RISK_ASSETS)[number];

type TwelveDataErrorCode =
  | "rate_limited"
  | "invalid_api_key"
  | "unsupported_symbol"
  | "upstream_error"
  | "provider_unavailable"
  | "empty_provider_payload";

type SymbolSearchCandidate = {
  symbol: string;
  instrument_name?: string;
  exchange?: string;
  mic_code?: string;
  country?: string;
  type?: string;
  currency?: string;
  is_enabled?: boolean | string;
};

export type ResolvedTwelveDataSymbol = {
  symbol: string;
  instrumentName: string | null;
  exchange: string | null;
  type: string | null;
  resolvedVia: "cache" | "config" | "alias" | "search";
};

export type TwelveDataDailyPoint = {
  close: number;
  datetime: string | null;
};

const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const symbolCache = new TTLCache<ResolvedTwelveDataSymbol>(7 * 24 * 60 * 60 * 1000, 32);
const symbolInflight = new InFlight<{ candidates: ResolvedTwelveDataSymbol[]; errorCode: TwelveDataErrorCode | null }>();

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeSymbol(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function makeResolvedSymbol(
  symbol: string,
  resolvedVia: ResolvedTwelveDataSymbol["resolvedVia"],
  meta?: Partial<Omit<ResolvedTwelveDataSymbol, "symbol" | "resolvedVia">>,
): ResolvedTwelveDataSymbol {
  return {
    symbol,
    instrumentName: meta?.instrumentName ?? null,
    exchange: meta?.exchange ?? null,
    type: meta?.type ?? null,
    resolvedVia,
  };
}

function responseTextSnippet(res: Response) {
  return res.clone().text().then((text) => text.slice(0, 600)).catch(() => "");
}

function classifyBodyError(status: number, body: string): TwelveDataErrorCode {
  const text = body.toLowerCase();
  if (status === 429 || text.includes("rate limit") || text.includes("too many requests") || text.includes("credits")) return "rate_limited";
  if (status === 401 || status === 403 || text.includes("invalid api") || text.includes("api key") || text.includes("unauthorized")) return "invalid_api_key";
  if (status === 404 || text.includes("symbol not found") || text.includes("invalid symbol")) return "unsupported_symbol";
  if (status >= 500) return "upstream_error";
  return "provider_unavailable";
}

function parseEmbeddedProviderError(payload: unknown): TwelveDataErrorCode | null {
  const obj = asObject(payload);
  if (!obj) return null;
  const status = String(obj.status ?? "").toLowerCase();
  const message = String(obj.message ?? "");
  const code = Number(obj.code);
  if (status !== "error" && !Number.isFinite(code)) return null;
  return classifyBodyError(Number.isFinite(code) ? code : 200, message);
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

function parseSearchResults(payload: unknown): SymbolSearchCandidate[] {
  if (Array.isArray(payload)) {
    return payload
      .map((row) => asObject(row))
      .filter((row): row is Record<string, unknown> => !!row)
      .map((row) => ({
        symbol: String(row.symbol ?? ""),
        instrument_name: typeof row.instrument_name === "string" ? row.instrument_name : typeof row.name === "string" ? row.name : undefined,
        exchange: typeof row.exchange === "string" ? row.exchange : undefined,
        mic_code: typeof row.mic_code === "string" ? row.mic_code : undefined,
        country: typeof row.country === "string" ? row.country : undefined,
        type: typeof row.instrument_type === "string" ? row.instrument_type : typeof row.type === "string" ? row.type : undefined,
        currency: typeof row.currency === "string" ? row.currency : undefined,
        is_enabled: typeof row.is_enabled === "boolean" || typeof row.is_enabled === "string" ? row.is_enabled : undefined,
      }))
      .filter((row) => Boolean(row.symbol));
  }

  const obj = asObject(payload);
  if (!obj) return [];
  if (Array.isArray(obj.data)) return parseSearchResults(obj.data);
  return [];
}

function parseTimeSeries(payload: unknown): TwelveDataDailyPoint[] {
  const obj = asObject(payload);
  const values = Array.isArray(obj?.values) ? obj.values : [];
  return values
    .map((row) => asObject(row))
    .filter((row): row is Record<string, unknown> => !!row)
    .map((row) => ({
      datetime: typeof row.datetime === "string" ? row.datetime : null,
      close: Number(row.close),
    }))
    .filter((row) => Number.isFinite(row.close))
    .sort((a, b) => {
      if (!a.datetime || !b.datetime) return 0;
      return a.datetime < b.datetime ? 1 : a.datetime > b.datetime ? -1 : 0;
    });
}

function rankCandidate(asset: RiskAssetDef, candidate: SymbolSearchCandidate, query: string) {
  const normalizedCandidateSymbol = normalizeSymbol(candidate.symbol);
  const aliasSet = new Set(asset.twelveDataSymbols.map((symbol) => normalizeSymbol(symbol)));
  const queryTokens = tokenize(query);
  const nameTokens = tokenize(candidate.instrument_name ?? "");
  const type = (candidate.type ?? "").toLowerCase();
  const exchange = (candidate.exchange ?? "").toLowerCase();
  const country = (candidate.country ?? "").toLowerCase();
  const currency = (candidate.currency ?? "").toLowerCase();

  let score = 0;
  if (aliasSet.has(normalizedCandidateSymbol)) score += 120;
  if (candidate.is_enabled === true || candidate.is_enabled === "true") score += 20;
  if (asset.group === "equities") {
    if (type.includes("index")) score += 60;
    if (country.includes("united states") || country === "usa") score += 15;
    if (exchange.includes("index") || exchange.includes("indices")) score += 12;
  } else {
    if (type.includes("commodity")) score += 60;
    if (type.includes("forex")) score += 20;
    if (currency.includes("usd")) score += 12;
  }

  const tokenMatches = queryTokens.filter((token) => nameTokens.includes(token)).length;
  score += tokenMatches * 8;

  if (normalizeSymbol(candidate.instrument_name).includes(normalizeSymbol(query))) score += 20;
  if (normalizedCandidateSymbol.includes(normalizeSymbol(query))) score += 15;

  return score;
}

async function fetchSymbolSearch(apiKey: string, query: string) {
  const url = new URL(`${TWELVE_DATA_BASE_URL}/symbol_search`);
  url.searchParams.set("symbol", query);
  url.searchParams.set("outputsize", "20");
  url.searchParams.set("apikey", apiKey);
  const res = await fetchWithRetry(url.toString(), { cache: "no-store" }, { retries: 1 });
  const body = await responseTextSnippet(res);
  if (!res.ok) {
    return {
      candidates: [] as SymbolSearchCandidate[],
      errorCode: classifyBodyError(res.status, body),
      rawSnippet: body,
    };
  }

  const json = (await res.json().catch(() => null)) as unknown;
  const embeddedError = parseEmbeddedProviderError(json);
  if (embeddedError) {
    return {
      candidates: [] as SymbolSearchCandidate[],
      errorCode: embeddedError,
      rawSnippet: JSON.stringify(json).slice(0, 600),
    };
  }
  return {
    candidates: parseSearchResults(json),
    errorCode: null as TwelveDataErrorCode | null,
    rawSnippet: JSON.stringify(json).slice(0, 600),
  };
}

export function rememberResolvedTwelveDataSymbol(asset: RiskAssetDef, resolved: ResolvedTwelveDataSymbol) {
  const cacheKey = `twelve-data-symbol:${asset.key}`;
  symbolCache.set(cacheKey, resolved);
}

export function clearResolvedTwelveDataSymbol(asset: RiskAssetDef) {
  const cacheKey = `twelve-data-symbol:${asset.key}`;
  symbolCache.delete(cacheKey);
}

export async function resolveTwelveDataSymbolCandidates(
  apiKey: string,
  asset: RiskAssetDef,
  logger?: (message: string, payload?: unknown) => void,
  options?: {
    skipCache?: boolean;
    includeSearch?: boolean;
  },
): Promise<{ candidates: ResolvedTwelveDataSymbol[]; errorCode: TwelveDataErrorCode | null }> {
  const preferredSymbol = "twelveDataResolvedSymbol" in asset && typeof asset.twelveDataResolvedSymbol === "string"
    ? asset.twelveDataResolvedSymbol.trim()
    : "";
  const cacheKey = `twelve-data-symbol:${asset.key}`;
  const staticCandidates = [
    ...(preferredSymbol ? [makeResolvedSymbol(preferredSymbol, "config")] : []),
    ...asset.twelveDataSymbols.map((symbol) => makeResolvedSymbol(symbol, "alias")),
  ];
  const cached = options?.skipCache ? null : symbolCache.get(cacheKey);
  if (cached) {
    const deduped = new Map<string, ResolvedTwelveDataSymbol>();
    for (const candidate of [{ ...cached, resolvedVia: "cache" as const }, ...staticCandidates]) {
      const key = normalizeSymbol(candidate.symbol);
      if (!key || deduped.has(key)) continue;
      deduped.set(key, candidate);
    }
    logger?.("symbol resolved from cache", {
      key: asset.key,
      candidateNames: asset.twelveDataSearch,
      resolvedSymbol: cached.symbol,
      exchange: cached.exchange,
      type: cached.type,
    });
    return { candidates: [...deduped.values()], errorCode: null };
  }

  const pending = options?.skipCache ? null : symbolInflight.get(cacheKey);
  if (pending) {
    return pending;
  }

  const task = (async () => {
    const deduped = new Map<string, ResolvedTwelveDataSymbol>();
    const addCandidate = (candidate: ResolvedTwelveDataSymbol) => {
      const key = normalizeSymbol(candidate.symbol);
      if (!key || deduped.has(key)) return;
      deduped.set(key, candidate);
    };

    for (const candidate of staticCandidates) {
      addCandidate(candidate);
    }

    let best: { candidate: SymbolSearchCandidate; score: number; query: string } | null = null;
    let firstError: TwelveDataErrorCode | null = null;
    const rankedMatches: Array<{ candidate: SymbolSearchCandidate; score: number }> = [];

    for (const query of asset.twelveDataSearch) {
      const search = await fetchSymbolSearch(apiKey, query);
      logger?.("symbol search response", {
        key: asset.key,
        endpoint: "symbol_search",
        query,
        candidateSymbolsTried: asset.twelveDataSymbols,
        responseCount: search.candidates.length,
        rawResponseSnippet: search.rawSnippet,
        failureReason: search.errorCode,
      });
      if (options?.includeSearch === false) {
        continue;
      }
      if (search.errorCode) {
        firstError ??= search.errorCode;
        if (search.errorCode === "rate_limited" || search.errorCode === "invalid_api_key") break;
        continue;
      }

      for (const candidate of search.candidates) {
        const score = rankCandidate(asset, candidate, query);
        rankedMatches.push({ candidate, score });
        if (!best || score > best.score) {
          best = { candidate, score, query };
        }
      }
    }

    for (const match of rankedMatches.sort((a, b) => b.score - a.score)) {
      addCandidate(makeResolvedSymbol(match.candidate.symbol, "search", {
        instrumentName: match.candidate.instrument_name ?? null,
        exchange: match.candidate.exchange ?? null,
        type: match.candidate.type ?? null,
      }));
    }

    const candidates = [...deduped.values()];
    if (best) {
      logger?.("symbol candidates prepared", {
        key: asset.key,
        candidateNames: asset.twelveDataSearch,
        resolvedSymbol: best.candidate.symbol,
        exchange: best.candidate.exchange ?? null,
        type: best.candidate.type ?? null,
        chosenQuery: best.query,
        score: best.score,
        orderedCandidates: candidates.map((candidate) => ({
          symbol: candidate.symbol,
          resolvedVia: candidate.resolvedVia,
          exchange: candidate.exchange,
          type: candidate.type,
        })),
      });
    }

    return {
      candidates,
      errorCode: candidates.length ? null : (firstError ?? "empty_provider_payload"),
    };
  })();

  if (!options?.skipCache) {
    symbolInflight.set(cacheKey, task);
  }
  return task;
}

export async function fetchTwelveDataDailySeries(
  apiKey: string,
  symbol: string,
): Promise<{ points: TwelveDataDailyPoint[]; errorCode: TwelveDataErrorCode | null; rawSnippet: string }> {
  const url = new URL(`${TWELVE_DATA_BASE_URL}/time_series`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "1day");
  url.searchParams.set("outputsize", "2");
  url.searchParams.set("apikey", apiKey);
  const res = await fetchWithRetry(url.toString(), { cache: "no-store" }, { retries: 1 });
  const body = await responseTextSnippet(res);
  if (!res.ok) {
    return {
      points: [],
      errorCode: classifyBodyError(res.status, body),
      rawSnippet: body,
    };
  }

  const json = (await res.json().catch(() => null)) as unknown;
  const embeddedError = parseEmbeddedProviderError(json);
  if (embeddedError) {
    return {
      points: [],
      errorCode: embeddedError,
      rawSnippet: JSON.stringify(json).slice(0, 600),
    };
  }
  const points = parseTimeSeries(json);
  return {
    points,
    errorCode: points.length >= 2 ? null : "empty_provider_payload",
    rawSnippet: JSON.stringify(json).slice(0, 600),
  };
}
