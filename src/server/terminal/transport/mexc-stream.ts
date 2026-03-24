import { WebSocket } from "ws";
import type { TerminalTapeTradeDto, TerminalScalpMarketResponse } from "@/src/shared/model/terminal/contracts";
import { buildStreamMarket, buildTransportHealth, deriveConnectedState, pushTapeTrade } from "@/src/server/terminal/transport/shared";

const MEXC_WS_BASE = "wss://wbs-api.mexc.com/ws";
const SUBSCRIPTION_TTL_MS = 30_000;
const RECONNECT_DELAY_MS = 2_000;
const PING_INTERVAL_MS = 20_000;

type MexcMessage = {
  c?: string;
  d?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

type StreamStatus = "connecting" | "connected" | "stale" | "disconnected";
type SuccessfulMarketResponse = Extract<TerminalScalpMarketResponse, { ok: true }>;

function normalizeLevels(levels: unknown): Array<[string, string]> {
  if (!Array.isArray(levels)) return [];
  return levels
    .map((level) => {
      if (Array.isArray(level)) {
        const [price, qty] = level;
        return typeof price === "string" && typeof qty === "string" ? ([price, qty] as [string, string]) : null;
      }

      const objectLevel = (typeof level === "object" && level !== null ? level : null) as { p?: unknown; v?: unknown } | null;
      return typeof objectLevel?.p === "string" && typeof objectLevel?.v === "string"
        ? ([objectLevel.p, objectLevel.v] as [string, string])
        : null;
    })
    .filter((level): level is [string, string] => level !== null);
}

export class MexcTerminalSymbolStream {
  private readonly symbol: string;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastTouchedAt = Date.now();
  private closedManually = false;
  private status: StreamStatus = "connecting";
  private asks: Array<[string, string]> = [];
  private bids: Array<[string, string]> = [];
  private tape: TerminalTapeTradeDto[] = [];
  private market: SuccessfulMarketResponse | null = null;
  private latestEventTs: number | null = null;

  constructor(symbol: string) {
    this.symbol = String(symbol ?? "").trim().toUpperCase();
    this.connect();
  }

  touch() {
    this.lastTouchedAt = Date.now();
  }

  isExpired(now = Date.now()) {
    return now - this.lastTouchedAt > SUBSCRIPTION_TTL_MS;
  }

  getStatus() {
    return this.status;
  }

  getCurrent() {
    if (!this.market) return null;
    if (this.market.health.connectionState !== "connected") return null;
    return this.market;
  }

  dispose() {
    this.closedManually = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.ws?.close();
    this.ws = null;
    this.status = "disconnected";
  }

  private connect() {
    this.status = "connecting";
    const ws = new WebSocket(MEXC_WS_BASE);
    this.ws = ws;

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          method: "SUBSCRIPTION",
          params: [
            `spot@public.limit.depth.v3.api@${this.symbol}@10`,
            `spot@public.deals.v3.api@${this.symbol}`,
          ],
          id: Date.now(),
        }),
      );

      this.pingTimer = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ method: "PING" }));
        }
      }, PING_INTERVAL_MS);
      this.pingTimer.unref?.();
    });

    ws.on("message", (raw) => {
      this.handleMessage(raw.toString());
    });

    ws.on("error", () => {
      this.status = "stale";
    });

    ws.on("close", () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.ws = null;

      if (this.closedManually) {
        this.status = "disconnected";
        return;
      }

      this.status = this.market ? "stale" : "disconnected";
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, RECONNECT_DELAY_MS);
      this.reconnectTimer.unref?.();
    });
  }

  private handleMessage(raw: string) {
    let message: MexcMessage | null = null;
    try {
      message = JSON.parse(raw) as MexcMessage;
    } catch {
      return;
    }

    const channel = String(message?.c ?? "");
    const payload = (typeof message?.d === "object" && message.d !== null
      ? message.d
      : typeof message?.data === "object" && message.data !== null
        ? message.data
        : null) as Record<string, unknown> | null;
    if (!channel || !payload) return;

    const now = Date.now();

    if (channel.includes("depth")) {
      const asks = normalizeLevels(payload.asks);
      const bids = normalizeLevels(payload.bids);
      if (asks.length) this.asks = asks;
      if (bids.length) this.bids = bids;
      this.latestEventTs = now;
    }

    if (channel.includes("deals")) {
      const deals = Array.isArray(payload.deals)
        ? payload.deals
        : Array.isArray(payload.data)
          ? payload.data
          : [];

      for (const deal of deals) {
        const objectDeal = typeof deal === "object" && deal !== null ? (deal as Record<string, unknown>) : null;
        if (!objectDeal) continue;
        const price = typeof objectDeal.p === "string" ? objectDeal.p : "";
        const qty = typeof objectDeal.v === "string" ? objectDeal.v : "";
        const tradeTs = Number(objectDeal.t ?? now);
        const sideCode = Number(objectDeal.S ?? 1);
        if (!price || !qty) continue;

        this.tape = pushTapeTrade(this.tape, {
          id: String(objectDeal.i ?? `${tradeTs}-${price}`),
          side: sideCode === 2 ? "sell" : "buy",
          price,
          qty,
          ts: Number.isFinite(tradeTs) ? tradeTs : now,
        });
        this.latestEventTs = Number.isFinite(tradeTs) ? tradeTs : now;
      }
    }

    const market = buildStreamMarket({
      exchange: "mexc",
      symbol: this.symbol,
      asks: this.asks,
      bids: this.bids,
      tape: this.tape,
      updatedAt: now,
    });

    if (!market) return;

    const connectionState = deriveConnectedState(market.updatedAt, this.latestEventTs) as StreamStatus;
    this.status = connectionState;
    this.market = {
      ok: true,
      market,
      health: buildTransportHealth({
        connectionState,
        updatedAt: market.updatedAt,
        latestEventTs: this.latestEventTs,
        transport: "stream",
        fallbackUsed: false,
        source: "exchange_snapshot",
      }),
    };
  }
}
