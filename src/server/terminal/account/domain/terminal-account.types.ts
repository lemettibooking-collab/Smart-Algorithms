export type TerminalTradeMode = "paper" | "live";

export type TerminalExchange = "binance" | "mexc";

export type RefreshReason =
  | "initial"
  | "order_submit"
  | "order_cancel"
  | "fill"
  | "market_mark"
  | "periodic"
  | "reconnect";
