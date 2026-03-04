// lib/marketcap.ts
import { TTLCache, InFlight, fetchWithRetry } from "@/lib/server-cache";

export type MarketInfo = {
    cap: number;
    logoUrl?: string | null;
};

type CapMap = Map<string, MarketInfo>;

const capCache = new TTLCache<CapMap>(10 * 60_000, 5); // 10 минут
const capInFlight = new InFlight<CapMap>();

// ✅ последняя успешная карта (чтобы не “пропадала” при 429)
let lastGoodMap: CapMap | null = null;

function num(v: any, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

export async function getMarketCapMap(): Promise<CapMap> {
    const cacheKey = "mcap:coingecko:top750";

    const cached = capCache.get(cacheKey);
    if (cached && cached.size > 0) return cached;

    const inflight = capInFlight.get(cacheKey);
    if (inflight) return inflight;

    const p = (async () => {
        try {
            const map = await fetchCoinGeckoTopCapMap({ pages: 3, perPage: 250 });

            // ✅ если получилось что-то адекватное — сохраняем как lastGood
            if (map.size > 50) {
                lastGoodMap = map;
                capCache.set(cacheKey, map);
                return map;
            }

            // ⚠️ если карта слишком маленькая — возвращаем lastGood (если есть)
            if (lastGoodMap && lastGoodMap.size > 0) return lastGoodMap;

            // иначе вернём что есть (пусть даже пусто)
            capCache.set(cacheKey, map);
            return map;
        } catch (e: any) {
            console.log("[mcap] getMarketCapMap failed:", String(e?.message ?? e));
            // ✅ при ошибке — не “обнуляем” капитализацию
            if (lastGoodMap && lastGoodMap.size > 0) return lastGoodMap;
            // если есть хоть какой-то cached (даже пустой) — его
            const c = capCache.get(cacheKey);
            if (c) return c;
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
        } catch (e: any) {
            console.log("[mcap] CoinGecko fetch error:", String(e?.message ?? e));
            break;
        }

        console.log("[mcap] CoinGecko status:", res.status, "page", page);

        // ✅ при 429 — НЕ возвращаем пустую карту, просто прекращаем цикл
        if (res.status === 429) break;

        if (!res.ok) break;

        const json = (await res.json()) as any[];
        if (!Array.isArray(json) || json.length === 0) break;

        for (const row of json) {
            const sym = String(row?.symbol ?? "").trim().toUpperCase();
            const cap = num(row?.market_cap, 0);
            const logoUrl = typeof row?.image === "string" && row.image.trim() ? row.image.trim() : null;

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