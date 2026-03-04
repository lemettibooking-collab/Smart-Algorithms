// lib/binance-ws.ts
import WebSocket from "ws";

type MiniTickerArrItem = {
    s: string;   // symbol
    c: string;   // last price
    o: string;   // open price (24h)
    q: string;   // quote volume (24h)
    E: number;   // event time
};

type PriceSnap = {
    price: number;
    open24h: number;
    quoteVol24h: number;
    ts: number;
};

const WS_URL = "wss://stream.binance.com:9443/ws/!ticker@arr";

// module-scope singleton
let started = false;
let ws: WebSocket | null = null;

// live maps
const priceMap = new Map<string, PriceSnap>();
let lastMsgTs = 0;

function num(v: unknown, fb = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
}

export function ensureBinanceWsStarted() {
    if (started) return;
    started = true;

    const connect = () => {
        ws = new WebSocket(WS_URL);

        ws.on("open", () => {
            // ok
        });

        ws.on("message", (buf) => {
            try {
                const text = buf.toString("utf8");
                const arr = JSON.parse(text) as MiniTickerArrItem[];
                const now = Date.now();
                lastMsgTs = now;

                for (const t of arr) {
                    const sym = String(t.s);
                    // интересуют в основном USDT, но можно хранить все
                    const snap: PriceSnap = {
                        price: num(t.c),
                        open24h: num(t.o),
                        quoteVol24h: num(t.q),
                        ts: now,
                    };
                    priceMap.set(sym, snap);
                }
            } catch {
                // ignore
            }
        });

        ws.on("close", () => {
            ws = null;
            // reconnect with backoff
            setTimeout(connect, 1000);
        });

        ws.on("error", () => {
            try { ws?.close(); } catch { }
        });
    };

    connect();
}

export function getWsPriceSnap(symbol: string): PriceSnap | null {
    return priceMap.get(symbol) ?? null;
}

export function getWsHealth() {
    return {
        connected: !!ws && ws.readyState === WebSocket.OPEN,
        lastMsgAgeMs: lastMsgTs ? Date.now() - lastMsgTs : null,
        size: priceMap.size,
    };
}
