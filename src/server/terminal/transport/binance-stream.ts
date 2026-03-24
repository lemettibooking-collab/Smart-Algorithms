import { WebSocket } from "ws";
import type { TerminalScalpMarketResponse, TerminalTapeTradeDto } from "@/src/shared/model/terminal/contracts";
import { buildStreamMarket, buildTransportHealth, deriveConnectedState, pushTapeTrade } from "@/src/server/terminal/transport/shared";

const BINANCE_WS_BASE = "wss://stream.binance.com:9443/stream";
const SUBSCRIPTION_TTL_MS = 30_000;
const RECONNECT_DELAY_MS = 2_000;

type BinanceCombinedMessage = {
  stream?: string;
  data?: Record<string, unknown>;
};

type StreamStatus = "connecting" | "connected" | "stale" | "disconnected";
type SuccessfulMarketResponse = Extract<TerminalScalpMarketResponse, { ok: true }>;

export class BinanceTerminalSymbolStream {
  private readonly symbol: string;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this.status = "disconnected";
  }

  private connect() {
    const streamSymbol = this.symbol.toLowerCase();
    const url = `${BINANCE_WS_BASE}?streams=${streamSymbol}@depth10@100ms/${streamSymbol}@trade`;

    this.status = "connecting";
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on("open", () => {
      this.status = this.market ? "connected" : "connecting";
    });

    ws.on("message", (raw) => {
      this.handleMessage(raw.toString());
    });

    ws.on("error", () => {
      this.status = "stale";
    });

    ws.on("close", () => {
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
    let message: BinanceCombinedMessage | null = null;
    try {
      message = JSON.parse(raw) as BinanceCombinedMessage;
    } catch {
      return;
    }

    const stream = String(message?.stream ?? "");
    const data = typeof message?.data === "object" && message.data !== null ? message.data : null;
    if (!stream || !data) return;

    const now = Date.now();

    if (stream.includes("@depth")) {
      const asks = Array.isArray(data.asks) ? (data.asks as Array<[string, string]>) : [];
      const bids = Array.isArray(data.bids) ? (data.bids as Array<[string, string]>) : [];
      if (asks.length) this.asks = asks;
      if (bids.length) this.bids = bids;
      this.latestEventTs = now;
    }

    if (stream.includes("@trade")) {
      const tradeTs = Number(data.T ?? now);
      const price = typeof data.p === "string" ? data.p : "";
      const qty = typeof data.q === "string" ? data.q : "";
      if (price && qty) {
        this.tape = pushTapeTrade(this.tape, {
          id: String(data.t ?? `${tradeTs}-${price}`),
          side: data.m ? "sell" : "buy",
          price,
          qty,
          ts: Number.isFinite(tradeTs) ? tradeTs : now,
        });
        this.latestEventTs = Number.isFinite(tradeTs) ? tradeTs : now;
      }
    }

    const market = buildStreamMarket({
      exchange: "binance",
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
