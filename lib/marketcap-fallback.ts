// lib/marketcap-fallback.ts
import { TTLCache, InFlight, createLimiter, fetchWithRetry } from "@/lib/server-cache";
import { fetchMexcMarketCapUsd } from "@/lib/mexc-marketcap";

export type MarketCapSource = "cg" | "paprika" | "mexc" | "none";

export type CapResult = { capUsd: number | null; source: MarketCapSource };
export type CapBatchItem = { marketCap: number | null; source: MarketCapSource };

const HIT_TTL_MS = 12 * 60 * 60_000; // 12h
const MISS_TTL_MS = 6 * 60 * 60_000; // 6h

const capCache = new TTLCache<CapResult>(HIT_TTL_MS, 12_000);
const capInFlight = new InFlight<CapResult>();

const paprikaIdCache = new TTLCache<string | null>(24 * 60 * 60_000, 12_000);
const paprikaIdInFlight = new InFlight<string | null>();

const paprikaCapCache = new TTLCache<number | null>(HIT_TTL_MS, 12_000);
const paprikaCapInFlight = new InFlight<number | null>();

// Keep external calls conservative.
const lim = createLimiter(3);

type LookupStats = { externalCalls?: number };

type PaprikaSearchItem = {
  id: string;
  name: string;
  symbol: string;
  rank: number | null;
};

type PaprikaTicker = {
  quotes?: { USD?: { market_cap?: number | null } };
};

function isGoodCap(n: unknown) {
  const x = Number(n);
  return Number.isFinite(x) && x >= 1_000_000;
}

function scorePaprikaMatch(base: string, it: PaprikaSearchItem) {
  const sym = String(it.symbol ?? "").toUpperCase();
  const name = String(it.name ?? "").toUpperCase();
  const b = base.toUpperCase();

  let s = 0;
  if (sym === b) s += 100;
  if (name === b) s += 40;

  const rank = Number(it.rank);
  if (Number.isFinite(rank) && rank > 0) s += Math.max(0, 50 - Math.min(rank, 50));
  if (sym.length > 10) s -= 10;

  return s;
}

function withTimeout(ms = 4_500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return {
    signal: ctrl.signal,
    clear: () => clearTimeout(timer),
  };
}

async function fetchWithRetryTracked(url: string, stats?: LookupStats) {
  const to = withTimeout();
  try {
    if (stats) stats.externalCalls = (stats.externalCalls ?? 0) + 1;
    return await fetchWithRetry(
      url,
      { method: "GET", cache: "no-store", signal: to.signal },
      { retries: 1 }
    );
  } finally {
    to.clear();
  }
}

async function resolvePaprikaIdByTicker(baseAsset: string, stats?: LookupStats): Promise<string | null> {
  const base = String(baseAsset ?? "").trim().toUpperCase();
  if (!base) return null;

  const key = `pap:id:${base}`;
  const cached = paprikaIdCache.get(key);
  if (cached !== undefined) return cached;

  const inflight = paprikaIdInFlight.get(key);
  if (inflight) return inflight;

  const p = lim(async () => {
    const q = encodeURIComponent(base);
    const searchUrl = `https://api.coinpaprika.com/v1/search?q=${q}&c=currencies&limit=20`;
    const sRes = await fetchWithRetryTracked(searchUrl, stats);
    if (!sRes.ok) {
      paprikaIdCache.set(key, null, MISS_TTL_MS);
      return null;
    }

    const sJson = await sRes.json();
    const items: PaprikaSearchItem[] = Array.isArray(sJson?.currencies) ? sJson.currencies : [];
    if (!items.length) {
      paprikaIdCache.set(key, null, MISS_TTL_MS);
      return null;
    }

    items.sort((a, b) => scorePaprikaMatch(base, b) - scorePaprikaMatch(base, a));
    const best = items[0]?.id ? String(items[0].id) : null;
    paprikaIdCache.set(key, best, best ? 24 * 60 * 60_000 : MISS_TTL_MS);
    return best;
  });

  paprikaIdInFlight.set(key, p);
  return p;
}

async function fetchPaprikaCapUsd(baseAsset: string, stats?: LookupStats): Promise<number | null> {
  const coinId = await resolvePaprikaIdByTicker(baseAsset, stats);
  if (!coinId) return null;

  const key = `pap:cap:${coinId}`;
  const cached = paprikaCapCache.get(key);
  if (cached !== undefined) return cached;

  const inflight = paprikaCapInFlight.get(key);
  if (inflight) return inflight;

  const p = lim(async () => {
    const tUrl = `https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(coinId)}`;
    const tRes = await fetchWithRetryTracked(tUrl, stats);
    if (!tRes.ok) {
      paprikaCapCache.set(key, null, MISS_TTL_MS);
      return null;
    }

    const tJson: PaprikaTicker = await tRes.json();
    const cap = tJson?.quotes?.USD?.market_cap ?? null;
    const out = isGoodCap(cap) ? Number(cap) : null;
    paprikaCapCache.set(key, out, out ? HIT_TTL_MS : MISS_TTL_MS);
    return out;
  });

  paprikaCapInFlight.set(key, p);
  return p;
}

export async function getMarketCapFallbackUsd(opts: {
  baseAsset: string;
  coingeckoCapMap?: Map<string, { cap: number; logoUrl?: string | null }> | null;
  allowMexcScrape?: boolean;
  stats?: LookupStats;
}): Promise<CapResult> {
  const base = String(opts.baseAsset ?? "").trim().toUpperCase();
  if (!base) return { capUsd: null, source: "none" };

  const key = `capfb:${base}`;
  const cached = capCache.get(key);
  if (cached) return cached;

  const inflight = capInFlight.get(key);
  if (inflight) return inflight;

  const p = lim(async () => {
    const cg = opts.coingeckoCapMap?.get(base)?.cap;
    if (isGoodCap(cg)) {
      const out: CapResult = { capUsd: Number(cg), source: "cg" };
      capCache.set(key, out, HIT_TTL_MS);
      return out;
    }

    try {
      const pap = await fetchPaprikaCapUsd(base, opts.stats);
      if (isGoodCap(pap)) {
        const out: CapResult = { capUsd: Number(pap), source: "paprika" };
        capCache.set(key, out, HIT_TTL_MS);
        return out;
      }
    } catch {
      // ignore
    }

    if (opts.allowMexcScrape !== false) {
      try {
        if (opts.stats) opts.stats.externalCalls = (opts.stats.externalCalls ?? 0) + 1;
        const mexc = await fetchMexcMarketCapUsd(base);
        if (isGoodCap(mexc?.capUsd)) {
          const out: CapResult = { capUsd: Number(mexc.capUsd), source: "mexc" };
          capCache.set(key, out, HIT_TTL_MS);
          return out;
        }
      } catch {
        // ignore
      }
    }

    const out: CapResult = { capUsd: null, source: "none" };
    capCache.set(key, out, MISS_TTL_MS);
    return out;
  });

  capInFlight.set(key, p);
  return p;
}

export async function getMarketCapFallbackMap(opts: {
  baseAssets: string[];
  coingeckoCapMap?: Map<string, { cap: number; logoUrl?: string | null }> | null;
  allowMexcScrape?: boolean;
  maxLookups?: number;
  stats?: LookupStats;
}): Promise<Map<string, CapBatchItem>> {
  const out = new Map<string, CapBatchItem>();

  const uniq = Array.from(
    new Set(
      (opts.baseAssets ?? [])
        .map((s) => String(s ?? "").trim().toUpperCase())
        .filter(Boolean)
    )
  );

  const maxLookups = Math.max(0, Math.min(100, Number(opts.maxLookups ?? 10) || 10));

  for (let i = 0; i < uniq.length; i++) {
    const base = uniq[i];
    if (i >= maxLookups) {
      out.set(base, { marketCap: null, source: "none" });
      continue;
    }

    const got = await getMarketCapFallbackUsd({
      baseAsset: base,
      coingeckoCapMap: opts.coingeckoCapMap,
      allowMexcScrape: opts.allowMexcScrape,
      stats: opts.stats,
    });

    out.set(base, { marketCap: got.capUsd, source: got.source });
  }

  return out;
}
