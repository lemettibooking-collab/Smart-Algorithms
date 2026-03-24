import { normalizeMexcSymbol } from "@/lib/mexc";
import type { TerminalMarketDataAdapter } from "@/src/server/terminal/adapters/contracts";
import { fetchMexcDepthSnapshot, fetchMexcRecentTrades } from "@/src/server/terminal/adapters/mexc/client";
import type {
  TerminalDomLevelDto,
  TerminalMarketHealthDto,
  TerminalScalpMarketDto,
  TerminalScalpMarketResponse,
  TerminalTapeTradeDto,
} from "@/src/shared/model/terminal/contracts";

const DOM_LEVELS_PER_SIDE = 7;
const TAPE_LIMIT = 14;

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

function buildDomRows(params: {
  asks: Array<[string, string]>;
  bids: Array<[string, string]>;
}) {
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

function normalizeTapeTrades(trades: Array<{
  id?: string | number;
  price?: string;
  qty?: string;
  time?: number;
  isBuyerMaker?: boolean;
}>): TerminalTapeTradeDto[] {
  return trades
    .map((trade) => {
      const price = typeof trade.price === "string" ? trade.price : "";
      const qty = typeof trade.qty === "string" ? trade.qty : "";
      const ts = Number(trade.time);
      if (!price || !qty || !Number.isFinite(ts)) return null;

      return {
        id: String(trade.id ?? `${ts}-${price}`),
        side: trade.isBuyerMaker ? "sell" : "buy",
        price,
        qty,
        ts,
      } satisfies TerminalTapeTradeDto;
    })
    .filter((trade): trade is TerminalTapeTradeDto => trade !== null)
    .sort((a, b) => b.ts - a.ts);
}

function buildMarket(params: {
  symbol: string;
  asks: Array<[string, string]>;
  bids: Array<[string, string]>;
  tape: TerminalTapeTradeDto[];
}): TerminalScalpMarketDto | null {
  const bestAskPrice = toPositiveNumber(params.asks[0]?.[0] ?? null);
  const bestBidPrice = toPositiveNumber(params.bids[0]?.[0] ?? null);
  if (bestAskPrice == null || bestBidPrice == null) return null;

  const decimals = Math.max(decimalPlaces(params.asks[0]?.[0]), decimalPlaces(params.bids[0]?.[0]));
  const spread = Math.max(0, bestAskPrice - bestBidPrice);
  const midPrice = bestBidPrice + spread / 2;

  return {
    exchange: "mexc",
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
    updatedAt: Date.now(),
  };
}

function computeHealth(params: {
  updatedAt: number;
  latestTradeTs: number | null;
}): TerminalMarketHealthDto {
  const snapshotAgeMs = params.latestTradeTs ? Math.max(0, params.updatedAt - params.latestTradeTs) : null;
  return {
    connectionState: snapshotAgeMs == null || snapshotAgeMs > 15_000 ? "stale" : "connected",
    source: "exchange_snapshot",
    snapshotAgeMs,
    updatedAt: params.updatedAt,
    fallbackUsed: false,
    transport: "snapshot",
  };
}

export const mexcTerminalMarketDataAdapter: TerminalMarketDataAdapter = {
  async getScalpMarket(input): Promise<TerminalScalpMarketResponse> {
    const normalizedSymbol = await normalizeMexcSymbol(input.symbol ?? "");
    if (!normalizedSymbol) {
      return {
        ok: false,
        error: {
          code: "symbol_not_found",
          message: `No MEXC market symbol mapping is available for ${String(input.symbol ?? "").trim().toUpperCase()}.`,
        },
      };
    }

    try {
      const [depth, recentTrades] = await Promise.all([
        fetchMexcDepthSnapshot(normalizedSymbol, DOM_LEVELS_PER_SIDE),
        fetchMexcRecentTrades(normalizedSymbol, TAPE_LIMIT),
      ]);

      if (!depth?.asks?.length || !depth?.bids?.length) {
        return {
          ok: false,
          error: {
            code: "symbol_not_found",
            message: `No MEXC market depth snapshot is available for ${normalizedSymbol}.`,
          },
        };
      }

      const market = buildMarket({
        symbol: normalizedSymbol,
        asks: depth.asks,
        bids: depth.bids,
        tape: normalizeTapeTrades(recentTrades),
      });

      if (!market) {
        return {
          ok: false,
          error: {
            code: "symbol_not_found",
            message: `No MEXC market snapshot could be normalized for ${normalizedSymbol}.`,
          },
        };
      }

      return {
        ok: true,
        market,
        health: computeHealth({
          updatedAt: market.updatedAt,
          latestTradeTs: market.tape[0]?.ts ?? null,
        }),
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "unsupported_exchange",
          message: `MEXC market snapshot is temporarily unavailable for ${normalizedSymbol}.`,
        },
      };
    }
  },
};
