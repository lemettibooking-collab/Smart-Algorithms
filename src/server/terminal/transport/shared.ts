import type {
  TerminalConnectionState,
  TerminalDomLevelDto,
  TerminalExchange,
  TerminalMarketHealthDto,
  TerminalScalpMarketDto,
  TerminalTapeTradeDto,
} from "@/src/shared/model/terminal/contracts";

export const DOM_LEVELS_PER_SIDE = 7;
export const TAPE_LIMIT = 14;
export const STREAM_STALE_AFTER_MS = 15_000;

function toPositiveNumber(value?: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function decimalPlaces(value?: string) {
  if (!value || !value.includes(".")) return 0;
  return value.split(".")[1]?.length ?? 0;
}

function formatPrice(value: number, decimals: number) {
  return value.toFixed(decimals);
}

export function buildDomRows(params: {
  asks: Array<[string, string]>;
  bids: Array<[string, string]>;
}): TerminalDomLevelDto[] {
  const asksAscending = params.asks.slice(0, DOM_LEVELS_PER_SIDE);
  const bidsDescending = params.bids.slice(0, DOM_LEVELS_PER_SIDE);

  const askRowsBestToFar: TerminalDomLevelDto[] = [];
  let askRunningTotal = 0;
  for (const [price, qty] of asksAscending) {
    const askSize = toPositiveNumber(qty);
    if (askSize == null) continue;
    askRunningTotal += askSize;
    askRowsBestToFar.push({
      price,
      askSize: askSize.toString(),
      askTotal: askRunningTotal.toString(),
      bidSize: null,
      bidTotal: null,
    });
  }

  const bidRows: TerminalDomLevelDto[] = [];
  let bidRunningTotal = 0;
  for (const [price, qty] of bidsDescending) {
    const bidSize = toPositiveNumber(qty);
    if (bidSize == null) continue;
    bidRunningTotal += bidSize;
    bidRows.push({
      price,
      bidSize: bidSize.toString(),
      bidTotal: bidRunningTotal.toString(),
      askSize: null,
      askTotal: null,
    });
  }

  return [...askRowsBestToFar.reverse(), ...bidRows];
}

export function pushTapeTrade(tape: TerminalTapeTradeDto[], trade: TerminalTapeTradeDto) {
  const next = [trade, ...tape.filter((item) => item.id !== trade.id)];
  return next
    .sort((a, b) => b.ts - a.ts)
    .slice(0, TAPE_LIMIT);
}

export function buildStreamMarket(params: {
  exchange: TerminalExchange;
  symbol: string;
  asks: Array<[string, string]>;
  bids: Array<[string, string]>;
  tape: TerminalTapeTradeDto[];
  tickSize?: string;
  updatedAt: number;
}): TerminalScalpMarketDto | null {
  const bestAskPrice = toPositiveNumber(params.asks[0]?.[0] ?? null);
  const bestBidPrice = toPositiveNumber(params.bids[0]?.[0] ?? null);
  if (bestAskPrice == null || bestBidPrice == null) return null;

  const decimals = Math.max(
    decimalPlaces(params.tickSize),
    decimalPlaces(params.asks[0]?.[0]),
    decimalPlaces(params.bids[0]?.[0]),
  );
  const spread = Math.max(0, bestAskPrice - bestBidPrice);
  const midPrice = bestBidPrice + spread / 2;

  return {
    exchange: params.exchange,
    symbol: params.symbol,
    bestBid: formatPrice(bestBidPrice, decimals),
    bestAsk: formatPrice(bestAskPrice, decimals),
    spread: formatPrice(spread, decimals),
    midPrice: formatPrice(midPrice, decimals),
    dom: buildDomRows({
      asks: params.asks,
      bids: params.bids,
    }),
    tape: params.tape,
    updatedAt: params.updatedAt,
  };
}

export function buildTransportHealth(params: {
  connectionState: TerminalConnectionState;
  updatedAt: number | null;
  latestEventTs: number | null;
  transport: "stream" | "snapshot";
  fallbackUsed: boolean;
  source?: TerminalMarketHealthDto["source"];
}): TerminalMarketHealthDto {
  return {
    connectionState: params.connectionState,
    source: params.source ?? (params.fallbackUsed ? "demo_fallback" : "exchange_snapshot"),
    snapshotAgeMs:
      params.updatedAt != null && params.latestEventTs != null
        ? Math.max(0, params.updatedAt - params.latestEventTs)
        : null,
    updatedAt: params.updatedAt,
    fallbackUsed: params.fallbackUsed,
    transport: params.transport,
  };
}

export function deriveConnectedState(updatedAt: number | null, latestEventTs: number | null): TerminalConnectionState {
  if (updatedAt == null) return "connecting";
  const ageMs = latestEventTs != null ? Math.max(0, updatedAt - latestEventTs) : 0;
  return ageMs > STREAM_STALE_AFTER_MS ? "stale" : "connected";
}
