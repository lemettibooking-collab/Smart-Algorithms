export type {
  TerminalConnectionState,
  TerminalExchange,
  TerminalMode,
  TerminalTradeMode,
} from "@/src/shared/model/terminal/contracts";
import type {
  TerminalConnectionState,
  TerminalExchange,
  TerminalMode,
  TerminalTradeMode,
} from "@/src/shared/model/terminal/contracts";

export type TerminalSessionState = {
  mode: TerminalMode;
  exchange: TerminalExchange;
  symbol: string;
  connectionState: TerminalConnectionState;
  tradeMode: TerminalTradeMode;
};

export type TerminalSessionHydration = Pick<TerminalSessionState, "mode" | "exchange" | "symbol">;

export type TerminalSessionActions = {
  setMode: (mode: TerminalMode) => void;
  setExchange: (exchange: TerminalExchange) => void;
  setSymbol: (symbol: string) => void;
  setTradeMode: (tradeMode: TerminalTradeMode) => void;
  setConnectionState: (connectionState: TerminalConnectionState) => void;
  hydrate: (state: TerminalSessionHydration) => void;
};

export type TerminalSessionStore = {
  state: TerminalSessionState;
  actions: TerminalSessionActions;
};
