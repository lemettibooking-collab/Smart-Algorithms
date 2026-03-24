import { BINANCE_BASE } from "@/lib/binance";
import { InFlight, TTLCache, createLimiter, fetchWithRetry } from "@/lib/server-cache";

type BinanceExchangeInfoFilter = {
  filterType?: string;
  tickSize?: string;
  stepSize?: string;
  minQty?: string;
  minNotional?: string;
};

export type BinanceExchangeInfoSymbol = {
  symbol?: string;
  status?: string;
  baseAsset?: string;
  quoteAsset?: string;
  filters?: BinanceExchangeInfoFilter[];
};

type BinanceExchangeInfoResponse = {
  symbols?: BinanceExchangeInfoSymbol[];
};

type BinanceDepthResponse = {
  bids?: Array<[string, string]>;
  asks?: Array<[string, string]>;
};

type BinanceRecentTrade = {
  id?: number;
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

const infoCache = new TTLCache<BinanceExchangeInfoSymbol | null>(60_000, 256);
const infoInFlight = new InFlight<BinanceExchangeInfoSymbol | null>();
const limit = createLimiter(6);
const depthCache = new TTLCache<BinanceDepthResponse | null>(1_500, 256);
const depthInFlight = new InFlight<BinanceDepthResponse | null>();
const tradesCache = new TTLCache<BinanceRecentTrade[]>(1_500, 256);
const tradesInFlight = new InFlight<BinanceRecentTrade[]>();

export async function fetchBinanceExchangeInfoSymbol(symbol: string): Promise<BinanceExchangeInfoSymbol | null> {
  const normalized = String(symbol ?? "").trim().toUpperCase();
  if (!normalized) return null;

  const cacheKey = `binance:terminal:exchangeInfo:${normalized}`;
  const cached = infoCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const inflight = infoInFlight.get(cacheKey);
  if (inflight) return inflight;

  const request = limit(async () => {
    const url = `${BINANCE_BASE}/api/v3/exchangeInfo?symbol=${encodeURIComponent(normalized)}`;
    const res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });

    if (res.status === 400 || res.status === 404) {
      infoCache.set(cacheKey, null, 15_000);
      return null;
    }

    if (!res.ok) {
      throw makeHttpError(`binance exchangeInfo failed ${res.status}`, res.status);
    }

    const json = (await res.json()) as BinanceExchangeInfoResponse;
    const symbolInfo = Array.isArray(json.symbols) ? json.symbols[0] ?? null : null;
    infoCache.set(cacheKey, symbolInfo, 60_000);
    return symbolInfo;
  });

  infoInFlight.set(cacheKey, request);
  return request;
}

export async function fetchBinanceDepthSnapshot(symbol: string, limitN = 14): Promise<BinanceDepthResponse | null> {
  const normalized = String(symbol ?? "").trim().toUpperCase();
  if (!normalized) return null;

  const cacheKey = `binance:terminal:depth:${normalized}:${limitN}`;
  const cached = depthCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const inflight = depthInFlight.get(cacheKey);
  if (inflight) return inflight;

  const request = limit(async () => {
    const url = `${BINANCE_BASE}/api/v3/depth?symbol=${encodeURIComponent(normalized)}&limit=${limitN}`;
    const res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });

    if (res.status === 400 || res.status === 404) {
      depthCache.set(cacheKey, null, 3_000);
      return null;
    }

    if (!res.ok) {
      throw makeHttpError(`binance depth failed ${res.status}`, res.status);
    }

    const json = (await res.json()) as BinanceDepthResponse;
    depthCache.set(cacheKey, json, 1_500);
    return json;
  });

  depthInFlight.set(cacheKey, request);
  return request;
}

export async function fetchBinanceRecentTrades(symbol: string, limitN = 14): Promise<BinanceRecentTrade[]> {
  const normalized = String(symbol ?? "").trim().toUpperCase();
  if (!normalized) return [];

  const cacheKey = `binance:terminal:trades:${normalized}:${limitN}`;
  const cached = tradesCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const inflight = tradesInFlight.get(cacheKey);
  if (inflight) return inflight;

  const request = limit(async () => {
    const url = `${BINANCE_BASE}/api/v3/trades?symbol=${encodeURIComponent(normalized)}&limit=${limitN}`;
    const res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });

    if (res.status === 400 || res.status === 404) {
      tradesCache.set(cacheKey, [], 3_000);
      return [];
    }

    if (!res.ok) {
      throw makeHttpError(`binance recent trades failed ${res.status}`, res.status);
    }

    const json = await res.json();
    const trades = Array.isArray(json) ? (json as BinanceRecentTrade[]) : [];
    tradesCache.set(cacheKey, trades, 1_500);
    return trades;
  });

  tradesInFlight.set(cacheKey, request);
  return request;
}
