// lib/mexc.ts
import { TTLCache, InFlight, createLimiter, fetchWithRetry } from "@/lib/server-cache";

export const MEXC_BASE = "https://api.mexc.com";

export type Candle = {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;

    volume: number; // base vol
    closeTime: number;

    quoteVolume: number; // quote vol
    trades?: number;
    takerBuyBase?: number;
    takerBuyQuote?: number;
};

function num(v: unknown, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

// ✅ MEXC лучше не долбить параллельностью
const limit = createLimiter(6);

// -------------------- exchangeInfo + symbol normalize --------------------
const infoCache = new TTLCache<unknown>(60_000, 4);
const infoInFlight = new InFlight<unknown>();

function makeHttpError(message: string, status: number) {
    const err = new Error(message) as Error & { status?: number };
    err.status = status;
    return err;
}

export async function fetchExchangeInfoCached() {
    const key = "mexc:exchangeInfo";
    const cached = infoCache.get(key);
    if (cached) return cached;

    const inflight = infoInFlight.get(key);
    if (inflight) return inflight;

    const p = limit(async () => {
        const url = `${MEXC_BASE}/api/v3/exchangeInfo`;
        const res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });
        if (!res.ok) throw makeHttpError(`mexc exchangeInfo failed ${res.status}`, res.status);
        const json = await res.json();
        infoCache.set(key, json, 60_000);
        return json;
    });

    infoInFlight.set(key, p);
    return p;
}

// кэш мапы symbol -> { symbol, baseAsset }
const symMetaCache = new TTLCache<Map<string, { symbol: string; baseAsset: string }>>(60_000, 2);
const symMetaInFlight = new InFlight<Map<string, { symbol: string; baseAsset: string }>>();

async function getSymbolMetaMap(): Promise<Map<string, { symbol: string; baseAsset: string }>> {
    const key = "mexc:symbolMetaMap";
    const cached = symMetaCache.get(key);
    if (cached) return cached;

    const inflight = symMetaInFlight.get(key);
    if (inflight) return inflight;

    const p = limit(async () => {
        const info = await fetchExchangeInfoCached();
        const infoObj = (typeof info === "object" && info !== null ? info : null) as Record<string, unknown> | null;
        const symbols = Array.isArray(infoObj?.symbols) ? infoObj.symbols : [];

        const m = new Map<string, { symbol: string; baseAsset: string }>();
        for (const s of symbols) {
            const so = (typeof s === "object" && s !== null ? s : null) as Record<string, unknown> | null;
            const sym = String(so?.symbol ?? "").toUpperCase();
            if (!sym) continue;
            const base = String(so?.baseAsset ?? "").toUpperCase();
            m.set(sym, { symbol: sym, baseAsset: base || sym });
            // иногда в UI/источниках может быть AAA_USDT
            m.set(sym.replace("_", ""), { symbol: sym, baseAsset: base || sym });
        }

        symMetaCache.set(key, m, 60_000);
        return m;
    });

    symMetaInFlight.set(key, p);
    return p;
}

/** ✅ нормализует symbol под спот MEXC */
export async function normalizeMexcSymbol(symbol: string): Promise<string | null> {
    const sym = String(symbol ?? "").trim().toUpperCase();
    if (!sym) return null;

    try {
        const m = await getSymbolMetaMap();
        return m.get(sym)?.symbol ?? m.get(sym.replace("_", ""))?.symbol ?? null;
    } catch {
        // если exchangeInfo временно недоступен — пробуем как есть
        return sym;
    }
}

/** ✅ достаёт baseAsset из exchangeInfo (если нет — null) */
export async function getMexcBaseAsset(symbol: string): Promise<string | null> {
    const sym = String(symbol ?? "").trim().toUpperCase();
    if (!sym) return null;
    try {
        const m = await getSymbolMetaMap();
        return m.get(sym)?.baseAsset ?? m.get(sym.replace("_", ""))?.baseAsset ?? null;
    } catch {
        return null;
    }
}

// -------------------- intervals / caches --------------------

// ✅ MEXC interval mapping: fix sparkline for 1h and 1w
export function normalizeMexcInterval(interval: string) {
    const raw = String(interval ?? "").trim();
    const low = raw.toLowerCase();

    // canonical -> mexc
    if (low === "1h") return "60m";
    if (low === "2h") return "120m";
    if (low === "1w") return "1W";

    // already-mexc forms
    if (low === "60m") return "60m";
    if (low === "120m") return "120m";
    if (raw === "1W") return "1W";

    // keep as-is (1m/3m/5m/15m/30m/4h/1d/1M etc.)
    return raw;
}

// TTL should respect aliases too
function klinesTtlMs(tf: string) {
    const t0 = String(tf ?? "").trim();
    const t = t0.toLowerCase();

    if (t === "1m") return 1200;
    if (t === "3m") return 1500;
    if (t === "5m") return 2500;
    if (t === "15m") return 5000;
    if (t === "30m") return 8000;

    if (t === "1h" || t === "60m") return 15_000;
    if (t === "2h" || t === "120m") return 20_000;
    if (t === "4h") return 30_000;
    if (t === "6h") return 40_000;
    if (t === "8h") return 45_000;
    if (t === "12h") return 60_000;

    if (t === "1d") return 120_000;
    if (t === "3d") return 180_000;

    // 1w can arrive as "1w" or "1W"
    if (t0 === "1W" || t === "1w") return 300_000;

    if (t0 === "1M" || t === "1m") return 600_000;

    return 15_000;
}

const klinesCache = new TTLCache<Candle[]>(30_000, 8000);
const klinesInFlight = new InFlight<Candle[]>();

export function isValidInterval(tf: string) {
    const raw = String(tf ?? "").trim();
    const t = raw.toLowerCase();

    // canonical
    if (
        t === "1m" || t === "3m" || t === "5m" || t === "15m" || t === "30m" ||
        t === "1h" || t === "2h" || t === "4h" || t === "6h" || t === "8h" || t === "12h" ||
        t === "1d" || t === "3d" || t === "1w" || raw === "1M"
    ) return true;

    // mexc aliases
    if (t === "60m" || t === "120m") return true;
    if (raw === "1W") return true;

    return false;
}

export async function fetch24hTicker(): Promise<unknown[]> {
    const url = `${MEXC_BASE}/api/v3/ticker/24hr`;
    const res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });
    if (!res.ok) throw makeHttpError(`mexc ticker failed ${res.status}`, res.status);
    const json = await res.json();
    return Array.isArray(json) ? json : [];
}

/**
 * ✅ Устойчивый парсер klines:
 * - поддерживает массив массивов (как на твоём скрине: 8+ полей)
 * - если пришёл объект с ошибкой — кидаем понятную ошибку
 */
export async function fetchKlines(symbol: string, interval: string, limitN: number): Promise<Candle[]> {
    const tf = String(interval ?? "").trim();
    if (!isValidInterval(tf)) throw new Error(`invalid interval: ${tf}`);

    // ✅ Always call MEXC with normalized interval
    const mexcTf = normalizeMexcInterval(tf);

    const url =
        `${MEXC_BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}` +
        `&interval=${encodeURIComponent(mexcTf)}&limit=${limitN}`;

    const res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });
    if (!res.ok) throw makeHttpError(`mexc klines failed ${symbol} ${mexcTf} ${res.status}`, res.status);

    const json = await res.json();

    if (Array.isArray(json)) {
        const raw = json as unknown[];
        return raw.map((r) => ({
            openTime: num(Array.isArray(r) ? r[0] : undefined),
            open: num(Array.isArray(r) ? r[1] : undefined),
            high: num(Array.isArray(r) ? r[2] : undefined),
            low: num(Array.isArray(r) ? r[3] : undefined),
            close: num(Array.isArray(r) ? r[4] : undefined),
            volume: num(Array.isArray(r) ? r[5] : undefined),
            closeTime: num(Array.isArray(r) ? r[6] : undefined),
            quoteVolume: num(Array.isArray(r) ? r[7] : undefined),

            trades: Number.isFinite(Number(Array.isArray(r) ? r[8] : undefined)) ? Number(Array.isArray(r) ? r[8] : undefined) : undefined,
            takerBuyBase: Number.isFinite(Number(Array.isArray(r) ? r[9] : undefined)) ? Number(Array.isArray(r) ? r[9] : undefined) : undefined,
            takerBuyQuote: Number.isFinite(Number(Array.isArray(r) ? r[10] : undefined)) ? Number(Array.isArray(r) ? r[10] : undefined) : undefined,
        }));
    }

    const obj = (typeof json === "object" && json !== null ? json : null) as Record<string, unknown> | null;
    const code = obj?.code;
    const msg = obj?.msg || obj?.message;
    if (code != null || msg) {
        throw new Error(`mexc klines error ${symbol} ${mexcTf}: code=${code ?? "?"} msg=${msg ?? "unknown"}`);
    }

    throw new Error(`mexc klines unexpected payload for ${symbol} ${mexcTf}`);
}

/**
 * ✅ Cached + in-flight + symbol normalization
 * Cache-key is based on canonical interval (what API/UI passes),
 * but request uses normalized MEXC interval.
 */
export async function fetchKlinesCached(symbol: string, interval: string, limitN: number) {
    const tf = String(interval ?? "").trim();
    if (!isValidInterval(tf)) throw new Error(`invalid interval: ${tf}`);

    const norm = await normalizeMexcSymbol(symbol);
    if (!norm) return [];

    const key = `m:k:${norm}:${tf}:${limitN}`;

    const cached = klinesCache.get(key);
    if (cached) return cached;

    const inflight = klinesInFlight.get(key);
    if (inflight) return inflight;

    const p = limit(async () => {
        const candles = await fetchKlines(norm, tf, limitN);
        klinesCache.set(key, candles, klinesTtlMs(tf));
        return candles;
    });

    klinesInFlight.set(key, p);
    return p;
}

export function isUsdtSpotSymbol(sym: string) {
    const s = String(sym ?? "").toUpperCase();
    if (!s.endsWith("USDT")) return false;
    const bad = ["UPUSDT", "DOWNUSDT", "BULLUSDT", "BEARUSDT", "HEDGEUSDT"];
    if (bad.some((b) => s.endsWith(b))) return false;
    return true;
}
