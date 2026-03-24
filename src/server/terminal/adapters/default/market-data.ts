import { getTerminalScalpMarket } from "@/src/server/terminal/repositories/get-terminal-scalp-market";
import type { TerminalMarketDataAdapter } from "@/src/server/terminal/adapters/contracts";

export const defaultTerminalMarketDataAdapter: TerminalMarketDataAdapter = {
  async getScalpMarket(input) {
    return getTerminalScalpMarket(input);
  },
};
