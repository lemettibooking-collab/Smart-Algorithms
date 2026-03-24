import type {
  TerminalBalancesResponse,
  TerminalExecutionErrorResponse,
  TerminalExchange,
  TerminalSymbolMetaErrorResponse,
} from "@/src/shared/model/terminal/contracts";

const DEFAULT_EXCHANGE: TerminalExchange = "binance";
const SUPPORTED_EXCHANGES = new Set<TerminalExchange>(["binance", "mexc"]);

export function normalizeSupportedTerminalExchange(input?: string): TerminalExchange | null {
  const normalized = input?.trim().toLowerCase();
  if (!normalized) return DEFAULT_EXCHANGE;
  return SUPPORTED_EXCHANGES.has(normalized as TerminalExchange) ? (normalized as TerminalExchange) : null;
}

export function buildUnsupportedExecutionResponse(message: string): TerminalExecutionErrorResponse {
  return {
    ok: false,
    error: {
      code: "unsupported_exchange",
      message,
    },
  };
}

export function buildUnsupportedSymbolMetaResponse(message: string): TerminalSymbolMetaErrorResponse {
  return {
    ok: false,
    error: {
      code: "unsupported_exchange",
      message,
    },
  };
}

export function buildUnsupportedBalancesResponse(message: string): TerminalBalancesResponse {
  return {
    ok: false,
    error: {
      code: "unsupported_exchange",
      message,
    },
  };
}
