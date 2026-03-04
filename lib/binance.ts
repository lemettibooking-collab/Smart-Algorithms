// lib/binance.ts
import { TTLCache, InFlight, createLimiter, fetchWithRetry } from "@/lib/server-cache";

export const BINANCE_BASE = "https://api.binance.com";

export type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;

  // base asset volume (kline index 5)
  volume: number;

  closeTime: number;

  // ✅ quote asset volume (kline index 7)
  quoteVolume: number;

  // optional extras (not used yet, but handy)
  trades?: number;
  takerBuyBase?: number;
  takerBuyQuote?: number;
};

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// --- Concurrency + caches (module-scope) ---
const limit = createLimiter(8); // нагрузка на Binance (6–10 обычно ок)

// ❗️КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: TTL klines теперь зависит от TF
function klinesTtlMs(tf: string) {
  const t = tf.trim();
  // для скальпинга — очень короткий TTL, чтобы open текущей свечи не устаревал
  if (t === "1m") return 1200;
  if (t === "3m") return 1500;
  if (t === "5m") return 2500;
  if (t === "15m") return 5000;
  if (t === "30m") return 8000;

  // более старшие TF можно кэшировать дольше
  if (t === "1h") return 15_000;
  if (t === "2h") return 20_000;
  if (t === "4h") return 30_000;
  if (t === "6h") return 40_000;
  if (t === "8h") return 45_000;
  if (t === "12h") return 60_000;

  if (t === "1d") return 120_000;
  if (t === "3d") return 180_000;
  if (t === "1w") return 300_000;
  if (t === "1M") return 600_000;

  return 15_000;
}

// defaultTtlMs тут уже не так важен — мы будем передавать ttlMs на set()
const klinesCache = new TTLCache<Candle[]>(30_000, 8000);
const klinesInFlight = new InFlight<Candle[]>();

export function isValidInterval(tf: string) {
  const t = tf.trim();
  // Binance spot intervals:
  return (
    t === "1m" ||
    t === "3m" ||
    t === "5m" ||
    t === "15m" ||
    t === "30m" ||
    t === "1h" ||
    t === "2h" ||
    t === "4h" ||
    t === "6h" ||
    t === "8h" ||
    t === "12h" ||
    t === "1d" ||
    t === "3d" ||
    t === "1w" ||
    t === "1M"
  );
}

function makeHttpError(message: string, status: number) {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

export async function fetch24hTicker(): Promise<unknown[]> {
  const url = `${BINANCE_BASE}/api/v3/ticker/24hr`;
  const res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });
  if (!res.ok) throw makeHttpError(`ticker failed ${res.status}`, res.status);
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

export async function fetchKlines(symbol: string, interval: string, limitN: number): Promise<Candle[]> {
  const tf = interval.trim();
  if (!isValidInterval(tf)) throw new Error(`invalid interval: ${tf}`);

  const url =
    `${BINANCE_BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${encodeURIComponent(tf)}&limit=${limitN}`;

  const res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });

  if (!res.ok) {
    // ВАЖНО: пробрасываем status для деграда в /api/hot
    throw makeHttpError(`klines failed ${symbol} ${tf} ${res.status}`, res.status);
  }

  const json = await res.json();
  const raw = Array.isArray(json) ? json : [];

  // Binance kline array:
  // [0 openTime, 1 open, 2 high, 3 low, 4 close, 5 volume, 6 closeTime,
  //  7 quoteAssetVolume, 8 trades, 9 takerBuyBase, 10 takerBuyQuote, 11 ignore]
  return raw.map((r) => {
    const row = Array.isArray(r) ? r : [];
    return {
    openTime: num(row[0]),
    open: num(row[1]),
    high: num(row[2]),
    low: num(row[3]),
    close: num(row[4]),
    volume: num(row[5]),
    closeTime: num(row[6]),

    // ✅ new
    quoteVolume: num(row[7]),

    trades: Number.isFinite(Number(row[8])) ? Number(row[8]) : undefined,
    takerBuyBase: Number.isFinite(Number(row[9])) ? Number(row[9]) : undefined,
    takerBuyQuote: Number.isFinite(Number(row[10])) ? Number(row[10]) : undefined,
  };
  });
}

/**
 * Cached + in-flight dedupe + concurrency limit
 * ✅ TTL зависит от TF, чтобы 1m/5m/15m не “устаревали” и проценты совпадали с реальностью.
 */
export async function fetchKlinesCached(symbol: string, interval: string, limitN: number) {
  const tf = interval.trim();
  const key = `k:${symbol}:${tf}:${limitN}`;

  const cached = klinesCache.get(key);
  if (cached) return cached;

  const inflight = klinesInFlight.get(key);
  if (inflight) return inflight;

  const p = limit(async () => {
    const candles = await fetchKlines(symbol, tf, limitN);
    // ✅ динамический TTL
    klinesCache.set(key, candles, klinesTtlMs(tf));
    return candles;
  });

  klinesInFlight.set(key, p);
  return p;
}

// фильтры
export function isUsdtSpotSymbol(sym: string) {
  if (!sym.endsWith("USDT")) return false;
  const bad = ["UPUSDT", "DOWNUSDT", "BULLUSDT", "BEARUSDT", "HEDGEUSDT"];
  if (bad.some((b) => sym.endsWith(b))) return false;
  return true;
}

export function isStable(sym: string) {
  const stables = ["USDCUSDT", "TUSDUSDT", "FDUSDUSDT", "USDPUSDT", "DAIUSDT"];
  return stables.includes(sym);
}

// base asset extractor
export function baseAssetFromBinanceSymbol(symbol: string): string | null {
  const s = symbol.toUpperCase().trim();

  // MVP: hot-лист обычно USDT пары
  if (s.endsWith("USDT")) return s.slice(0, -4);

  // На будущее (если расширишь)
  const quotes = ["USDC", "BUSD", "FDUSD", "TUSD", "BTC", "ETH"];
  for (const q of quotes) {
    if (s.endsWith(q)) return s.slice(0, -q.length);
  }

  return null;
}

// --- price (spot) cached ---
const priceCache = new TTLCache<number>(1_000, 8000); // 1s TTL
const priceInFlight = new InFlight<number>();

export async function fetchPrice(symbol: string): Promise<number> {
  const url = `${BINANCE_BASE}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`;
  const res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });
  if (!res.ok) throw new Error(`price failed ${symbol} ${res.status}`);
  const j = await res.json();
  const obj = (typeof j === "object" && j !== null ? j : null) as Record<string, unknown> | null;
  return num(obj?.price, 0);
}

export async function fetchPriceCached(symbol: string): Promise<number> {
  const key = `p:${symbol}`;
  const cached = priceCache.get(key);
  if (cached != null && Number.isFinite(cached)) return cached;

  const inflight = priceInFlight.get(key);
  if (inflight) return inflight;

  const p = limit(async () => {
    const px = await fetchPrice(symbol);
    priceCache.set(key, px);
    return px;
  });

  priceInFlight.set(key, p);
  return p;
}

/**
 * ✅ Normalizes symbol from user input:
 * - trims
 * - uppercases
 * - removes non A-Z0-9
 */
export function normalizeSymbol(input: string) {
  return String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * ✅ Basic symbol validation for /symbol/[symbol] route
 * (keeps it permissive, but blocks obvious junk)
 */
export function isValidSymbol(input: string) {
  const sym = normalizeSymbol(input);
  if (!sym) return false;
  if (sym.length < 6 || sym.length > 20) return false;
  if (!/^[A-Z0-9]+$/.test(sym)) return false;
  return true;
}
