// app/api/alerts/events/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { TTLCache, InFlight } from "@/lib/server-cache";
import { computeEventId, listEvents, putEvent } from "@/lib/repos/eventsRepo";
import { validateQuery } from "@/src/shared/api";

export const runtime = "nodejs";

type Exchange = "binance" | "mexc";

type AlertRow = {
    id?: string;
    bucketTs?: number;
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

    marketCapRaw: number | null;
    marketCap?: string;

    logoUrl?: string | null;
    iconUrl?: string | null;

    mergedFrom?: Array<{ exchange: Exchange; symbol: string; score: number }>;
};

type AlertsResp = {
    tf: string;
    ts: number;
    data: AlertRow[];
    sources?: unknown;
    error?: string;
};

type EventRow = AlertRow & {
    eventId: string;
    eventType: "signal_change" | "score_jump";
    prevSignal?: string | null;
    prevScore?: number | null;
};

type EventsPayload = {
    tf: string;
    ts: number;
    data: EventRow[];
    sources?: unknown;
    error?: string;
    cache: { hit: boolean; ttlMs: number };
};

const TTL_MS = 3000;
const eventsCache = new TTLCache<EventsPayload>(TTL_MS, 2000);
const eventsInFlight = new InFlight<EventsPayload>();

type LastState = { signal: string; score: number; ts: number };
const lastByKey = new TTLCache<LastState>(1000 * 60 * 60, 50000); // 1h

function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
}

function keyOf(r: AlertRow) {
    return r.id ?? `${r.tf}:${r.baseAsset}`;
}

function isExchange(v: unknown): v is Exchange {
    return v === "binance" || v === "mexc";
}

function asNumber(v: unknown, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function asString(v: unknown, fallback = ""): string {
    const s = typeof v === "string" ? v : String(v ?? "");
    const out = s.trim();
    return out || fallback;
}

function asNullableNumber(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function mapPayloadToEventRow(payload: Record<string, unknown>): EventRow | null {
    const exchange = payload.exchange;
    if (!isExchange(exchange)) return null;

    const eventType = payload.eventType;
    if (eventType !== "signal_change" && eventType !== "score_jump") return null;

    const ts = asNumber(payload.ts, 0);
    const symbol = asString(payload.symbol, "");
    const tf = asString(payload.tf, "");
    const baseAsset = asString(payload.baseAsset, "");
    if (!ts || !symbol || !tf || !baseAsset) return null;

    const row: EventRow = {
        id: typeof payload.id === "string" ? payload.id : undefined,
        bucketTs: asNullableNumber(payload.bucketTs) ?? undefined,
        ts,
        tf,
        baseAsset,
        exchange,
        symbol,
        price: asNumber(payload.price, 0),
        score: asNumber(payload.score, 0),
        signal: asString(payload.signal, "Calm"),
        changePercent: asNumber(payload.changePercent, 0),
        change24hPercent: asNumber(payload.change24hPercent, 0),
        volSpike: asNullableNumber(payload.volSpike),
        marketCapRaw: asNullableNumber(payload.marketCapRaw),
        marketCap: typeof payload.marketCap === "string" ? payload.marketCap : undefined,
        logoUrl: typeof payload.logoUrl === "string" ? payload.logoUrl : null,
        iconUrl: typeof payload.iconUrl === "string" ? payload.iconUrl : null,
        mergedFrom: Array.isArray(payload.mergedFrom)
            ? (payload.mergedFrom as Array<{ exchange: Exchange; symbol: string; score: number }>)
            : undefined,
        eventId: asString(payload.eventId, ""),
        eventType,
        prevSignal: typeof payload.prevSignal === "string" ? payload.prevSignal : null,
        prevScore: asNullableNumber(payload.prevScore),
    };

    return row.eventId ? row : null;
}

function dbReadLimit(limit: number): number {
    return Math.min(2000, Math.max(limit * 6, 400));
}

function readHistoryFromDb(tf: string, limit: number): EventRow[] {
    const persisted = listEvents({ limit: dbReadLimit(limit) });
    const history = persisted
        .map((r) => mapPayloadToEventRow(r.payload))
        .filter((r): r is EventRow => !!r)
        .filter((r) => r.tf === tf);

    history.sort((a, b) => {
        const pa = a.eventType === "signal_change" ? 0 : 1;
        const pb = b.eventType === "signal_change" ? 0 : 1;
        if (pa !== pb) return pa - pb;
        if (b.ts !== a.ts) return b.ts - a.ts;
        return (b.score ?? 0) - (a.score ?? 0);
    });

    return history.slice(0, limit);
}

async function safeJson<T>(res: Response): Promise<T | null> {
    try {
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

const querySchema = z.object({
    tf: z.string().trim().default("15m"),
    limit: z.coerce.number().default(80),
    scoreJump: z.coerce.number().default(1),
    cooldownSec: z.coerce.number().default(90),
    sort: z.enum(["score", "change", "change24h", "spike"]).optional(),
    includeCalm: z.string().optional(),
    minScore: z.coerce.number().optional(),
    signals: z.string().optional(),
    includeStables: z.string().optional(),
    minVol: z.coerce.number().optional(),
    baseLimit: z.coerce.number().optional(),
});

export async function GET(req: Request) {
    const v = validateQuery(req, querySchema);
    if (!v.ok) return v.res;
    const url = new URL(req.url);

    const tf = v.data.tf;
    const limit = clamp(v.data.limit, 1, 200);
    const scoreJump = v.data.scoreJump;
    const cooldownSec = clamp(v.data.cooldownSec, 0, 3600);

    // forward filters to /api/alerts (table aggregator)
    const forward = new URLSearchParams(url.searchParams);
    forward.set("tf", tf);
    forward.set("dedupe", "1"); // events are always deduped
    forward.set("sort", forward.get("sort") ?? "score");

    // take a larger base to avoid missing events
    const rawBaseLimit = typeof v.data.baseLimit === "number" && Number.isFinite(v.data.baseLimit)
        ? v.data.baseLimit
        : Number(forward.get("baseLimit") ?? "220") || 220;
    const baseLimit = clamp(rawBaseLimit, 80, 300);
    forward.set("limit", String(baseLimit));
    forward.delete("baseLimit");

    // events-only params must not be forwarded to /api/alerts
    forward.delete("scoreJump");
    forward.delete("cooldownSec");

    const cacheKey = `events:v1:${forward.toString()}:scoreJump=${scoreJump}:cooldownSec=${cooldownSec}:limit=${limit}`;

    const cached = eventsCache.get(cacheKey);
    if (cached) return NextResponse.json({ ...cached, cache: { hit: true } });

    const inflight = eventsInFlight.get(cacheKey);
    if (inflight) return NextResponse.json(await inflight);

    const p = (async () => {
        const now = Date.now();

        try {
            const origin = new URL(req.url).origin;
            const alertsUrl = new URL("/api/alerts", origin);
            alertsUrl.search = forward.toString();

            const res = await fetch(alertsUrl.toString(), { cache: "no-store" });
            const json = (await safeJson<AlertsResp>(res)) ?? { tf, ts: now, data: [], error: "bad_response" };

            const rows = Array.isArray(json.data) ? json.data : [];
            const out: EventRow[] = [];

            for (const r of rows) {
                const k = keyOf(r);

                // cooldown gate
                if (cooldownSec > 0) {
                    const cd = lastByKey.get(`cd:${k}`);
                    if (cd && now - cd.ts < cooldownSec * 1000) continue;
                }

                const prev = lastByKey.get(k);

                // first appearance: do not emit an event
                if (!prev) {
                    lastByKey.set(k, { signal: r.signal, score: r.score, ts: now }, 1000 * 60 * 60);
                    continue;
                }

                const signalChanged = String(prev.signal) !== String(r.signal);
                const scoreDelta = (r.score ?? 0) - (prev.score ?? 0);
                const scoreJumped = scoreDelta >= scoreJump;

                if (signalChanged || scoreJumped) {
                    const eventType = signalChanged ? "signal_change" : "score_jump";
                    const cooldownMs = Math.max(0, cooldownSec * 1000);
                    const fallbackBucketMs = signalChanged ? 60_000 : 30_000;
                    const deterministicId = computeEventId({
                        exchange: r.exchange,
                        symbol: r.symbol,
                        type: eventType,
                        importantKey: signalChanged
                            ? `signal:${r.signal}`
                            : `scoreBucket:${Math.floor((r.score ?? 0) * 10)}`,
                        bucketMs: Math.max(fallbackBucketMs, cooldownMs || 0),
                        ts: now,
                    });

                    out.push({
                        ...r,
                        eventId: deterministicId,
                        eventType,
                        prevSignal: prev.signal ?? null,
                        prevScore: prev.score ?? null,
                    });

                    if (cooldownSec > 0) {
                        lastByKey.set(`cd:${k}`, { signal: r.signal, score: r.score, ts: now }, cooldownSec * 1000);
                    }
                }

                lastByKey.set(k, { signal: r.signal, score: r.score, ts: now }, 1000 * 60 * 60);
            }

            for (const ev of out) {
                putEvent(
                    {
                        id: ev.eventId,
                        ts: ev.ts,
                        exchange: ev.exchange,
                        symbol: ev.symbol,
                        type: ev.eventType,
                        payload: ev as unknown as Record<string, unknown>,
                    },
                    "ignore"
                );
            }

            const history = readHistoryFromDb(tf, limit);

            const payload = {
                tf,
                ts: now,
                data: history,
                sources: json.sources ?? null,
                cache: { hit: false, ttlMs: TTL_MS },
            };

            eventsCache.set(cacheKey, payload, TTL_MS);
            return payload;
        } catch (e: unknown) {
            const msg =
                e instanceof Error
                    ? e.message
                    : typeof e === "string"
                        ? e
                        : "events_failed";
            const history = readHistoryFromDb(tf, limit);
            const payload = {
                tf,
                ts: now,
                data: history,
                error: msg,
                cache: { hit: false, ttlMs: TTL_MS },
            };
            eventsCache.set(cacheKey, payload, 400);
            return payload;
        }
    })();

    eventsInFlight.set(cacheKey, p);
    return NextResponse.json(await p);
}
