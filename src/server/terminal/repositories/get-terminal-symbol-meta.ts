import { getTerminalSymbolMetaAdapter } from "@/src/server/terminal/adapters";
import type { TerminalSymbolMetaResponse } from "@/src/shared/model/terminal/contracts";

type TerminalSymbolMetaInput = {
  exchange?: string;
  symbol?: string;
};

export async function getTerminalSymbolMeta(input: TerminalSymbolMetaInput = {}): Promise<TerminalSymbolMetaResponse> {
  return getTerminalSymbolMetaAdapter().getSymbolMeta(input);
}
