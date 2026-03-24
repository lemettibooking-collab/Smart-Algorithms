import type { TerminalAccountReadAdapter } from "@/src/server/terminal/adapters/contracts";
import { getPaperAccountValuation, mapValuationAssetsToBalances } from "@/src/server/terminal/core/paper-account-valuation";
import { getPaperPnlSummary } from "@/src/server/terminal/core/paper-pnl";
import {
  getTerminalOpenOrders,
  getTerminalOrderHistory,
} from "@/src/server/terminal/repositories/terminal-order-execution";
import {
  buildUnsupportedBalancesResponse,
  buildUnsupportedExecutionResponse,
  normalizeSupportedTerminalExchange,
} from "@/src/server/terminal/adapters/default/support";

function isSupportedExchange(exchange?: string) {
  return normalizeSupportedTerminalExchange(exchange) != null;
}

export const defaultTerminalAccountReadAdapter: TerminalAccountReadAdapter = {
  async getBalances(input) {
    const exchange = normalizeSupportedTerminalExchange(input?.exchange);
    if (!exchange) {
      return buildUnsupportedBalancesResponse("Only binance and mexc terminal balances are supported right now.");
    }

    const valuation = await getPaperAccountValuation({ exchange });
    if (!valuation.ok) {
      return valuation;
    }

    return {
      ok: true,
      balances: mapValuationAssetsToBalances(valuation.account.assets),
    };
  },

  async getAccountValuation(input) {
    const exchange = normalizeSupportedTerminalExchange(input?.exchange);
    if (!exchange) {
      return buildUnsupportedExecutionResponse("Only binance and mexc terminal equity queries are supported right now.");
    }

    return getPaperAccountValuation({ exchange });
  },

  async getPnl(input) {
    const exchange = normalizeSupportedTerminalExchange(input?.exchange);
    if (!exchange) {
      return buildUnsupportedExecutionResponse("Only binance and mexc terminal PnL queries are supported right now.");
    }

    return getPaperPnlSummary({ exchange });
  },

  async getOpenOrders(input) {
    if (!isSupportedExchange(input?.exchange)) {
      return buildUnsupportedExecutionResponse("Only binance and mexc terminal read-side queries are supported right now.");
    }

    return getTerminalOpenOrders(input);
  },

  async getOrderHistory(input) {
    if (!isSupportedExchange(input?.exchange)) {
      return buildUnsupportedExecutionResponse("Only binance and mexc terminal read-side queries are supported right now.");
    }

    return getTerminalOrderHistory(input);
  },
};
