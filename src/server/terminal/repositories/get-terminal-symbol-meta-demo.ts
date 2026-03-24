import type {
  TerminalExchange,
  TerminalSymbolMetaDto,
  TerminalSymbolMetaResponse,
} from "@/src/shared/model/terminal/contracts";

type TerminalSymbolMetaInput = {
  exchange?: string;
  symbol?: string;
};

const DEFAULT_EXCHANGE: TerminalExchange = "binance";
const QUOTE_ASSETS = ["USDT", "USDC", "BTC", "ETH", "BNB"] as const;

function normalizeExchange(input?: string) {
  const normalized = input?.trim().toLowerCase();
  if (!normalized) return DEFAULT_EXCHANGE;
  return normalized === DEFAULT_EXCHANGE ? DEFAULT_EXCHANGE : null;
}

function normalizeSymbol(input?: string) {
  return input?.trim().toUpperCase() ?? "";
}

function deriveFilters(baseAsset: string, quoteAsset: string) {
  if (quoteAsset === "BTC") {
    return {
      tickSize: "0.000001",
      stepSize: "0.0001",
      minQty: "0.0001",
      minNotional: "0.0005",
    };
  }

  if (baseAsset === "BTC") {
    return {
      tickSize: "0.10",
      stepSize: "0.00001",
      minQty: "0.00001",
      minNotional: "5",
    };
  }

  if (baseAsset === "ETH") {
    return {
      tickSize: "0.01",
      stepSize: "0.0001",
      minQty: "0.0001",
      minNotional: "5",
    };
  }

  return {
    tickSize: "0.01",
    stepSize: "0.1",
    minQty: "0.1",
    minNotional: "5",
  };
}

function buildSymbolMeta(symbol: string, exchange: TerminalExchange): TerminalSymbolMetaDto | null {
  const quoteAsset = QUOTE_ASSETS.find((quote) => symbol.endsWith(quote));
  if (!quoteAsset) return null;

  const baseAsset = symbol.slice(0, -quoteAsset.length);
  if (!baseAsset || !/^[A-Z0-9]{2,12}$/.test(baseAsset)) return null;

  return {
    exchange,
    symbol,
    baseAsset,
    quoteAsset,
    status: "TRADING",
    filters: deriveFilters(baseAsset, quoteAsset),
  };
}

export async function getDemoTerminalSymbolMeta(input: TerminalSymbolMetaInput = {}): Promise<TerminalSymbolMetaResponse> {
  const exchange = normalizeExchange(input.exchange);
  if (!exchange) {
    return {
      ok: false,
      error: {
        code: "unsupported_exchange",
        message: "Only binance is supported for terminal symbol meta right now.",
      },
    };
  }

  const symbol = normalizeSymbol(input.symbol);
  if (!symbol || !/^[A-Z0-9]{5,20}$/.test(symbol)) {
    return {
      ok: false,
      error: {
        code: "invalid_symbol",
        message: "Symbol must look like an uppercase market pair such as BTCUSDT.",
      },
    };
  }

  const meta = buildSymbolMeta(symbol, exchange);
  if (!meta) {
    return {
      ok: false,
      error: {
        code: "symbol_not_found",
        message: `No mock-safe symbol meta mapping is available for ${symbol}.`,
      },
    };
  }

  return {
    ok: true,
    symbol: meta,
  };
}
