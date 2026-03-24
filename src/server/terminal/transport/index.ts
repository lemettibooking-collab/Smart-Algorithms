import { normalizeMexcSymbol } from "@/lib/mexc";
import { BinanceTerminalSymbolStream } from "@/src/server/terminal/transport/binance-stream";
import { MexcTerminalSymbolStream } from "@/src/server/terminal/transport/mexc-stream";
import { buildTransportHealth } from "@/src/server/terminal/transport/shared";
import type {
  TerminalConnectionState,
  TerminalExchange,
  TerminalScalpMarketResponse,
} from "@/src/shared/model/terminal/contracts";

type TransportController = {
  touch: () => void;
  isExpired: (now?: number) => boolean;
  dispose: () => void;
  getStatus: () => "connecting" | "connected" | "stale" | "disconnected";
  getCurrent: () => TerminalScalpMarketResponse | null;
};

const controllers = new Map<string, TransportController>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function keyOf(exchange: TerminalExchange, symbol: string) {
  return `${exchange}:${symbol}`;
}

function ensureCleanupLoop() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, controller] of controllers) {
      if (!controller.isExpired(now)) continue;
      controller.dispose();
      controllers.delete(key);
    }
  }, 15_000);

  cleanupTimer.unref?.();
}

async function normalizeTransportSymbol(exchange: TerminalExchange, symbol: string) {
  const normalized = String(symbol ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (exchange === "binance") return normalized;
  return normalizeMexcSymbol(normalized);
}

function createController(exchange: TerminalExchange, symbol: string): TransportController {
  if (exchange === "mexc") {
    return new MexcTerminalSymbolStream(symbol);
  }

  return new BinanceTerminalSymbolStream(symbol);
}

function fallbackConnectionState(status: ReturnType<TransportController["getStatus"]>): TerminalConnectionState {
  if (status === "connected") return "connected";
  if (status === "connecting") return "connecting";
  if (status === "disconnected") return "stale";
  return "stale";
}

export async function getTerminalTransportMarket(params: {
  exchange: TerminalExchange;
  symbol: string;
  snapshotLoader: (input: { exchange: TerminalExchange; symbol: string }) => Promise<TerminalScalpMarketResponse>;
}): Promise<TerminalScalpMarketResponse> {
  ensureCleanupLoop();

  const normalizedSymbol = await normalizeTransportSymbol(params.exchange, params.symbol);
  if (!normalizedSymbol) {
    return params.snapshotLoader({
      exchange: params.exchange,
      symbol: params.symbol,
    });
  }

  const controllerKey = keyOf(params.exchange, normalizedSymbol);
  let controller = controllers.get(controllerKey);
  if (!controller) {
    controller = createController(params.exchange, normalizedSymbol);
    controllers.set(controllerKey, controller);
  }

  controller.touch();
  const current = controller.getCurrent();
  if (current) {
    return current;
  }

  const snapshot = await params.snapshotLoader({
    exchange: params.exchange,
    symbol: normalizedSymbol,
  });
  if (!snapshot.ok) return snapshot;

  const status = controller.getStatus();
  return {
    ...snapshot,
    health: buildTransportHealth({
      connectionState: fallbackConnectionState(status),
      updatedAt: snapshot.market.updatedAt ?? snapshot.health.updatedAt,
      latestEventTs: snapshot.market.tape[0]?.ts ?? null,
      transport: "snapshot",
      fallbackUsed: snapshot.health.fallbackUsed,
      source: snapshot.health.source,
    }),
  };
}
