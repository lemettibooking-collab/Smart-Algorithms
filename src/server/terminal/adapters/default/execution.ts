import type { TerminalExecutionAdapter } from "@/src/server/terminal/adapters/contracts";
import {
  cancelAllTerminalOrdersBySymbol,
  cancelTerminalOrder,
  placeTerminalOrder,
  testTerminalOrder,
} from "@/src/server/terminal/repositories/terminal-order-execution";
import { buildUnsupportedExecutionResponse, normalizeSupportedTerminalExchange } from "@/src/server/terminal/adapters/default/support";

function ensureSupportedExchange(exchange?: string) {
  return normalizeSupportedTerminalExchange(exchange)
    ? null
    : buildUnsupportedExecutionResponse("Only binance and mexc terminal paper execution are supported right now.");
}

export const defaultTerminalExecutionAdapter: TerminalExecutionAdapter = {
  async testOrder(input) {
    const exchangeError = ensureSupportedExchange(input?.exchange);
    if (exchangeError) return exchangeError;
    return testTerminalOrder(input);
  },

  async placeOrder(input) {
    const exchangeError = ensureSupportedExchange(input?.exchange);
    if (exchangeError) return exchangeError;
    return placeTerminalOrder(input);
  },

  async cancelOrder(input) {
    const exchangeError = ensureSupportedExchange(input?.exchange);
    if (exchangeError) return exchangeError;
    return cancelTerminalOrder(input);
  },

  async cancelAllOrders(input) {
    const exchangeError = ensureSupportedExchange(input?.exchange);
    if (exchangeError) return exchangeError;
    return cancelAllTerminalOrdersBySymbol(input);
  },
};
