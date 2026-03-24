import type { TerminalExchange, TerminalTradeMode } from "@/src/server/terminal/account/domain/terminal-account.types";

export type TerminalAccountScope = {
  tradeMode: "paper";
  exchange: TerminalExchange;
};

export type ScopeKey = `paper:${"binance" | "mexc"}`;

export function toScopeKey(scope: TerminalAccountScope): ScopeKey {
  return `${scope.tradeMode}:${scope.exchange}`;
}

export function isSupportedTerminalAccountTradeMode(value: string | null | undefined): value is TerminalTradeMode {
  return value === "paper" || value === "live";
}

export function isSupportedTerminalAccountExchange(value: string | null | undefined): value is TerminalExchange {
  return value === "binance" || value === "mexc";
}

export function toTerminalAccountScope(input: {
  tradeMode?: string | null;
  exchange?: string | null;
}): TerminalAccountScope | null {
  const tradeMode = input.tradeMode?.trim().toLowerCase();
  const exchange = input.exchange?.trim().toLowerCase();

  if (tradeMode !== "paper") return null;
  if (exchange !== "binance" && exchange !== "mexc") return null;

  return {
    tradeMode: "paper",
    exchange,
  };
}
