import type {
  TerminalBootstrapAccountPreviewDto,
  TerminalBootstrapResponse,
  TerminalBootstrapTerminalDto,
  TerminalExchange,
} from "@/src/shared/model/terminal/contracts";
import { getTerminalSymbolMetaAdapter } from "@/src/server/terminal/adapters";

type TerminalBootstrapInput = {
  symbol?: string;
  exchange?: string;
};

const DEFAULT_EXCHANGE: TerminalExchange = "binance";
const TERMINAL_DEFAULTS: TerminalBootstrapTerminalDto = {
  defaultExchange: DEFAULT_EXCHANGE,
  defaultMode: "chart",
  pinnedSymbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
  supportedModes: ["chart", "scalp"],
};

const ACCOUNT_PREVIEW: TerminalBootstrapAccountPreviewDto = {
  demo: true,
  connected: false,
  balancesPreview: [
    { asset: "USDT", free: "10000.00", locked: "0.00" },
    { asset: "BTC", free: "0.1500", locked: "0.0000" },
    { asset: "ETH", free: "2.5000", locked: "0.0000" },
  ],
};

function normalizeExchange(exchange?: string): TerminalExchange {
  const normalized = exchange?.trim().toLowerCase();
  if (normalized === "mexc") return "mexc";
  return normalized === DEFAULT_EXCHANGE ? DEFAULT_EXCHANGE : DEFAULT_EXCHANGE;
}

function normalizeSymbol(symbol?: string) {
  const normalized = symbol?.trim().toUpperCase();
  return normalized || "";
}

export async function getTerminalBootstrap(input: TerminalBootstrapInput = {}): Promise<TerminalBootstrapResponse> {
  const exchange = normalizeExchange(input.exchange);
  const symbol = normalizeSymbol(input.symbol);
  const symbolMeta = await getTerminalSymbolMetaAdapter().getSymbolMeta({ exchange, symbol });

  return {
    ok: true,
    terminal: TERMINAL_DEFAULTS,
    account: ACCOUNT_PREVIEW,
    symbol: symbolMeta.ok ? symbolMeta.symbol : undefined,
  };
}
