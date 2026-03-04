// app/api/hot/route.ts
import { NextResponse } from "next/server";
import { TTLCache, InFlight } from "@/lib/server-cache";
import { getMarketCapMap } from "@/lib/marketcap";
import { getIconUrl } from "@/lib/icons";
import { getMarketCapFallbackMap, type MarketCapSource } from "@/lib/marketcap-fallback";
import { computeSignal as computeSignalStrict } from "@/lib/signals";

import {
  fetch24hTicker as fetch24hTickerBinance,
  fetchKlinesCached as fetchKlinesCachedBinance,
  isUsdtSpotSymbol as isUsdtSpotSymbolBinance,
  isStable,
  isValidInterval as isValidIntervalBinance,
  baseAssetFromBinanceSymbol,
} from "@/lib/binance";

import * as mexc from "@/lib/mexc";
import { ensureBinanceWsStarted, getWsPriceSnap, getWsHealth } from "@/lib/binance-ws";
import { ensureMexcWsStarted, getMexcWsPriceSnap, getMexcWsHealth } from "@/lib/mexc-ws";

export const runtime = "nodejs";

type Exchange = "binance" | "mexc";
type SpikeMode = "pulse" | "scalp";
type AnyRecord = Record<string, unknown>;
type AnyCandle = AnyRecord | unknown[];

type HotRow = {
  exchange: Exchange;
  symbol: string;
  price: number;

  changePercent: number;
  change24hPercent: number;
  changeApprox?: boolean;

  volume: string;
  volumeRaw: number;

  volSpike: number | null;
  score: number;
  signal: string;

  source: "klines" | "fallback";

  marketCap?: string;
  marketCapRaw?: number | null;
  marketCapSource?: MarketCapSource;

  logoUrl?: string | null; // CoinGecko
  iconUrl?: string | null; // CryptoCompare fallback
  baseAsset?: string | null;
};

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function qNum(sp: URLSearchParams, key: string, def: number) {
  const v = sp.get(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function qBool(sp: URLSearchParams, key: string, def: boolean) {
  const v = sp.get(key);
  if (v === null) return def;
  return v === "1" || v === "true" || v === "yes";
}

function getTf(sp: URLSearchParams, fallback = "15m") {
  const tf = sp.get("tf")?.trim();
  if (tf) return tf;
  const U = sp.get("U")?.trim();
  if (U) return U;
  return fallback;
}

function getExchange(sp: URLSearchParams): Exchange {
  const ex = (sp.get("exchange") || "binance").trim().toLowerCase();
  return ex === "mexc" ? "mexc" : "binance";
}

function getSpikeMode(sp: URLSearchParams): SpikeMode {
  const v = (sp.get("spikeMode") || "pulse").trim().toLowerCase();
  return v === "scalp" ? "scalp" : "pulse";
}

function makeKey(prefix: string, obj: Record<string, unknown>) {
  return prefix + ":" + JSON.stringify(obj);
}

function isTickerMode(tf: string) {
  const t = tf.trim().toLowerCase();
  return t === "ticker" || t === "24h" || t === "24h (ticker)" || t === "24hr";
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}

const hotCache = new TTLCache<Record<string, unknown>>(30_000, 200);
const hotInFlight = new InFlight<Record<string, unknown>>();

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;

  const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      out[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return out;
}

function asRecord(v: unknown): AnyRecord | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  return v as AnyRecord;
}

function propNum(obj: unknown, key: string): number {
  const rec = asRecord(obj);
  if (!rec) return 0;
  return num(rec[key], 0);
}

function propStr(obj: unknown, key: string): string {
  const rec = asRecord(obj);
  if (!rec) return "";
  const v = rec[key];
  return typeof v === "string" ? v : String(v ?? "");
}

function tickerSymbol(t: unknown): string {
  return propStr(t, "symbol");
}

function tickerQuoteVolume(t: unknown): number {
  return propNum(t, "quoteVolume");
}

function tickerLastPrice(t: unknown): number {
  return propNum(t, "lastPrice");
}

function tickerOpenPrice(t: unknown): number {
  return propNum(t, "openPrice");
}

function tickerBaseAsset(t: unknown): string {
  return propStr(t, "baseAsset");
}

function isPositiveFinite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function hotTtlMs(tf: string) {
  if (tf === "1m") return 2_000;
  if (tf === "3m") return 2_500;
  if (tf === "5m") return 3_000;
  if (tf === "15m") return 5_000;
  if (tf === "30m") return 8_000;
  return 15_000;
}

function isFastTf(tf: string) {
  return tf === "1m" || tf === "5m" || tf === "15m";
}

type MarketInfo = { cap: number; logoUrl?: string | null };

function attachMarketCap(row: HotRow, capMap: Map<string, MarketInfo>) {
  const base = (row.baseAsset ?? baseAssetFromBinanceSymbol(row.symbol) ?? "").toUpperCase().trim();
  if (!base) return row;

  const info = capMap.get(base);
  const cap = info?.cap;

  if (Number.isFinite(cap) && (cap as number) > 0) {
    row.marketCapRaw = cap as number;
    row.marketCap = formatCompact(cap as number);
    row.marketCapSource = "cg";
  } else {
    row.marketCapRaw = row.marketCapRaw ?? null;
    row.marketCapSource = row.marketCapSource ?? "none";
  }

  row.logoUrl = info?.logoUrl ?? null;
  return row;
}

async function attachFallbackIcon(row: HotRow) {
  if (row.logoUrl || !row.baseAsset) {
    row.iconUrl = null;
    return row;
  }
  const icon = await getIconUrl(row.baseAsset);
  row.iconUrl = icon ?? null;
  return row;
}

async function attachMarketCapFallbackBatch(
  rows: HotRow[],
  capMap: Map<string, { cap: number; logoUrl?: string | null }>,
  exchange: Exchange
) {
  const missingBases = Array.from(
    new Set(
      rows
        .filter((r) => !isPositiveFinite(num(r.marketCapRaw)))
        .map((r) => String(r.baseAsset ?? "").trim().toUpperCase())
        .filter(Boolean)
    )
  );

  if (missingBases.length === 0) return rows;

  const stats = { externalCalls: 0 };
  const fallbackMap = await getMarketCapFallbackMap({
    baseAssets: missingBases,
    coingeckoCapMap: capMap,
    allowMexcScrape: exchange === "mexc",
    maxLookups: 10,
    stats,
  });

  let found = 0;
  for (const r of rows) {
    const base = String(r.baseAsset ?? "").trim().toUpperCase();
    if (!base) continue;
    const got = fallbackMap.get(base);
    if (!got) continue;
    r.marketCapSource = got.source;
    if (isPositiveFinite(got.marketCap)) {
      r.marketCapRaw = got.marketCap;
      r.marketCap = formatCompact(got.marketCap);
      found++;
    } else {
      r.marketCapRaw = r.marketCapRaw ?? null;
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const unresolved = rows.filter((r) => !isPositiveFinite(num(r.marketCapRaw))).length;
    console.debug(
      "[hot:marketcap]",
      JSON.stringify({
        exchange,
        requestedAssets: missingBases.length,
        lookedUpAssets: Math.min(missingBases.length, 10),
        found,
        unresolved,
        externalCalls: stats.externalCalls ?? 0,
      })
    );
  }

  return rows;
}

function median(nums: number[]) {
  const a = nums.filter((x) => Number.isFinite(x)).slice().sort((x, y) => x - y);
  if (a.length === 0) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function compute24hPercent(openPrice: number, currentPrice: number): number {
  if (!(openPrice > 0) || !(currentPrice > 0)) return Number.NaN;
  return ((currentPrice - openPrice) / openPrice) * 100;
}

function tfScaleFrom24h(tf: string) {
  const m = (x: number) => x / 1440;
  switch (tf) {
    case "1m": return m(1);
    case "3m": return m(3);
    case "5m": return m(5);
    case "15m": return m(15);
    case "30m": return m(30);
    case "1h": return m(60);
    case "2h": return m(120);
    case "4h": return m(240);
    case "6h": return m(360);
    case "8h": return m(480);
    case "12h": return m(720);
    case "1d": return 1;
    case "1w": return 7;
    case "1M": return 30;
    default: return m(15);
  }
}

function candleCloseTimeMs(c: AnyCandle): number | null {
  const raw = Number(
    Array.isArray(c) ? c[6] : (c.closeTime ?? c.t ?? c.T)
  );
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw < 1e12 ? raw * 1000 : raw;
}

function candleClosePrice(c: AnyCandle): number {
  return Number(Array.isArray(c) ? c[4] : (c.close ?? c.c));
}

function candleOpenPrice(c: AnyCandle): number {
  return Number(Array.isArray(c) ? c[1] : (c.open ?? c.o));
}

function candleBaseVolume(c: AnyCandle): number {
  return Number(Array.isArray(c) ? c[5] : (c.volume ?? c.v ?? c.vol));
}

function candleQuoteVolume(c: AnyCandle): number {
  if (Array.isArray(c)) return num(c[7], 0);
  const keys = ["quoteAssetVolume", "quoteVolume", "quoteVol", "turnover", "amountQuote", "quoteAmount"] as const;
  for (const key of keys) {
    const raw = c[key];
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  }
  return 0;
}

function candleQuoteVolumeOrEstimate(c: AnyCandle): number {
  const q = candleQuoteVolume(c);
  if (Number.isFinite(q) && q > 0) return q;

  const v = candleBaseVolume(c);
  const close = candleClosePrice(c);
  if (Number.isFinite(v) && v > 0 && Number.isFinite(close) && close > 0) return v * close;

  return 0;
}

function spikeWindowByMode(mode: SpikeMode): number {
  return mode === "scalp" ? 5 : 20;
}

function lastClosedIndex(candles: AnyCandle[]) {
  if (!candles || candles.length < 1) return -1;
  const now = Date.now();
  let idxLast = candles.length - 1;
  const ct = candleCloseTimeMs(candles[idxLast]);
  if (ct != null && ct > now) idxLast = Math.max(0, idxLast - 1);
  return idxLast;
}

function lastClosedCandleClose(candles: AnyCandle[]): number | null {
  const idx = lastClosedIndex(candles);
  if (idx < 0) return null;
  const close = candleClosePrice(candles[idx]);
  return Number.isFinite(close) && close > 0 ? close : null;
}

function computeTfChangeFromCandles(candles: AnyCandle[], currentPrice: number): number | null {
  const idxLast = lastClosedIndex(candles);
  if (idxLast < 0) return null;

  const baseC = candles[idxLast];
  let base = candleOpenPrice(baseC);
  if (!(base > 0) && idxLast - 1 >= 0) base = candleClosePrice(candles[idxLast - 1]);
  if (!(base > 0)) return null;

  const price = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : candleClosePrice(baseC);
  if (!(price > 0)) return null;

  return ((price - base) / base) * 100;
}

function computeCandleVolSpikeFromCandles(candles: AnyCandle[], spikeMode: SpikeMode): number | null {
  const window = spikeWindowByMode(spikeMode);
  if (!candles || candles.length < window + 2) return null;

  const idxSpike = candles.length - 1;
  if (idxSpike < window) return null;
  const startPrev = idxSpike - window;
  const qvAt = (c: AnyCandle) => candleQuoteVolumeOrEstimate(c);

  const lastQv = qvAt(candles[idxSpike]);
  if (!Number.isFinite(lastQv) || lastQv <= 0) return null;

  const prevArr = candles.slice(startPrev, idxSpike).map(qvAt);
  if (prevArr.length < window) return null;
  const baseline =
    spikeMode === "scalp"
      ? median(prevArr)
      : prevArr.reduce((a: number, v: number) => a + v, 0) / prevArr.length;
  if (!Number.isFinite(baseline) || baseline <= 0) return null;

  const spike = lastQv / baseline;
  if (!Number.isFinite(spike) || spike <= 0) return null;
  return spike;
}

function applyIlliquidVolSpikeFilter(volSpike: number | null, candles: AnyCandle[], minSmaQuote: number, spikeMode: SpikeMode) {
  if (volSpike == null) return null;
  const window = spikeWindowByMode(spikeMode);
  if (!candles || candles.length < window + 2) return null;

  const idxSpike = candles.length - 1;
  if (idxSpike < window) return null;
  const startPrev = idxSpike - window;

  const qvAt = (c: AnyCandle) => candleQuoteVolumeOrEstimate(c);

  const prevArr = candles.slice(startPrev, idxSpike).map(qvAt);
  if (prevArr.length < window) return null;
  const baseline =
    spikeMode === "scalp"
      ? median(prevArr)
      : prevArr.reduce((a: number, v: number) => a + v, 0) / prevArr.length;

  if (!Number.isFinite(baseline) || baseline <= 0) return null;
  if (baseline < minSmaQuote) return null;

  return volSpike;
}
function getLiveSnap(exchange: Exchange, symbol: string, t: unknown) {
  if (exchange === "binance") {
    const ws = getWsPriceSnap(symbol);
    const price = ws?.price ?? tickerLastPrice(t);
    const open24h = ws?.open24h ?? tickerOpenPrice(t);
    const quoteVol24h = ws?.quoteVol24h ?? tickerQuoteVolume(t);
    const wsOk = !!ws;
    return { price, open24h, quoteVol24h, wsOk };
  }

  const ws = getMexcWsPriceSnap(symbol);
  const price = ws?.price ?? tickerLastPrice(t);

  let open24h = tickerOpenPrice(t);
  let quoteVol24h = tickerQuoteVolume(t);

  if (!(open24h > 0)) open24h = ws?.open24h ?? 0;
  if (!(quoteVol24h > 0)) quoteVol24h = ws?.quoteVol24h ?? 0;

  const wsOk = !!ws;
  return { price, open24h, quoteVol24h, wsOk };
}

function rowFromTicker(exchange: Exchange, t: unknown, tf: string, baseAsset: string | null, opts?: { tickerMode?: boolean }): HotRow {
  const symbol = tickerSymbol(t);
  const snap = getLiveSnap(exchange, symbol, t);

  const change24hPercent = compute24hPercent(snap.open24h, snap.price);
  const approxTf = Number.isFinite(change24hPercent) ? change24hPercent * tfScaleFrom24h(tf) : Number.NaN;

  const tickerMode = !!opts?.tickerMode;
  const changePercent = tickerMode ? change24hPercent : approxTf;

  const volumeRaw = snap.quoteVol24h;

  const base: HotRow = {
    exchange,
    symbol,
    price: snap.price,
    changePercent: Number.isFinite(changePercent) ? changePercent : 0,
    change24hPercent,
    changeApprox: tickerMode ? undefined : true,
    volumeRaw,
    volume: formatCompact(volumeRaw),
    volSpike: null,
    score: 0,
    signal: "Calm",
    source: "fallback",
    baseAsset,
    logoUrl: null,
    iconUrl: null,
  };

  // strict classifier (ticker semantics)
  base.signal = computeSignalStrict({
    changePercent: base.changePercent,
    change24hPercent: base.change24hPercent,
    volSpike: null,
    vol24hQuote: volumeRaw,
    mode: "ticker",
    tf: tickerMode ? "24h" : tf,
  });

  const cp = Number.isFinite(base.changePercent) ? base.changePercent : 0;
  base.score = clamp(Math.abs(cp) * 0.20 + (volumeRaw > 0 ? 1 : 0), 0, 10);
  return base;
}

function wsHealthFor(exchange: Exchange) {
  if (exchange === "binance") return getWsHealth();
  if (exchange === "mexc") return getMexcWsHealth();
  return { connected: false, lastMsgAgeMs: null, size: 0 };
}

function withLiveWs<T extends Record<string, unknown>>(payload: T, exchange: Exchange) {
  return { ...payload, ws: wsHealthFor(exchange) };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;

  const exchange = getExchange(sp);
  if (exchange === "binance") ensureBinanceWsStarted();
  if (exchange === "mexc") ensureMexcWsStarted();

  const tf = getTf(sp, "15m").trim();
  const spikeMode = getSpikeMode(sp);
  const spikeWindow = spikeWindowByMode(spikeMode);
  const limitN = clamp(qNum(sp, "limit", 120), 1, 300);

  const klineCandidatesDefault = exchange === "mexc" ? 120 : limitN;
  let klineCandidates = clamp(qNum(sp, "klineCandidates", klineCandidatesDefault), 10, 300);
  klineCandidates = Math.min(klineCandidates, limitN);

  const candidatePoolDefault = exchange === "mexc" ? 2000 : Math.min(300, limitN);
  const candidatePool = clamp(qNum(sp, "candidatePool", candidatePoolDefault), 50, 5000);

  const minVol = qNum(sp, "minVol", 0);
  const includeStables = qBool(sp, "includeStables", false);

  const candleSpikeParam = sp.get("candleSpike");
  const candleSpike = candleSpikeParam === null ? true : qBool(sp, "candleSpike", true);
  const candleSpikeLimit = clamp(qNum(sp, "candleSpikeLimit", 30), 21, 60);

  const spikeIlliquidFilter = qBool(sp, "spikeIlliquidFilter", true);
  const spikeMinSmaQuote = clamp(qNum(sp, "spikeMinSmaQuote", 100), 0, 1_000_000);

  const cacheKey = makeKey("hot", {
    exchange,
    tf,
    limitN,
    klineCandidates,
    candidatePool,
    minVol,
    includeStables,
    candleSpike,
    candleSpikeLimit,
    spikeMode,
    spikeIlliquidFilter,
    spikeMinSmaQuote,
  });

  const ttlMs = hotTtlMs(isTickerMode(tf) ? "24h" : tf);

  const cached = hotCache.get(cacheKey);
  if (cached) return NextResponse.json(withLiveWs({ ...cached, cache: { hit: true, ttlMs } }, exchange));

  const inflight = hotInFlight.get(cacheKey);
  if (inflight) {
    const data = await inflight;
    return NextResponse.json(withLiveWs({ ...data, cache: { hit: true, inflight: true, ttlMs } }, exchange));
  }

  const p = (async () => {
    const fetch24hTicker = exchange === "mexc" ? mexc.fetch24hTicker : fetch24hTickerBinance;
    const fetchKlinesCached = exchange === "mexc" ? mexc.fetchKlinesCached : fetchKlinesCachedBinance;
    const isUsdtSpotSymbol = exchange === "mexc" ? mexc.isUsdtSpotSymbol : isUsdtSpotSymbolBinance;
    const isValidInterval = exchange === "mexc" ? mexc.isValidInterval : isValidIntervalBinance;

    const mexcBaseBySymbol = new Map<string, string>();
    if (exchange === "mexc") {
      try {
        const info = await mexc.fetchExchangeInfoCached();
        const symbols: unknown[] = Array.isArray(info?.symbols) ? info.symbols : [];
        for (const s of symbols) {
          const sym = tickerSymbol(s).toUpperCase();
          const base = tickerBaseAsset(s).toUpperCase();
          if (sym) mexcBaseBySymbol.set(sym, base);
        }
      } catch {
        // ignore
      }
    }

    const tickers = await fetch24hTicker();
    const capMap = await getMarketCapMap();

    let base = tickers
      .filter((t) => isUsdtSpotSymbol(tickerSymbol(t)))
      .filter((t) => (includeStables ? true : !isStable(tickerSymbol(t))));

    if (exchange === "binance" && minVol > 0) {
      base = base.filter((t) => tickerQuoteVolume(t) >= minVol);
    }

    if (exchange === "mexc") {
      base.sort((a, b) => {
        const ap = tickerLastPrice(a);
        const ao = tickerOpenPrice(a);
        const bp = tickerLastPrice(b);
        const bo = tickerOpenPrice(b);

        const aCh = ao > 0 ? ((ap - ao) / ao) * 100 : 0;
        const bCh = bo > 0 ? ((bp - bo) / bo) * 100 : 0;

        return Math.abs(bCh) - Math.abs(aCh);
      });
    } else {
      base.sort((a, b) => tickerQuoteVolume(b) - tickerQuoteVolume(a));
    }

    const maxCap = exchange === "mexc" ? 5000 : 300;
    const pool = base.slice(0, Math.max(1, Math.min(maxCap, candidatePool)));

    const candidates =
      exchange === "mexc"
        ? (minVol > 0 ? pool.filter((t) => tickerQuoteVolume(t) >= minVol) : pool)
        : pool;

    const getBaseAsset = (sym: string): string | null => {
      if (exchange === "mexc") return mexcBaseBySymbol.get(sym.toUpperCase()) ?? null;
      return baseAssetFromBinanceSymbol(sym) ?? null;
    };

    // -------- ticker mode --------
    // -------- ticker mode (24h) --------
    if (isTickerMode(tf) || !isValidInterval(tf)) {
      let wsUsed = 0;

      // 1) собираем базовые строки (24h% + 24h volume), без spike пока
      const baseRows = candidates.map((t) => {
        const sym = tickerSymbol(t);
        const baseAsset = getBaseAsset(sym);

        const snap = getLiveSnap(exchange, sym, t);
        if (snap.wsOk) wsUsed++;

        // tickerMode true => changePercent = 24h%
        const r = rowFromTicker(exchange, t, "1d", baseAsset, { tickerMode: true });

        // в ticker-mode volSpike будем считать по 1h свечам, поэтому тут ставим null
        r.volSpike = null;

        return attachMarketCap(r, capMap);
      });

      // 2) считаем candle volSpike по 1h свечам только для top N по объёму (чтобы не долбить лимиты)
      const TOP_SPIKE_N = 60;
      const spikeInterval = "1h";
      const spikeKlinesLimit = Math.max(candleSpikeLimit + 1, spikeWindow + 2, 30);

      const topForSpike = [...candidates]
        .slice()
        .sort((a, b) => tickerQuoteVolume(b) - tickerQuoteVolume(a))
        .slice(0, TOP_SPIKE_N);

      const spikeBySymbol = new Map<string, number | null>();

      const spikeConcurrency = exchange === "mexc" ? 3 : 6;

      await mapLimit(topForSpike, spikeConcurrency, async (t) => {
        const sym = tickerSymbol(t);
        try {
          const candles = (await fetchKlinesCached(sym, spikeInterval, spikeKlinesLimit)) as AnyCandle[];
          const spike = computeCandleVolSpikeFromCandles(candles, spikeMode);
          let volSpike: number | null = spike;

          // применяем фильтр "illiquid spike" (тот же, что в klines-mode)
          if (spikeIlliquidFilter) {
            volSpike = applyIlliquidVolSpikeFilter(volSpike, candles, spikeMinSmaQuote, spikeMode);
          }

          if (volSpike != null) volSpike = clamp(volSpike, 0, 99);

          spikeBySymbol.set(sym, volSpike);
        } catch {
          spikeBySymbol.set(sym, null);
        }
      });

      // 3) назначаем volSpike (1h candle-based) + пересчитываем score + сигнал
      const rowsAll = baseRows.map((r) => {
        const sym = r.symbol;
        const cp = Number.isFinite(r.changePercent) ? r.changePercent : 0;

        const candleSpike = spikeBySymbol.has(sym) ? spikeBySymbol.get(sym)! : null;
        r.volSpike = candleSpike;

        // score: строго, чтобы не было "вечных 10" на ликвидных монетах
        const spikePart = r.volSpike != null ? r.volSpike : 0;
        r.score = clamp(Math.abs(cp) * 0.12 + spikePart * 0.8, 0, 10);

        // базовый строгий ticker-сигнал (по движению)
        let sig = computeSignalStrict({
          changePercent: r.changePercent,       // тут это 24h%
          change24hPercent: r.change24hPercent, // тот же 24h%
          volSpike: r.volSpike,                 // candle spike по 1h
          vol24hQuote: r.volumeRaw,
          mode: "ticker",
          tf: "24h",
        });

        // IMPORTANT: в ticker-mode computeSignalStrict специально не использует spike для Whale/Breakout.
        // Но теперь у нас spike candle-based, и мы можем добавить ОДНУ строгую аномалию:
        // "Whale Activity" = spike>=3 и цена почти стоит (|24h%| < 2%)
        if (
          sig === "Calm" &&
          r.volSpike != null &&
          r.volSpike >= 3.0 &&
          Math.abs(r.changePercent) < 2.0
        ) {
          sig = "Whale Activity";
        }

        r.signal = sig;
        return r;
      });

      // сортируем по score как и раньше
      rowsAll.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      const rows = rowsAll.slice(0, limitN);

      const rowsWithIcons = await Promise.all(rows.map(attachFallbackIcon));
      let rowsFinal = rowsWithIcons;

      rowsFinal = await attachMarketCapFallbackBatch(rowsFinal, capMap, exchange);

      const payload = {
        ok: true,
        exchange,
        tf,
        data: rowsFinal,
        ts: Date.now(),
        mode: "ticker" as const,
        ws: wsHealthFor(exchange),
        degraded: false,
        degradeReason: [] as string[],
        computedBy: {
          klines: 0,
          tickerFallback: rowsFinal.length,
          wsUsed,
          rejected: 0,
          spikeKlines: spikeBySymbol.size,
          spikeInterval,
          spikeMode,
          spikeWindow,
        },
      };

      hotCache.set(cacheKey, payload, ttlMs);
      return payload;
    }

    // -------- klines mode --------
    const kTop = candidates.slice(0, klineCandidates);
    const CONCURRENCY = exchange === "mexc" ? 4 : isFastTf(tf) ? 8 : 6;

    let rejects = 0;
    let computedKlines = 0;
    const degradeReason: string[] = [];

    const computed = await mapLimit(kTop, CONCURRENCY, async (t) => {
      const symbol = tickerSymbol(t);
      const baseAsset = getBaseAsset(symbol);

      const snap = getLiveSnap(exchange, symbol, t);
      const currentPriceWs = snap.price;
      const openPrice24h = snap.open24h;
      const vol24hQuote = snap.quoteVol24h;
      const wsOk = snap.wsOk;

      try {
        const limit = candleSpike ? Math.max(candleSpikeLimit + 1, spikeWindow + 2, 30) : 2;
        const candles = (await fetchKlinesCached(symbol, tf, limit)) as AnyCandle[];

        const change24hPercent = compute24hPercent(openPrice24h, currentPriceWs);

        let exact = computeTfChangeFromCandles(candles, currentPriceWs);

        if (
          wsOk &&
          exact != null &&
          Number.isFinite(change24hPercent) &&
          Math.abs(exact) > 50 &&
          Math.abs(change24hPercent) < 5
        ) {
          const cc = lastClosedCandleClose(candles);
          if (cc && cc > 0) {
            const stabilized = computeTfChangeFromCandles(candles, cc);
            if (stabilized != null && Number.isFinite(stabilized) && Math.abs(stabilized) < Math.abs(exact)) {
              exact = stabilized;
            }
          }
        }

        const approx = Number.isFinite(change24hPercent) ? change24hPercent * tfScaleFrom24h(tf) : Number.NaN;

        let changePercent: number;
        let changeApprox = false;

        if (exact == null || !Number.isFinite(exact)) {
          changeApprox = true;
          changePercent = Number.isFinite(approx) ? approx : 0;
        } else {
          changePercent = exact;
        }

        let volSpike: number | null = null;
        if (candleSpike) {
          const spikeRaw = computeCandleVolSpikeFromCandles(candles, spikeMode);
          volSpike = spikeRaw;

          if (spikeIlliquidFilter) {
            volSpike = applyIlliquidVolSpikeFilter(volSpike, candles, spikeMinSmaQuote, spikeMode);
          }
        } else {
          volSpike = null;
        }

        if (volSpike != null) volSpike = clamp(volSpike, 0, 99);

        const score = clamp(
          Math.abs(Number.isFinite(changePercent) ? changePercent : 0) * 0.22 + (volSpike != null ? volSpike : 0) * 0.6,
          0,
          10
        );

        const signal = computeSignalStrict({
          changePercent,
          change24hPercent,
          volSpike,
          vol24hQuote,
          mode: "klines",
          tf, // ✅ правильный timeframe
        });

        computedKlines++;

        const row: HotRow = {
          exchange,
          symbol,
          price: currentPriceWs,
          changePercent,
          change24hPercent,
          changeApprox: changeApprox ? true : undefined,
          volumeRaw: vol24hQuote,
          volume: formatCompact(vol24hQuote),
          volSpike,
          score,
          signal,
          source: "klines",
          baseAsset,
          logoUrl: null,
          iconUrl: null,
        };

        return row;
      } catch {
        rejects++;
        return null;
      }
    });

    const bySymbol = new Map<string, HotRow>();
    for (let i = 0; i < kTop.length; i++) {
      const sym = tickerSymbol(kTop[i]);
      const r = computed[i];
      if (r) bySymbol.set(sym, r);
    }

    let wsUsed = 0;

    const rowsAll = candidates.map((t) => {
      const sym = tickerSymbol(t);
      const baseAsset = getBaseAsset(sym);

      const fromK = bySymbol.get(sym);
      const r = fromK ? fromK : rowFromTicker(exchange, t, tf, baseAsset, { tickerMode: false });

      const snap = getLiveSnap(exchange, sym, t);
      if (snap.wsOk) wsUsed++;

      return attachMarketCap(r, capMap);
    });

    const computedTickerFallback = rowsAll.length - computedKlines;
    const degraded = rejects > 0 || computedKlines < kTop.length;
    if (degraded) degradeReason.push("klines_failed_or_rate_limited");

    rowsAll.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const rows = rowsAll.slice(0, limitN);

    const rowsWithIcons = await Promise.all(rows.map(attachFallbackIcon));
    let rowsFinal = rowsWithIcons;

    rowsFinal = await attachMarketCapFallbackBatch(rowsFinal, capMap, exchange);

    const wsHealth = wsHealthFor(exchange);

    const payload = {
      ok: true,
      exchange,
      tf,
      data: rowsFinal,
      ts: Date.now(),
      mode: wsHealth?.connected ? ("klines-ws" as const) : ("klines" as const),
      rejects,
      klineCandidates,
      candidatePool,
      minVol,
      candleSpike,
      candleSpikeLimit,
      spikeIlliquidFilter,
      spikeMinSmaQuote,
      ws: wsHealth,
      degraded,
      degradeReason,
      computedBy: {
        klines: computedKlines,
        tickerFallback: computedTickerFallback,
        wsUsed,
        rejected: rejects,
        spikeMode,
        spikeWindow,
      },
    };

    hotCache.set(cacheKey, payload, ttlMs);
    return payload;
  })();

  hotInFlight.set(cacheKey, p);

  try {
    const out = await p;
    return NextResponse.json(withLiveWs({ ...out, cache: { hit: false, ttlMs } }, exchange));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, ts: Date.now() }, { status: 500 });
  }
}
