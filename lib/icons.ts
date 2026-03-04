// lib/icons.ts
import { TTLCache, InFlight, fetchWithRetry } from "@/lib/server-cache";
import { cacheGet, cacheSet, cacheSweepExpired } from "@/lib/repos/cacheRepo";

const ccCache = new TTLCache<Map<string, string>>(24 * 60 * 60 * 1000, 2);
const ccInFlight = new InFlight<Map<string, string>>();

async function fetchCryptoCompareMap(): Promise<Map<string, string>> {
    const key = "cryptocompare:coinlist";
    const cached = ccCache.get(key);
    if (cached) return cached;
    const sqliteCached = cacheGet<Array<[string, string]>>(`sql:${key}`);
    if (Array.isArray(sqliteCached) && sqliteCached.length > 0) {
        const m = new Map<string, string>(sqliteCached);
        ccCache.set(key, m, 24 * 60 * 60 * 1000);
        return m;
    }

    const inflight = ccInFlight.get(key);
    if (inflight) return inflight;

    const p = (async () => {
        const url = "https://min-api.cryptocompare.com/data/all/coinlist?summary=true";
        const res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });
        if (!res.ok) throw new Error(`cryptocompare coinlist failed ${res.status}`);
        const json = (await res.json()) as unknown;
        const obj = json && typeof json === "object" ? (json as Record<string, unknown>) : null;

        const data = obj?.Data && typeof obj.Data === "object" ? (obj.Data as Record<string, unknown>) : {};
        const m = new Map<string, string>();

        for (const [sym, val] of Object.entries(data)) {
            const s = String(sym || "").toUpperCase();
            const row = val && typeof val === "object" ? (val as Record<string, unknown>) : null;
            const img = row && typeof row.ImageUrl === "string" ? row.ImageUrl : "";
            if (s && img) {
                m.set(s, `https://www.cryptocompare.com${img}`);
            }
        }

        ccCache.set(key, m, 24 * 60 * 60 * 1000);
        cacheSet(`sql:${key}`, Array.from(m.entries()), 24 * 60 * 60 * 1000);
        cacheSweepExpired(200);
        return m;
    })();

    ccInFlight.set(key, p);
    return p;
}

export async function getIconUrl(baseAsset: string): Promise<string | null> {
    const sym = String(baseAsset || "").toUpperCase().trim();
    if (!sym) return null;

    try {
        const m = await fetchCryptoCompareMap();
        return m.get(sym) ?? null;
    } catch {
        return null;
    }
}
