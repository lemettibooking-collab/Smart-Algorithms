import { getDemoTerminalSymbolMeta } from "@/src/server/terminal/repositories/get-terminal-symbol-meta-demo";
import type { TerminalSymbolMetaAdapter } from "@/src/server/terminal/adapters/contracts";

export const defaultTerminalSymbolMetaAdapter: TerminalSymbolMetaAdapter = {
  async getSymbolMeta(input) {
    return getDemoTerminalSymbolMeta(input);
  },
};
