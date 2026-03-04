// lib/cryptobubbles.ts
import { TTLCache, InFlight } from "@/lib/server-cache";

/**
 * CryptoBubbles public backend JSON (неофициальный endpoint).
 * Важно: иногда серверы режут запросы без User-Agent — поэтому добавляем headers.
 */
const CB_URL = "https://cryptobubbles.net/backend/data/bubbles1000.usd.json";

type AnyObj = Record<string, unknown>;

const cache = new TTLCache<Map<string, number>>(10 * 60_000, 2); // 10 минут
const inflight = new InFlight<Map<string, number>>();

function pickMcap(x: unknown): number | null {
    const o = x && typeof x === "object" ? (x as AnyObj) : null;
    const v = Number(
        o?.marketCap ??
        o?.market_cap ??
        o?.mcap ??
        o?.marketcap ??
        o?.cap ??
        o?.market_cap_usd
    );
    return Number.isFinite(v) && v > 0 ? v : null;
}

function extractArray(json: unknown): unknown[] {
    if (Array.isArray(json)) return json;

    // иногда кладут массив в поле
    if (json && typeof json === "object") {
        const obj = json as AnyObj;
        if (Array.isArray(obj.data)) return obj.data;
        if (Array.isArray(obj.coins)) return obj.coins;
        if (Array.isArray(obj.items)) return obj.items;
        if (Array.isArray(obj.bubbles)) return obj.bubbles;
    }
    return [];
}

export async function getMarketCapsCached(): Promise<Map<string, number>> {
    const key = "cb:mcap:v2";
    const cached = cache.get(key);
    if (cached) return cached;

    const inF = inflight.get(key);
    if (inF) return inF;

    const p = (async () => {
        const res = await fetch(CB_URL, {
            cache: "no-store",
            headers: {
                "accept": "application/json,text/plain,*/*",
                "user-agent":
                    "terminal-scanner-2/1.0 (+https://localhost) NodeFetch",
            },
        });

        if (!res.ok) throw new Error(`CryptoBubbles HTTP ${res.status}`);

        // иногда лучше парсить через text -> JSON
        const txt = await res.text();
        let json: unknown;
        try {
            json = JSON.parse(txt);
        } catch {
            throw new Error("CryptoBubbles: invalid JSON");
        }

        const arr = extractArray(json);
        const map = new Map<string, number>();

        for (const c of arr) {
            const o = c && typeof c === "object" ? (c as AnyObj) : null;
            const sym = String(o?.symbol ?? o?.sym ?? "").toUpperCase().trim();
            const mcap = pickMcap(o);
            if (!sym || !mcap) continue;
            map.set(sym, mcap);
        }

        cache.set(key, map, 10 * 60_000);
        return map;
    })();

    inflight.set(key, p);
    return p;
}
