import type { TerminalExchange, TerminalMode, TerminalShellParams } from "@/src/widgets/terminal-shell/model/types";

type SearchParamValue = string | string[] | undefined;

type TerminalSearchParams = Record<string, SearchParamValue>;

const DEFAULT_SYMBOL = "BTCUSDT";
const DEFAULT_EXCHANGE: TerminalExchange = "binance";
const DEFAULT_MODE: TerminalMode = "chart";

function firstValue(value: SearchParamValue) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeSymbol(value: SearchParamValue) {
  const normalized = firstValue(value)?.trim().toUpperCase();
  return normalized ? normalized : DEFAULT_SYMBOL;
}

function normalizeExchange(value: SearchParamValue): TerminalExchange {
  const normalized = firstValue(value)?.trim().toLowerCase();
  if (normalized === "mexc") return "mexc";
  return normalized === "binance" ? "binance" : DEFAULT_EXCHANGE;
}

function normalizeMode(value: SearchParamValue): TerminalMode {
  const mode = firstValue(value)?.trim().toLowerCase();
  return mode === "scalp" ? "scalp" : DEFAULT_MODE;
}

export function normalizeTerminalSearchParams(searchParams?: TerminalSearchParams): TerminalShellParams {
  return {
    symbol: normalizeSymbol(searchParams?.symbol),
    exchange: normalizeExchange(searchParams?.exchange),
    mode: normalizeMode(searchParams?.mode),
  };
}
