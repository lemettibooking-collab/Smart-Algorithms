// lib/mexc-ws.ts
import WebSocket from "ws";
import protobuf from "protobufjs";

const WS_URLS = ["wss://wbs-api.mexc.com/ws", "wss://wbs.mexc.com/ws"];
const CHANNEL = "spot@public.miniTickers.v3.api.pb@UTC+0";

const PROTO = `
syntax = "proto3";

message PublicMiniTickerV3Api {
  string symbol = 1;
  string price = 2;
  string rate = 3;
  string zonedRate = 4;
  string high = 5;
  string low = 6;
  string volume = 7;    // quote turnover
  string quantity = 8;  // base quantity
  string lastCloseRate = 9;
  string lastCloseZonedRate = 10;
  string lastCloseHigh = 11;
  string lastCloseLow = 12;
}

message PublicMiniTickersV3Api {
  repeated PublicMiniTickerV3Api items = 1;
}

message PushDataV3ApiWrapper {
  string channel = 1;

  oneof body {
    PublicMiniTickerV3Api publicMiniTicker = 309;
    PublicMiniTickersV3Api publicMiniTickers = 310;
  }

  string symbol = 3;
  string symbolId = 4;
  int64 createTime = 5;
  int64 sendTime = 6;
}
`;

type PriceSnap = { price: number; open24h: number; quoteVol24h: number; ts: number };
type WsJson = Record<string, unknown>;

function num(v: unknown, fb = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
}

// open = price / (1 + rate/100)
function deriveOpenFromRatePercent(price: number, ratePercent: number) {
    if (!(price > 0)) return 0;
    const denom = 1 + ratePercent / 100;
    if (Math.abs(denom) < 1e-12) return 0;
    const open = price / denom;
    return open > 0 && Number.isFinite(open) ? open : 0;
}

// ---- singleton (survive Next dev hot reload) ----
type MexcWsState = {
    started: boolean;
    connecting: boolean;
    connectingSinceTs: number;

    instanceId: string;
    attempt: number;

    ws: WebSocket | null;
    currentUrlIdx: number;

    priceMap: Map<string, PriceSnap>;

    lastOpenTs: number;
    lastMsgTs: number;

    lastError: string | null;
    lastClose: { code: number | null; reason: string | null; ts: number | null };

    WrapperType: protobuf.Type | null;

    openTimer: NodeJS.Timeout | null;
    noDataTimer: NodeJS.Timeout | null;
};

const G = globalThis as typeof globalThis & Record<string, unknown>;
const KEY = "__smartalg_mexc_ws__";

function randId() {
    return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function st(): MexcWsState {
    if (!G[KEY]) {
        G[KEY] = {
            started: false,
            connecting: false,
            connectingSinceTs: 0,

            instanceId: randId(),
            attempt: 0,

            ws: null,
            currentUrlIdx: 0,

            priceMap: new Map<string, PriceSnap>(),

            lastOpenTs: 0,
            lastMsgTs: 0,

            lastError: null,
            lastClose: { code: null, reason: null, ts: null },

            WrapperType: null,

            openTimer: null,
            noDataTimer: null,
        } satisfies MexcWsState;
    }
    return G[KEY] as MexcWsState;
}

function ensureProtoReady(s: MexcWsState) {
    if (s.WrapperType) return;
    const root = protobuf.parse(PROTO).root;
    s.WrapperType = root.lookupType("PushDataV3ApiWrapper") as protobuf.Type;
}

function sendJson(s: MexcWsState, obj: WsJson) {
    try {
        s.ws?.send(JSON.stringify(obj));
    } catch { }
}

function rawDataToBuffer(data: WebSocket.RawData): Buffer | null {
    if (Buffer.isBuffer(data)) return data;
    if (Array.isArray(data)) return Buffer.concat(data);
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    return null;
}

function rotateEndpoint(s: MexcWsState) {
    s.currentUrlIdx = (s.currentUrlIdx + 1) % WS_URLS.length;
}

function clearTimers(s: MexcWsState) {
    if (s.openTimer) {
        clearTimeout(s.openTimer);
        s.openTimer = null;
    }
    if (s.noDataTimer) {
        clearTimeout(s.noDataTimer);
        s.noDataTimer = null;
    }
}

function hardResetWs(s: MexcWsState, reason: string) {
    try {
        s.ws?.terminate();
    } catch { }
    s.ws = null;
    s.connecting = false;
    s.connectingSinceTs = 0;
    clearTimers(s);
    s.lastError = reason;
}

function connectOnce() {
    const s = st();
    if (s.connecting) return;

    ensureProtoReady(s);

    s.connecting = true;
    s.connectingSinceTs = Date.now();
    s.attempt += 1;

    const url = WS_URLS[s.currentUrlIdx] ?? WS_URLS[0];
    s.lastError = `connecting:${url}`;
    s.lastClose = { code: null, reason: null, ts: null };

    try {
        s.ws?.terminate();
    } catch { }
    s.ws = null;

    let ws: WebSocket;
    try {
        ws = new WebSocket(url, {
            handshakeTimeout: 7_000,
            perMessageDeflate: false,
            headers: {
                Origin: "https://www.mexc.com",
                "User-Agent": "Mozilla/5.0",
            },
        });
    } catch (e: unknown) {
        s.connecting = false;
        s.connectingSinceTs = 0;
        s.lastError = `ctor_error:${e instanceof Error ? e.message : String(e)}`;
        rotateEndpoint(s);
        setTimeout(connectOnce, 1200);
        return;
    }

    s.ws = ws;

    // if OPEN doesn't happen quickly -> rotate + terminate
    s.openTimer = setTimeout(() => {
        const ss = st();
        if (!ss.ws) return;
        if (ss.ws.readyState !== WebSocket.OPEN) {
            ss.lastError = "open_timeout";
            rotateEndpoint(ss);
            try {
                ss.ws.terminate();
            } catch { }
            ss.ws = null;
            ss.connecting = false;
            ss.connectingSinceTs = 0;
            clearTimers(ss);
            setTimeout(connectOnce, 1200);
        }
    }, 8_000);

    ws.on("open", () => {
        const ss = st();
        ss.lastOpenTs = Date.now();
        ss.lastError = "open";
        ss.connecting = false;
        ss.connectingSinceTs = 0;

        clearTimers(ss);

        sendJson(ss, { method: "SUBSCRIPTION", params: [CHANNEL] });

        const pingId = setInterval(() => {
            const s2 = st();
            if (!s2.ws || s2.ws.readyState !== WebSocket.OPEN) return;
            sendJson(s2, { method: "PING" });
        }, 20_000);

        ws.once("close", () => clearInterval(pingId));

        // if connected but no frames -> rotate
        ss.noDataTimer = setTimeout(() => {
            const s2 = st();
            const age = s2.lastMsgTs ? Date.now() - s2.lastMsgTs : Infinity;
            if (age === Infinity || age > 6000) {
                s2.lastError = "no_data_timeout";
                rotateEndpoint(s2);
                try {
                    s2.ws?.terminate();
                } catch { }
                s2.ws = null;
                clearTimers(s2);
                setTimeout(connectOnce, 1200);
            }
        }, 6_000);
    });

    ws.on("message", (data: WebSocket.RawData) => {
        const ss = st();
        const now = Date.now();
        ss.lastMsgTs = now;

        // json ack/pong
        if (typeof data === "string") return;

        const buf = rawDataToBuffer(data);
        if (!buf) return;
        // json as buffer
        if (buf.length && (buf[0] === 0x7b || buf[0] === 0x5b)) return;

        try {
            if (!ss.WrapperType) ensureProtoReady(ss);
            if (!ss.WrapperType) return;

            const decoded = ss.WrapperType.decode(buf) as unknown as Record<string, unknown>;

            const batch = decoded.publicMiniTickers as Record<string, unknown> | undefined;
            const batchItems = batch?.items;
            if (Array.isArray(batchItems)) {
                for (const it of batchItems) {
                    const item = it && typeof it === "object" ? (it as Record<string, unknown>) : null;
                    const symbol = String(item?.symbol ?? "").toUpperCase();
                    if (!symbol) continue;

                    const price = num(item?.price, 0);
                    const quoteVol = num(item?.volume, 0);
                    const ratePct = num(item?.rate, 0);

                    const open24h = deriveOpenFromRatePercent(price, ratePct);
                    ss.priceMap.set(symbol, { price, open24h, quoteVol24h: quoteVol, ts: now });
                }
            }

            const one = decoded.publicMiniTicker as Record<string, unknown> | undefined;
            if (one?.symbol) {
                const symbol = String(one.symbol).toUpperCase();
                const price = num(one.price, 0);
                const quoteVol = num(one.volume, 0);
                const ratePct = num(one.rate, 0);
                const open24h = deriveOpenFromRatePercent(price, ratePct);
                ss.priceMap.set(symbol, { price, open24h, quoteVol24h: quoteVol, ts: now });
            }
        } catch {
            // ignore decode errors
        }
    });

    ws.on("close", (code: number, reasonBuf: Buffer) => {
        const ss = st();
        ss.lastClose = {
            code: typeof code === "number" ? code : null,
            reason: reasonBuf ? reasonBuf.toString() : null,
            ts: Date.now(),
        };

        ss.ws = null;
        ss.connecting = false;
        ss.connectingSinceTs = 0;
        clearTimers(ss);

        ss.lastError = `closed:${code}`;
        setTimeout(connectOnce, 1200);
    });

    ws.on("error", (err) => {
        const ss = st();
        const message = err instanceof Error ? err.message : String(err ?? "ws_error");
        ss.lastError = `error:${message}`;
        ss.connecting = false;
        ss.connectingSinceTs = 0;

        rotateEndpoint(ss);
        try {
            ws.terminate();
        } catch { }
        ss.ws = null;

        clearTimers(ss);
        setTimeout(connectOnce, 1200);
    });

    ws.on("unexpected-response", () => {
        const ss = st();
        ss.lastError = "unexpected_response";
        ss.connecting = false;
        ss.connectingSinceTs = 0;

        rotateEndpoint(ss);
        try {
            ws.terminate();
        } catch { }
        ss.ws = null;

        clearTimers(ss);
        setTimeout(connectOnce, 1200);
    });
}

// watchdog: if connecting stuck -> reset and reconnect
function kick() {
    const s = st();
    if (s.connecting && s.connectingSinceTs && Date.now() - s.connectingSinceTs > 10_000) {
        hardResetWs(s, "stuck_connecting_reset");
        rotateEndpoint(s);
        setTimeout(connectOnce, 0);
    }
}

export function ensureMexcWsStarted() {
    const s = st();
    if (!s.started) s.started = true;

    kick();

    if (!s.ws && !s.connecting) {
        connectOnce();
        return;
    }

    // stale socket -> reconnect
    if (s.ws && s.ws.readyState === WebSocket.OPEN) {
        const age = s.lastMsgTs ? Date.now() - s.lastMsgTs : Infinity;
        if (age > 30_000) {
            hardResetWs(s, "stale_socket_reset");
            rotateEndpoint(s);
            setTimeout(connectOnce, 0);
        }
    }
}

export function getMexcWsPriceSnap(symbol: string): PriceSnap | null {
    const s = st();
    return s.priceMap.get(String(symbol ?? "").toUpperCase()) ?? null;
}

export function getMexcWsHealth() {
    const s = st();
    const url = WS_URLS[s.currentUrlIdx] ?? WS_URLS[0];

    return {
        started: s.started,
        connecting: s.connecting,
        connectingAgeMs: s.connectingSinceTs ? Date.now() - s.connectingSinceTs : null,

        instanceId: s.instanceId,
        attempt: s.attempt,

        connected: !!s.ws && s.ws.readyState === WebSocket.OPEN,
        readyState: s.ws ? s.ws.readyState : null,

        url,
        channel: CHANNEL,

        lastOpenAgeMs: s.lastOpenTs ? Date.now() - s.lastOpenTs : null,
        lastMsgAgeMs: s.lastMsgTs ? Date.now() - s.lastMsgTs : null,

        size: s.priceMap.size,

        lastError: s.lastError,
        lastClose: s.lastClose,
    };
}
