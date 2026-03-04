// app/api/alerts/events/route.ts
import { NextResponse } from "next/server";
import { TTLCache, InFlight } from "@/lib/server-cache";

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

async function safeJson<T>(res: Response): Promise<T | null> {
    try {
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

export async function GET(req: Request) {
    const url = new URL(req.url);

    const tf = url.searchParams.get("tf") ?? "15m";
    const limit = clamp(Number(url.searchParams.get("limit") ?? "80") || 80, 1, 200);

    const scoreJump = Number(url.searchParams.get("scoreJump") ?? "1") || 1; // +1.0
    const cooldownSec = clamp(Number(url.searchParams.get("cooldownSec") ?? "90") || 90, 0, 3600);

    // forward filters to /api/alerts (table aggregator)
    const forward = new URLSearchParams(url.searchParams);
    forward.set("tf", tf);
    forward.set("dedupe", "1"); // events are always deduped
    forward.set("sort", forward.get("sort") ?? "score");

    // take a larger base to avoid missing events
    const baseLimit = clamp(Number(forward.get("baseLimit") ?? "220") || 220, 80, 300);
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
                    out.push({
                        ...r,
                        eventId: `${r.id ?? k}:${eventType}:${r.signal}:${Math.round((r.score ?? 0) * 100)}`,
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

            // priority: signal changes first, then score
            out.sort((a, b) => {
                const pa = a.eventType === "signal_change" ? 0 : 1;
                const pb = b.eventType === "signal_change" ? 0 : 1;
                if (pa !== pb) return pa - pb;
                return (b.score ?? 0) - (a.score ?? 0);
            });

            const payload = {
                tf,
                ts: now,
                data: out.slice(0, limit),
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
            const payload = {
                tf,
                ts: now,
                data: [],
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
