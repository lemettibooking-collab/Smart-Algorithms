// lib/mexc-marketcap.ts
import { TTLCache, InFlight, createLimiter, fetchWithRetry } from "@/lib/server-cache";

export const MEXC_WEB_BASE = "https://www.mexc.com";

type MexcCap = { capUsd: number | null; raw?: string | null; source?: string | null };

// Cache: success 30m, failures 5m
const capCache = new TTLCache<MexcCap>(30 * 60_000, 8000);
const capInFlight = new InFlight<MexcCap>();

// Web scraping should be gentle
const webLimit = createLimiter(2);

function withTimeout(ms = 4_500) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return {
        signal: ctrl.signal,
        clear: () => clearTimeout(timer),
    };
}

/**
 * Parses strings like:
 *  - "628,60M" (EU decimal comma)
 *  - "628.60M"
 *  - "3,066,912.07"
 *  - "$ 23.89M"
 *  - "14.7K"
 */
function parseCompactUsd(input: string): number | null {
    let t = String(input ?? "").trim();
    if (!t) return null;

    // remove currency and spaces
    t = t.replace(/\$/g, "").replace(/\s+/g, "");

    // If contains suffix K/M/B/T, handle decimal separators carefully
    const sufMatch = t.match(/^([0-9.,]+)([KMBT])$/i);
    if (sufMatch) {
        let numPart = sufMatch[1];
        const suf = sufMatch[2].toUpperCase();

        // EU decimal comma case: only comma present and it's likely decimal (1-2 digits after)
        if (numPart.includes(",") && !numPart.includes(".")) {
            const parts = numPart.split(",");
            if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
                numPart = `${parts[0]}.${parts[1]}`; // "628,60" -> "628.60"
            } else {
                // treat commas as thousands separators
                numPart = numPart.replace(/,/g, "");
            }
        } else {
            // has dot or multiple separators -> treat commas as thousands separators
            numPart = numPart.replace(/,/g, "");
        }

        const n = Number(numPart);
        if (!Number.isFinite(n) || n <= 0) return null;

        const mult =
            suf === "K" ? 1e3 :
                suf === "M" ? 1e6 :
                    suf === "B" ? 1e9 :
                        suf === "T" ? 1e12 :
                            1;

        return n * mult;
    }

    // No suffix: parse as full number (commas as thousands)
    // If only comma and no dot, and looks like decimal comma with 1-2 digits after → convert
    if (t.includes(",") && !t.includes(".")) {
        const parts = t.split(",");
        if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
            t = `${parts[0]}.${parts[1]}`;
        } else {
            t = t.replace(/,/g, "");
        }
    } else {
        t = t.replace(/,/g, "");
    }

    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function extractNextDataJson(html: string): unknown {
    const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!m?.[1]) return null;
    try {
        return JSON.parse(m[1]);
    } catch {
        return null;
    }
}

/**
 * More reliable extraction:
 * 1) First try to extract explicit market cap strings near "Market Cap"
 * 2) Then fallback to scanning __NEXT_DATA__ recursively for keys containing "marketcap"
 */
function extractMarketCapFromHtml(html: string): { raw: string | number | null; source: string | null } {
    const text = String(html ?? "");
    if (!text) return { raw: null, source: null };

    // A) Strong regex around "Market Cap" label, allow both dot and comma decimals
    // e.g. "Market Cap $628,60M" / "$ 628.60M"
    const re1 = /Market\s*Cap[\s\S]{0,200}?\$\s*([0-9.,]+\s*[KMBT]?)/i;
    const m1 = text.match(re1);
    if (m1?.[1]) return { raw: String(m1[1]).trim().replace(/\s+/g, ""), source: "label_regex" };

    // B) Some pages may use "Market cap is X USD"
    const re2 = /market\s*cap\s*is\s*([0-9.,]+\s*[KMBT]?)\s*USD/i;
    const m2 = text.match(re2);
    if (m2?.[1]) return { raw: String(m2[1]).trim().replace(/\s+/g, ""), source: "phrase_regex" };

    // C) __NEXT_DATA__ deep scan
    const next = extractNextDataJson(text);
    if (next) {
        const seen = new Set<unknown>();
        const walk = (v: unknown): string | number | null => {
            if (v == null) return null;
            if (typeof v !== "object") return null;
            if (seen.has(v)) return null;
            seen.add(v);

            for (const [k, val] of Object.entries(v)) {
                const key = String(k).toLowerCase();
                if (key.includes("marketcap")) {
                    if (typeof val === "number") return val;
                    if (typeof val === "string") return val;
                }
                if (val && typeof val === "object") {
                    const got = walk(val);
                    if (got != null) return got;
                }
            }
            return null;
        };

        const got = walk(next);
        if (got != null) return { raw: got, source: "__NEXT_DATA__" };
    }

    return { raw: null, source: null };
}

export async function fetchMexcMarketCapUsd(baseAsset: string): Promise<MexcCap> {
    const sym = String(baseAsset ?? "").trim().toUpperCase();
    if (!sym) return { capUsd: null, raw: null, source: null };

    const key = `mexc:webcap:${sym}`;
    const cached = capCache.get(key);
    if (cached) return cached;

    const inflight = capInFlight.get(key);
    if (inflight) return inflight;

    const p = webLimit(async () => {
        const url = `${MEXC_WEB_BASE}/price/${encodeURIComponent(sym)}`;
        const to = withTimeout();
        const res = await (async () => {
            try {
                return await fetchWithRetry(
                    url,
                    {
                        method: "GET",
                        cache: "no-store",
                        signal: to.signal,
                        headers: {
                            "User-Agent": "Mozilla/5.0",
                            "Accept": "text/html,application/xhtml+xml",
                            // Some edge cases respond differently without language
                            "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
                        },
                    },
                    { retries: 1 }
                );
            } finally {
                to.clear();
            }
        })();

        if (!res.ok) {
            const out = { capUsd: null, raw: null, source: `http_${res.status}` };
            capCache.set(key, out, 5 * 60_000);
            return out;
        }

        const html = await res.text();

        const { raw, source } = extractMarketCapFromHtml(html);

        let capUsd: number | null = null;
        if (typeof raw === "number") capUsd = raw;
        if (typeof raw === "string") capUsd = parseCompactUsd(raw);

        // ✅ sanity: ignore tiny “caps” (usually scraping noise)
        if (!(capUsd && Number.isFinite(capUsd) && capUsd >= 1_000_000)) {
            capUsd = null;
        }

        const out: MexcCap = {
            capUsd,
            raw: raw != null ? String(raw) : null,
            source,
        };

        capCache.set(key, out, capUsd ? 30 * 60_000 : 5 * 60_000);
        return out;
    });

    capInFlight.set(key, p);
    return p;
}
