"use client";

import { useEffect } from "react";
import { TerminalSessionProvider, useTerminalSession } from "@/src/entities/terminal-session";
import { useTerminalScalpMarket } from "@/src/shared/lib/terminal/use-terminal-scalp-market";
import { TerminalTopbar } from "@/src/widgets/terminal-topbar";
import { TerminalChartWorkspace } from "@/src/widgets/terminal-chart-workspace";
import { TerminalScalpWorkspace } from "@/src/widgets/terminal-scalp-workspace";
import type { TerminalBootstrapResponse, TerminalShellProps } from "@/src/widgets/terminal-shell/model/types";

function TerminalMarketConnectionSync() {
  const {
    state: { exchange, symbol },
    actions: { setConnectionState },
  } = useTerminalSession();
  const { connectionState } = useTerminalScalpMarket({ exchange, symbol });

  useEffect(() => {
    setConnectionState(connectionState);
  }, [connectionState, setConnectionState]);

  return null;
}

function TerminalShellContent({ bootstrap }: { bootstrap: TerminalBootstrapResponse }) {
  const {
    state: { mode },
  } = useTerminalSession();

  return (
    <main className={mode === "scalp" ? "space-y-2" : "space-y-4"}>
      <TerminalMarketConnectionSync />
      <TerminalTopbar bootstrap={bootstrap} />
      {mode === "scalp" ? <TerminalScalpWorkspace bootstrap={bootstrap} /> : <TerminalChartWorkspace bootstrap={bootstrap} />}
    </main>
  );
}

export function TerminalShell(props: TerminalShellProps) {
  const { bootstrap, ...sessionParams } = props;
  return (
    <TerminalSessionProvider key={`${sessionParams.mode}:${sessionParams.exchange}:${sessionParams.symbol}`} initialState={sessionParams}>
      <TerminalShellContent bootstrap={bootstrap} />
    </TerminalSessionProvider>
  );
}
