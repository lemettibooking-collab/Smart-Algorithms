import type {
  TerminalAccountReadAdapter,
  TerminalExecutionAdapter,
  TerminalMarketDataAdapter,
  TerminalSymbolMetaAdapter,
} from "@/src/server/terminal/adapters/contracts";
import { binanceTerminalMarketDataAdapter } from "@/src/server/terminal/adapters/binance/market-data";
import { binanceTerminalSymbolMetaAdapter } from "@/src/server/terminal/adapters/binance/symbol-meta";
import { defaultTerminalAccountReadAdapter } from "@/src/server/terminal/adapters/default/account-read";
import { defaultTerminalExecutionAdapter } from "@/src/server/terminal/adapters/default/execution";
import { defaultTerminalMarketDataAdapter } from "@/src/server/terminal/adapters/default/market-data";
import { defaultTerminalSymbolMetaAdapter } from "@/src/server/terminal/adapters/default/symbol-meta";
import { mexcTerminalMarketDataAdapter } from "@/src/server/terminal/adapters/mexc/market-data";
import { mexcTerminalSymbolMetaAdapter } from "@/src/server/terminal/adapters/mexc/symbol-meta";

export type {
  TerminalAccountReadAdapter,
  TerminalExecutionAdapter,
  TerminalMarketDataAdapter,
  TerminalSymbolMetaAdapter,
} from "@/src/server/terminal/adapters/contracts";

const routedTerminalSymbolMetaAdapter: TerminalSymbolMetaAdapter = {
  async getSymbolMeta(input) {
    const exchange = input.exchange?.trim().toLowerCase();
    if (!exchange || exchange === "binance") {
      return binanceTerminalSymbolMetaAdapter.getSymbolMeta(input);
    }
    if (exchange === "mexc") {
      return mexcTerminalSymbolMetaAdapter.getSymbolMeta(input);
    }

    return defaultTerminalSymbolMetaAdapter.getSymbolMeta(input);
  },
};

const routedTerminalMarketDataAdapter: TerminalMarketDataAdapter = {
  async getScalpMarket(input) {
    const exchange = input.exchange?.trim().toLowerCase();
    if (!exchange || exchange === "binance") {
      return binanceTerminalMarketDataAdapter.getScalpMarket(input);
    }
    if (exchange === "mexc") {
      return mexcTerminalMarketDataAdapter.getScalpMarket(input);
    }

    return defaultTerminalMarketDataAdapter.getScalpMarket(input);
  },
};

export function getTerminalSymbolMetaAdapter(): TerminalSymbolMetaAdapter {
  return routedTerminalSymbolMetaAdapter;
}

export function getTerminalMarketDataAdapter(): TerminalMarketDataAdapter {
  return routedTerminalMarketDataAdapter;
}

export function getTerminalExecutionAdapter(): TerminalExecutionAdapter {
  return defaultTerminalExecutionAdapter;
}

export function getTerminalAccountReadAdapter(): TerminalAccountReadAdapter {
  return defaultTerminalAccountReadAdapter;
}
