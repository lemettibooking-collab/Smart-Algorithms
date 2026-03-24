import type { TerminalBootstrapResponse } from "@/src/shared/model/terminal/contracts";
import type { TerminalSessionHydration, TerminalSessionState } from "@/src/entities/terminal-session";

export type {
  TerminalBootstrapResponse,
  TerminalConnectionState,
  TerminalExchange,
  TerminalMode,
  TerminalTradeMode,
} from "@/src/shared/model/terminal/contracts";

export type { TerminalSessionState };
export type { TerminalSessionHydration as TerminalShellParams };

export type TerminalShellProps = TerminalSessionHydration & {
  bootstrap: TerminalBootstrapResponse;
};
