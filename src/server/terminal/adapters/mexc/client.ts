import { MEXC_BASE, fetchExchangeInfoCached, normalizeMexcSymbol } from "@/lib/mexc";
import { InFlight, TTLCache, createLimiter, fetchWithRetry } from "@/lib/server-cache";

type MexcExchangeInfoFilter = {
  filterType?: string;
  tickSize?: string;
  stepSize?: string;
  minQty?: string;
  minNotional?: string;
};

export type MexcExchangeInfoSymbol = {
  symbol?: string;
  status?: string;
  baseAsset?: string;
  quoteAsset?: string;
  filters?: MexcExchangeInfoFilter[];
};

type MexcDepthResponse = {
  bids?: Array<[string, string]>;
  asks?: Array<[string, string]>;
};

type MexcRecentTrade = {
  id?: string | number;
  price?: string;
  qty?: string;
  time?: number;
  isBuyerMaker?: boolean;
};

function makeHttpError(message: string, status: number) {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

const limit = createLimiter(6);
const infoCache = new TTLCache<MexcExchangeInfoSymbol | null>(60_000, 256);
const infoInFlight = new InFlight<MexcExchangeInfoSymbol | null>();
const depthCache = new TTLCache<MexcDepthResponse | null>(1_500, 256);
const depthInFlight = new InFlight<MexcDepthResponse | null>();
const tradesCache = new TTLCache<MexcRecentTrade[]>(1_500, 256);
const tradesInFlight = new InFlight<MexcRecentTrade[]>();

export async function fetchMexcExchangeInfoSymbol(symbol: string): Promise<MexcExchangeInfoSymbol | null> {
  const normalized = await normalizeMexcSymbol(symbol);
  if (!normalized) return null;

  const cacheKey = `mexc:terminal:exchangeInfo:${normalized}`;
  const cached = infoCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const inflight = infoInFlight.get(cacheKey);
  if (inflight) return inflight;

  const request = limit(async () => {
    const exchangeInfo = await fetchExchangeInfoCached();
    const exchangeInfoObject =
      typeof exchangeInfo === "object" && exchangeInfo !== null
        ? (exchangeInfo as { symbols?: unknown[] })
        : null;

    const symbolInfo = Array.isArray(exchangeInfoObject?.symbols)
      ? (((exchangeInfoObject.symbols as unknown[]).find((item) => {
          if (!item || typeof item !== "object") return false;
          const itemSymbol = String((item as { symbol?: unknown }).symbol ?? "")
            .trim()
            .toUpperCase();
          return itemSymbol === normalized;
        }) as MexcExchangeInfoSymbol | undefined) ?? null)
      : null;

    infoCache.set(cacheKey, symbolInfo, 60_000);
    return symbolInfo;
  });

  infoInFlight.set(cacheKey, request);
  return request;
}

export async function fetchMexcDepthSnapshot(symbol: string, limitN = 14): Promise<MexcDepthResponse | null> {
  const normalized = await normalizeMexcSymbol(symbol);
  if (!normalized) return null;

  const cacheKey = `mexc:terminal:depth:${normalized}:${limitN}`;
  const cached = depthCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const inflight = depthInFlight.get(cacheKey);
  if (inflight) return inflight;

  const request = limit(async () => {
    const url = `${MEXC_BASE}/api/v3/depth?symbol=${encodeURIComponent(normalized)}&limit=${limitN}`;
    const res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });

    if (res.status === 400 || res.status === 404) {
      depthCache.set(cacheKey, null, 3_000);
      return null;
    }

    if (!res.ok) {
      throw makeHttpError(`mexc depth failed ${res.status}`, res.status);
    }

    const json = (await res.json()) as MexcDepthResponse;
    depthCache.set(cacheKey, json, 1_500);
    return json;
  });

  depthInFlight.set(cacheKey, request);
  return request;
}

export async function fetchMexcRecentTrades(symbol: string, limitN = 14): Promise<MexcRecentTrade[]> {
  const normalized = await normalizeMexcSymbol(symbol);
  if (!normalized) return [];

  const cacheKey = `mexc:terminal:trades:${normalized}:${limitN}`;
  const cached = tradesCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const inflight = tradesInFlight.get(cacheKey);
  if (inflight) return inflight;

  const request = limit(async () => {
    const url = `${MEXC_BASE}/api/v3/trades?symbol=${encodeURIComponent(normalized)}&limit=${limitN}`;
    const res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });

    if (res.status === 400 || res.status === 404) {
      tradesCache.set(cacheKey, [], 3_000);
      return [];
    }

    if (!res.ok) {
      throw makeHttpError(`mexc recent trades failed ${res.status}`, res.status);
    }

    const json = await res.json();
    const trades = Array.isArray(json) ? (json as MexcRecentTrade[]) : [];
    tradesCache.set(cacheKey, trades, 1_500);
    return trades;
  });

  tradesInFlight.set(cacheKey, request);
  return request;
}
