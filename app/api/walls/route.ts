import { NextResponse } from "next/server";
import { TTLCache, InFlight, createLimiter, fetchWithRetry } from "@/lib/server-cache";

export const runtime = "nodejs";

type WallStatus = "NEW" | "HOLD" | "EATING" | "REMOVED";
type Side = "bid" | "ask";

type Wall = {
    price: number;
    notional: number;
    distancePct: number;
    status: WallStatus;
};

type DepthLevel = { price: number; qty: number };

type SideState = {
    price: number;
    notional: number;
    lastSeenTs: number;
    lastNotional: number;
    status: WallStatus;
    statusTs: number;
    removedExpireTs?: number;
};

type SymbolWalls = { bid?: Wall; ask?: Wall };
type DepthSnapshot = [DepthLevel[], DepthLevel[]];
type WallsResponse = { ts: number; data: Record<string, SymbolWalls> };

const BINANCE_BASE = "https://api.binance.com";
const DEPTH_LIMIT = 100;
const MAX_SYMBOLS = 50;
const RANGE_PCT = 0.01; // +/-1%
const MIN_NOTIONAL_USDT = 100_000;
const EATING_DROP_RATIO = 0.9; // >10% drop
const NEW_HOLD_MS = 10_000;
const REMOVED_KEEP_MS = 30_000;

const depthCache = new TTLCache<DepthSnapshot>(2500, 10_000);
const depthInFlight = new InFlight<DepthSnapshot>();
const limit = createLimiter(8);

const sideStateMap = new Map<string, SideState>();

function parseLevels(raw: unknown): DepthLevel[] {
    if (!Array.isArray(raw)) return [];
    const out: DepthLevel[] = [];
    for (const lvl of raw) {
        if (!Array.isArray(lvl)) continue;
        const p = Number(lvl[0]);
        const q = Number(lvl[1]);
        if (!Number.isFinite(p) || !Number.isFinite(q) || p <= 0 || q <= 0) continue;
        out.push({ price: p, qty: q });
    }
    return out;
}

async function fetchDepth(symbol: string): Promise<DepthSnapshot> {
    const url = `${BINANCE_BASE}/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${DEPTH_LIMIT}`;
    const res = await fetchWithRetry(url, { method: "GET", cache: "no-store" }, { retries: 1 });
    if (!res.ok) throw new Error(`depth failed ${symbol} ${res.status}`);
    const json = await res.json();
    const obj = (typeof json === "object" && json !== null ? json : null) as Record<string, unknown> | null;
    const bids = parseLevels(obj?.bids);
    const asks = parseLevels(obj?.asks);
    return [bids, asks];
}

async function fetchDepthCached(symbol: string): Promise<DepthSnapshot> {
    const key = `d:${symbol}`;
    const cached = depthCache.get(key);
    if (cached) return cached;

    const inflight = depthInFlight.get(key);
    if (inflight) return inflight;

    const p = limit(async () => {
        const got = await fetchDepth(symbol);
        depthCache.set(key, got, 2500);
        return got;
    });
    depthInFlight.set(key, p);
    return p;
}

function strongestWall(levels: DepthLevel[], mid: number, side: Side): { price: number; notional: number; distancePct: number } | null {
    const lo = mid * (1 - RANGE_PCT);
    const hi = mid * (1 + RANGE_PCT);
    let best: { price: number; notional: number; distancePct: number } | null = null;

    for (const lvl of levels) {
        if (side === "bid" && lvl.price > mid) continue;
        if (side === "ask" && lvl.price < mid) continue;
        if (lvl.price < lo || lvl.price > hi) continue;
        const notional = lvl.price * lvl.qty;
        if (!Number.isFinite(notional) || notional <= 0) continue;
        const dist = Math.abs((lvl.price - mid) / mid) * 100;
        if (!best || notional > best.notional) {
            best = { price: lvl.price, notional, distancePct: dist };
        }
    }

    if (!best || best.notional < MIN_NOTIONAL_USDT) return null;
    return best;
}

function stateKey(symbol: string, side: Side) {
    return `${symbol}:${side}`;
}

function toWallWithState(symbol: string, side: Side, strongest: { price: number; notional: number; distancePct: number } | null, now: number): Wall | undefined {
    const key = stateKey(symbol, side);
    const prev = sideStateMap.get(key);

    if (!strongest) {
        if (!prev) return undefined;
        if (prev.status !== "REMOVED") {
            const removed: SideState = {
                price: prev.price,
                notional: prev.notional,
                lastSeenTs: now,
                lastNotional: prev.notional,
                status: "REMOVED",
                statusTs: now,
                removedExpireTs: now + REMOVED_KEEP_MS,
            };
            sideStateMap.set(key, removed);
            return { price: removed.price, notional: removed.notional, distancePct: 0, status: "REMOVED" };
        }
        if ((prev.removedExpireTs ?? 0) > now) {
            return { price: prev.price, notional: prev.notional, distancePct: 0, status: "REMOVED" };
        }
        sideStateMap.delete(key);
        return undefined;
    }

    let status: WallStatus = "HOLD";
    if (!prev || prev.status === "REMOVED") {
        status = "NEW";
    } else {
        const samePrice = Math.abs(prev.price - strongest.price) < Math.max(1e-8, strongest.price * 1e-6);
        if (samePrice && prev.notional > 0 && strongest.notional <= prev.notional * EATING_DROP_RATIO) {
            status = "EATING";
        } else if (prev.status === "NEW" && now - prev.statusTs <= NEW_HOLD_MS) {
            status = "NEW";
        } else {
            status = "HOLD";
        }
    }

    const nextState: SideState = {
        price: strongest.price,
        notional: strongest.notional,
        lastSeenTs: now,
        lastNotional: prev?.notional ?? strongest.notional,
        status,
        statusTs: status === "NEW" ? (prev?.statusTs ?? now) : now,
    };
    sideStateMap.set(key, nextState);
    return { price: strongest.price, notional: strongest.notional, distancePct: strongest.distancePct, status };
}

async function calcWalls(symbol: string): Promise<SymbolWalls> {
    const [bids, asks] = await fetchDepthCached(symbol);
    if (!bids.length || !asks.length) return {};
    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 0;
    if (!(bestBid > 0) || !(bestAsk > 0)) return {};
    const mid = (bestBid + bestAsk) / 2;
    const now = Date.now();

    const strongestBid = strongestWall(bids, mid, "bid");
    const strongestAsk = strongestWall(asks, mid, "ask");

    const bid = toWallWithState(symbol, "bid", strongestBid, now);
    const ask = toWallWithState(symbol, "ask", strongestAsk, now);
    return { bid, ask };
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const rawSymbols = (url.searchParams.get("symbols") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    const uniq = Array.from(new Set(rawSymbols)).slice(0, MAX_SYMBOLS);

    const data: Record<string, SymbolWalls> = {};
    if (uniq.length === 0) return NextResponse.json<WallsResponse>({ ts: Date.now(), data });

    await Promise.all(
        uniq.map(async (symbol) => {
            try {
                data[symbol] = await calcWalls(symbol);
            } catch {
                data[symbol] = {};
            }
        })
    );

    return NextResponse.json<WallsResponse>({ ts: Date.now(), data });
}
