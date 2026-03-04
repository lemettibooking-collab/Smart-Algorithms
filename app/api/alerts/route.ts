// app/api/alerts/route.ts
import { NextResponse } from "next/server";
import { TTLCache, InFlight } from "@/lib/server-cache";

export const runtime = "nodejs";

type Exchange = "binance" | "mexc";
type Sort = "score" | "change" | "change24h" | "spike";

type HotRow = {
    exchange: Exchange;
    symbol: string;
    baseAsset?: string | null;

    price: number;

    changePercent?: number;
    change24hPercent?: number;

    volSpike?: number | null;
    quoteVol24h?: number;
    quoteVolume24h?: number;
    volumeQuote24h?: number;
    volumeRaw?: number;

    score?: number;
    signal?: string;

    logoUrl?: string | null;
    iconUrl?: string | null;

    marketCapRaw?: number | null;
    marketCap?: string;
};

type HotResponse = {
    data?: HotRow[];
    ts?: number;
    mode?: string;
    degraded?: boolean;
    degradeReason?: string;
    ws?: unknown;
};

type AlertRow = {
    id: string;
    bucketTs: number;
    ts: number;
    tf: string;

    baseAsset: string;
    exchange: Exchange;
    symbol: string;

    price: number;
    score: number;
    signal: string;

    changePercent: number;
    change24hPercent: number;

    volSpike: number | null;
    quoteVol24h?: number;

    marketCapRaw: number | null;
    marketCap?: string;

    logoUrl?: string | null;
    iconUrl?: string | null;

    mergedFrom?: Array<{ exchange: Exchange; symbol: string; score: number }>;
};

type AlertsPayload = {
    tf: string;
    ts: number;
    data: AlertRow[];
    sources?: unknown;
    error?: string;
    cache: { hit: boolean; ttlMs: number };
};

const TTL_MS = 5000;
const alertsCache = new TTLCache<AlertsPayload>(TTL_MS, 2000);
const alertsInFlight = new InFlight<AlertsPayload>();

function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
}

function isNonCalm(signal: string | undefined) {
    const s = String(signal ?? "").toLowerCase();
    return !!s && s !== "calm";
}

function normalizeScore(x: unknown) {
    const n = Number(x ?? 0);
    if (!Number.isFinite(n)) return 0;
    return clamp(n, 0, 10);
}

function bucketTsForTf(ts: number, tf: string): number {
    const raw = String(tf ?? "").trim();
    const t = raw.toLowerCase();
    const minuteMap: Record<string, number> = {
        "1m": 60_000,
        "3m": 3 * 60_000,
        "5m": 5 * 60_000,
        "15m": 15 * 60_000,
        "30m": 30 * 60_000,
        "1h": 60 * 60_000,
        "2h": 2 * 60 * 60_000,
        "4h": 4 * 60 * 60_000,
        "6h": 6 * 60 * 60_000,
        "12h": 12 * 60 * 60_000,
        "1d": 24 * 60 * 60_000,
        "24h": 24 * 60 * 60_000,
        "1w": 7 * 24 * 60 * 60_000,
        "1month": 30 * 24 * 60 * 60_000,
    };
    const ms = raw === "1M" ? minuteMap["1month"] : minuteMap[t];
    if (!ms || !Number.isFinite(ms) || ms <= 0) return ts;
    return Math.floor(ts / ms) * ms;
}

function toAlertRow(row: HotRow, tf: string, ts: number): AlertRow {
    const score = normalizeScore(row.score);
    const signal = String(row.signal ?? "Calm");

    const changePercent = Number(row.changePercent ?? 0) || 0;
    const change24hPercent = Number(row.change24hPercent ?? 0) || 0;

    const v = row.volSpike;
    const volSpike = v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null);

    const marketCapRaw =
        row.marketCapRaw == null
            ? null
            : Number.isFinite(Number(row.marketCapRaw))
                ? Number(row.marketCapRaw)
                : null;
    const quoteVol24hRaw = Number(
        row.quoteVol24h ?? row.quoteVolume24h ?? row.volumeQuote24h ?? row.volumeRaw ?? Number.NaN
    );
    const quoteVol24h = Number.isFinite(quoteVol24hRaw) && quoteVol24hRaw > 0 ? quoteVol24hRaw : undefined;

    const baseAsset = String(row.baseAsset ?? "").trim().toUpperCase();
    const bucketTs = bucketTsForTf(ts, tf);
    const id = `${baseAsset}:${tf}:${bucketTs}`;

    return {
        id,
        bucketTs,
        ts,
        tf,
        baseAsset,
        exchange: row.exchange,
        symbol: String(row.symbol ?? "").trim().toUpperCase(),
        price: Number(row.price ?? 0) || 0,
        score,
        signal,
        changePercent,
        change24hPercent,
        volSpike,
        quoteVol24h,
        marketCapRaw,
        marketCap: row.marketCap,
        logoUrl: row.logoUrl ?? null,
        iconUrl: row.iconUrl ?? null,
    };
}

function dedupeByKeyPreferBinance(rows: AlertRow[]) {
    const byKey = new Map<string, AlertRow>();

    for (const r of rows) {
        const k = String(r.id ?? "");
        if (!k) continue;

        const prev = byKey.get(k);
        if (!prev) {
            byKey.set(k, r);
            continue;
        }

        const prevIsBinance = prev.exchange === "binance";
        const curIsBinance = r.exchange === "binance";

        let chosen = prev;
        let other = r;

        if (curIsBinance && !prevIsBinance) {
            chosen = r;
            other = prev;
        } else if (curIsBinance === prevIsBinance) {
            if ((r.score ?? 0) > (prev.score ?? 0)) {
                chosen = r;
                other = prev;
            }
        }

        const mergedFrom = [
            ...(chosen.mergedFrom ?? []),
            { exchange: other.exchange, symbol: other.symbol, score: other.score },
        ];

        byKey.set(k, { ...chosen, mergedFrom });
    }

    return Array.from(byKey.values());
}

async function safeJson<T>(res: Response): Promise<T | null> {
    try {
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

function sortRows(rows: AlertRow[], sort: Sort) {
    rows.sort((a, b) => {
        if (sort === "change") return Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0);
        if (sort === "change24h") return Math.abs(b.change24hPercent ?? 0) - Math.abs(a.change24hPercent ?? 0);
        if (sort === "spike") return (b.volSpike ?? 0) - (a.volSpike ?? 0);

        // default: score
        const ds = (b.score ?? 0) - (a.score ?? 0);
        if (ds !== 0) return ds;
        return Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0);
    });
}

export async function GET(req: Request) {
    const url = new URL(req.url);

    const tf = url.searchParams.get("tf") ?? "15m";
    const includeCalm = url.searchParams.get("includeCalm") === "1";
    const minScore = Number(url.searchParams.get("minScore") ?? "0") || 0;
    const limit = clamp(Number(url.searchParams.get("limit") ?? "150") || 150, 1, 300);

    const dedupe = url.searchParams.get("dedupe") !== "0"; // default true
    const sort = (url.searchParams.get("sort") ?? "score") as Sort;

    const signalsParam = url.searchParams.get("signals");
    const allowSignals = new Set(
        String(signalsParam ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
    );

    const hotParams = new URLSearchParams();
    hotParams.set("tf", tf);
    hotParams.set("limit", String(limit));
    hotParams.set("includeStables", url.searchParams.get("includeStables") ?? "0");
    if (url.searchParams.has("minVol")) hotParams.set("minVol", url.searchParams.get("minVol")!);

    const cacheKey =
        `alerts:v4:${hotParams.toString()}` +
        `:includeCalm=${includeCalm}` +
        `:minScore=${minScore}` +
        `:limit=${limit}` +
        `:dedupe=${dedupe ? 1 : 0}` +
        `:sort=${sort}` +
        `:signals=${Array.from(allowSignals).sort().join("|")}`;

    const cached = alertsCache.get(cacheKey);
    if (cached) return NextResponse.json({ ...cached, cache: { hit: true } });

    const inflight = alertsInFlight.get(cacheKey);
    if (inflight) return NextResponse.json(await inflight);

    const p = (async () => {
        const now = Date.now();
        try {
            const origin = new URL(req.url).origin;

            const binanceUrl = new URL("/api/hot", origin);
            binanceUrl.search = `exchange=binance&${hotParams.toString()}`;

            const mexcUrl = new URL("/api/hot", origin);
            mexcUrl.search = `exchange=mexc&${hotParams.toString()}`;

            const [binRes, mexRes] = await Promise.allSettled([
                fetch(binanceUrl.toString(), { cache: "no-store" }),
                fetch(mexcUrl.toString(), { cache: "no-store" }),
            ]);

            const binOk = binRes.status === "fulfilled" && binRes.value.ok;
            const mexOk = mexRes.status === "fulfilled" && mexRes.value.ok;

            const binJson = binOk ? await safeJson<HotResponse>(binRes.value) : null;
            const mexJson = mexOk ? await safeJson<HotResponse>(mexRes.value) : null;

            const binData = Array.isArray(binJson?.data) ? (binJson!.data as HotRow[]) : [];
            const mexData = Array.isArray(mexJson?.data) ? (mexJson!.data as HotRow[]) : [];

            const all = [
                ...binData.map((r) => toAlertRow(r, tf, now)),
                ...mexData.map((r) => toAlertRow(r, tf, now)),
            ].filter((r) => !!r.baseAsset);

            const filtered = all.filter((r) => {
                if (!includeCalm && !isNonCalm(r.signal)) return false;
                if ((r.score ?? 0) < minScore) return false;
                if (allowSignals.size > 0 && !allowSignals.has(r.signal)) return false;
                return true;
            });

            const rows = dedupe ? dedupeByKeyPreferBinance(filtered) : filtered;

            sortRows(rows, sort);

            const out = rows.slice(0, limit);

            const payload = {
                tf,
                ts: now,
                data: out,
                sources: {
                    binance: {
                        ok: binOk,
                        status: binRes.status === "fulfilled" ? binRes.value.status : "fetch_failed",
                        degraded: !!binJson?.degraded,
                        degradeReason: binJson?.degradeReason ?? null,
                        mode: binJson?.mode ?? null,
                        ws: binJson?.ws ?? null,
                    },
                    mexc: {
                        ok: mexOk,
                        status: mexRes.status === "fulfilled" ? mexRes.value.status : "fetch_failed",
                        degraded: !!mexJson?.degraded,
                        degradeReason: mexJson?.degradeReason ?? null,
                        mode: mexJson?.mode ?? null,
                        ws: mexJson?.ws ?? null,
                    },
                },
                cache: { hit: false, ttlMs: TTL_MS },
            };

            alertsCache.set(cacheKey, payload, TTL_MS);
            return payload;
        } catch (e: unknown) {
            const msg =
                e instanceof Error
                    ? e.message
                    : typeof e === "string"
                        ? e
                        : "alerts_failed";
            const payload = {
                tf,
                ts: now,
                data: [],
                error: msg,
                cache: { hit: false, ttlMs: TTL_MS },
            };
            alertsCache.set(cacheKey, payload, 800);
            return payload;
        }
    })();

    alertsInFlight.set(cacheKey, p);
    const out = await p;
    return NextResponse.json(out);
}
