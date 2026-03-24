import type { RefreshReason } from "@/src/server/terminal/account/domain/terminal-account.types";
import type { TerminalAccountScope } from "@/src/server/terminal/account/domain/terminal-account-scope";
import type {
  TerminalBalanceDto,
  TerminalOrderDto,
  TerminalPnlPositionDto,
} from "@/src/shared/model/terminal/contracts";

export type TerminalAccountMarketHealthSnapshot = {
  state: "connected" | "stale" | "disconnected";
  asOf: string | null;
};

export type TerminalAccountSnapshot = {
  scope: TerminalAccountScope;
  version: number;
  updatedAt: string;
  refreshReason: RefreshReason;
  marketHealth: TerminalAccountMarketHealthSnapshot;
  balances: TerminalBalanceDto[];
  openOrders: TerminalOrderDto[];
  history: TerminalOrderDto[];
  positions: TerminalPnlPositionDto[];
  pnl: {
    realized: number;
    unrealized: number;
  };
  equity: {
    total: number;
    cash: number;
    locked: number;
  };
};
