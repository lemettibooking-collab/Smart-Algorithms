"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  TerminalConnectionState,
  TerminalExchange,
  TerminalMode,
  TerminalSessionHydration,
  TerminalSessionStore,
  TerminalTradeMode,
} from "@/src/entities/terminal-session/model/types";

const DEFAULT_CONNECTION_STATE: TerminalConnectionState = "idle";
const DEFAULT_TRADE_MODE: TerminalTradeMode = "demo";

const TerminalSessionContext = createContext<TerminalSessionStore | null>(null);

export function TerminalSessionProvider({
  initialState,
  children,
}: {
  initialState: TerminalSessionHydration;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<TerminalMode>(initialState.mode);
  const [exchange, setExchange] = useState<TerminalExchange>(initialState.exchange);
  const [symbol, setSymbol] = useState(initialState.symbol);
  const [connectionState, setConnectionState] = useState<TerminalConnectionState>(DEFAULT_CONNECTION_STATE);
  const [tradeMode, setTradeMode] = useState<TerminalTradeMode>(DEFAULT_TRADE_MODE);

  const store = useMemo<TerminalSessionStore>(
    () => ({
      state: {
        mode,
        exchange,
        symbol,
        connectionState,
        tradeMode,
      },
      actions: {
        setMode,
        setExchange,
        setSymbol,
        setTradeMode,
        setConnectionState,
        hydrate: (state) => {
          setMode(state.mode);
          setExchange(state.exchange);
          setSymbol(state.symbol);
        },
      },
    }),
    [connectionState, exchange, mode, symbol, tradeMode],
  );

  return <TerminalSessionContext.Provider value={store}>{children}</TerminalSessionContext.Provider>;
}

export function useTerminalSession() {
  const context = useContext(TerminalSessionContext);
  if (!context) {
    throw new Error("useTerminalSession must be used within TerminalSessionProvider");
  }
  return context;
}
