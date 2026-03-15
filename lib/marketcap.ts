// lib/marketcap.ts
import { TTLCache, InFlight, fetchWithRetry } from "@/lib/server-cache";
import { cacheGet, cacheSet, cacheSweepExpired } from "@/lib/repos/cacheRepo";

export type MarketInfo = {
    cap: number;
    logoUrl?: string | null;
};

type CapMap = Map<string, MarketInfo>;

const capCache = new TTLCache<CapMap>(10 * 60_000, 5); // 10 минут
const capInFlight = new InFlight<CapMap>();

// ✅ последняя успешная карта (чтобы не “пропадала” при 429)
let lastGoodMap: CapMap | null = null;
let lastGoodMapTop1000: CapMap | null = null;

function num(v: unknown, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

type MarketInfoEntry = [string, MarketInfo];

function toEntries(map: CapMap): MarketInfoEntry[] {
    return Array.from(map.entries());
}

function fromEntries(entries: unknown): CapMap | null {
    if (!Array.isArray(entries)) return null;
    const out: CapMap = new Map();
    for (const item of entries) {
        if (!Array.isArray(item) || item.length < 2) continue;
        const sym = String(item[0] ?? "").trim().toUpperCase();
        const v = item[1];
        if (!sym || !v || typeof v !== "object") continue;
        const obj = v as Record<string, unknown>;
        const cap = Number(obj.cap ?? 0);
        if (!Number.isFinite(cap) || cap <= 0) continue;
        const logoUrl = typeof obj.logoUrl === "string" ? obj.logoUrl : null;
        out.set(sym, { cap, logoUrl });
    }
    return out.size > 0 ? out : null;
}

export async function getMarketCapMap(): Promise<CapMap> {
    const cacheKey = "mcap:coingecko:top750";

    const cached = capCache.get(cacheKey);
    if (cached && cached.size > 0) return cached;

    const sqliteCached = fromEntries(cacheGet<unknown>(`sql:${cacheKey}`));
    if (sqliteCached && sqliteCached.size > 0) {
        capCache.set(cacheKey, sqliteCached, 10 * 60_000);
        lastGoodMap = sqliteCached;
        return sqliteCached;
    }

    const inflight = capInFlight.get(cacheKey);
    if (inflight) return inflight;

    const p = (async () => {
        try {
            const map = await fetchCoinGeckoTopCapMap({ pages: 3, perPage: 250 });

            // ✅ если получилось что-то адекватное — сохраняем как lastGood
            if (map.size > 50) {
                lastGoodMap = map;
                capCache.set(cacheKey, map);
                cacheSet(`sql:${cacheKey}`, toEntries(map), 12 * 60 * 60_000);
                cacheSweepExpired(200);
                return map;
            }

            // ⚠️ если карта слишком маленькая — возвращаем lastGood (если есть)
            if (lastGoodMap && lastGoodMap.size > 0) return lastGoodMap;

            // иначе вернём что есть (пусть даже пусто)
            capCache.set(cacheKey, map);
            if (map.size > 0) {
                cacheSet(`sql:${cacheKey}`, toEntries(map), 6 * 60 * 60_000);
            }
            return map;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.log("[mcap] getMarketCapMap failed:", msg);
            // ✅ при ошибке — не “обнуляем” капитализацию
            if (lastGoodMap && lastGoodMap.size > 0) return lastGoodMap;
            // если есть хоть какой-то cached (даже пустой) — его
            const c = capCache.get(cacheKey);
            if (c) return c;
            const sql = fromEntries(cacheGet<unknown>(`sql:${cacheKey}`));
            if (sql && sql.size > 0) return sql;
            return new Map();
        }
    })();

    capInFlight.set(cacheKey, p);
    return p;
}

export async function getMarketCapMapTop1000(): Promise<CapMap> {
    const cacheKey = "mcap:coingecko:top1000";

    const cached = capCache.get(cacheKey);
    if (cached && cached.size > 0) return cached;

    const sqliteCached = fromEntries(cacheGet<unknown>(`sql:${cacheKey}`));
    if (sqliteCached && sqliteCached.size > 0) {
        capCache.set(cacheKey, sqliteCached, 10 * 60_000);
        lastGoodMapTop1000 = sqliteCached;
        return sqliteCached;
    }

    const inflight = capInFlight.get(cacheKey);
    if (inflight) return inflight;

    const p = (async () => {
        try {
            const map = await fetchCoinGeckoTopCapMap({ pages: 4, perPage: 250 });
            if (map.size > 50) {
                lastGoodMapTop1000 = map;
                capCache.set(cacheKey, map);
                cacheSet(`sql:${cacheKey}`, toEntries(map), 12 * 60 * 60_000);
                cacheSweepExpired(200);
                return map;
            }

            if (lastGoodMapTop1000 && lastGoodMapTop1000.size > 0) return lastGoodMapTop1000;

            capCache.set(cacheKey, map);
            if (map.size > 0) {
                cacheSet(`sql:${cacheKey}`, toEntries(map), 6 * 60 * 60_000);
            }
            return map;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.log("[mcap] getMarketCapMapTop1000 failed:", msg);
            if (lastGoodMapTop1000 && lastGoodMapTop1000.size > 0) return lastGoodMapTop1000;
            const c = capCache.get(cacheKey);
            if (c) return c;
            const sql = fromEntries(cacheGet<unknown>(`sql:${cacheKey}`));
            if (sql && sql.size > 0) return sql;
            return new Map();
        }
    })();

    capInFlight.set(cacheKey, p);
    return p;
}

async function fetchCoinGeckoTopCapMap(opts: { pages: number; perPage: number }): Promise<CapMap> {
    const pages = Math.max(1, Math.min(4, opts.pages)); // не больше 4 страниц
    const perPage = Math.max(50, Math.min(250, opts.perPage));

    const out: CapMap = new Map();

    for (let page = 1; page <= pages; page++) {
        const url =
            "https://api.coingecko.com/api/v3/coins/markets" +
            `?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}` +
            "&sparkline=false";

        let res: Response;
        try {
            res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.log("[mcap] CoinGecko fetch error:", msg);
            break;
        }

        console.log("[mcap] CoinGecko status:", res.status, "page", page);

        // ✅ при 429 — НЕ возвращаем пустую карту, просто прекращаем цикл
        if (res.status === 429) break;

        if (!res.ok) break;

        const json = (await res.json()) as unknown;
        if (!Array.isArray(json) || json.length === 0) break;

        for (const row of json) {
            if (!row || typeof row !== "object") continue;
            const obj = row as Record<string, unknown>;
            const sym = String(obj.symbol ?? "").trim().toUpperCase();
            const cap = num(obj.market_cap, 0);
            const image = typeof obj.image === "string" ? obj.image : "";
            const logoUrl = image.trim() ? image.trim() : null;

            if (!sym || cap <= 0) continue;

            // берём первый (топовый) вариант по market cap, остальные игнорируем
            if (!out.has(sym)) out.set(sym, { cap, logoUrl });
        }

        if (json.length < perPage) break;
    }

    console.log(
        "[mcap] CoinGecko map size:",
        out.size,
        "BTC cap:",
        out.get("BTC")?.cap,
        "ETH cap:",
        out.get("ETH")?.cap
    );
    return out;
}
