import type {
  TerminalExchange,
  TerminalOrderSide,
  TerminalOrderType,
  TerminalTradeMode,
} from "@/src/shared/model/terminal/contracts";

export type ScalpOrderIntentSource = "manual" | "dom";
export type ScalpActionMode = "ENTRY" | "SL" | "TP";

export type ScalpOrderIntent = {
  side: TerminalOrderSide;
  type: TerminalOrderType;
  quantity: string;
  price: string;
  source: ScalpOrderIntentSource;
  actionMode: ScalpActionMode;
  slPrice: string;
  tpPrice: string;
};

export type ScalpTerminalInstance = {
  id: string;
  symbol: string;
  exchange: TerminalExchange;
  tradeMode: TerminalTradeMode;
  intent: ScalpOrderIntent;
};
