import type {
  TerminalExchange,
  TerminalOrderSide,
  TerminalOrderType,
  TerminalTradeMode,
} from "@/src/shared/model/terminal/contracts";
import type {
  ScalpActionMode,
  ScalpOrderIntent,
  ScalpOrderIntentSource,
  ScalpTerminalInstance,
} from "@/src/widgets/terminal-scalp-workspace/model/types";

const SCALP_BOARD_STORAGE_KEY = "sa:terminal:scalp-board:v1";

type PersistedScalpBoardState = {
  version: 1;
  terminals: ScalpTerminalInstance[];
};

type PersistedScalpBoardDefaults = {
  defaultExchange: TerminalExchange;
  defaultTradeMode: TerminalTradeMode;
  defaultQuantity?: string;
};

function isTerminalExchange(value: unknown): value is TerminalExchange {
  return value === "binance" || value === "mexc";
}

function isTradeMode(value: unknown): value is TerminalTradeMode {
  return value === "demo" || value === "live";
}

function isOrderSide(value: unknown): value is TerminalOrderSide {
  return value === "BUY" || value === "SELL";
}

function isOrderType(value: unknown): value is TerminalOrderType {
  return value === "MARKET" || value === "LIMIT";
}

function isIntentSource(value: unknown): value is ScalpOrderIntentSource {
  return value === "manual" || value === "dom";
}

function isActionMode(value: unknown): value is ScalpActionMode {
  return value === "ENTRY" || value === "SL" || value === "TP";
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSymbol(value: unknown) {
  return normalizeString(value).toUpperCase();
}

function sanitizeIntent(value: unknown, defaults: PersistedScalpBoardDefaults): ScalpOrderIntent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ScalpOrderIntent>;

  return {
    side: isOrderSide(raw.side) ? raw.side : "BUY",
    type: isOrderType(raw.type) ? raw.type : "MARKET",
    quantity: normalizeString(raw.quantity) || defaults.defaultQuantity || "0.1",
    price: normalizeString(raw.price),
    source: isIntentSource(raw.source) ? raw.source : "manual",
    actionMode: isActionMode(raw.actionMode) ? raw.actionMode : "ENTRY",
    slPrice: normalizeString(raw.slPrice),
    tpPrice: normalizeString(raw.tpPrice),
  };
}

function sanitizeTerminal(
  value: unknown,
  defaults: PersistedScalpBoardDefaults,
): ScalpTerminalInstance | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ScalpTerminalInstance>;
  const id = normalizeString(raw.id);
  const symbol = normalizeSymbol(raw.symbol);
  const intent = sanitizeIntent(raw.intent, defaults);

  if (!id || !symbol || !/^[A-Z0-9_]{5,20}$/.test(symbol) || !intent) {
    return null;
  }

  return {
    id,
    symbol,
    exchange: isTerminalExchange(raw.exchange) ? raw.exchange : defaults.defaultExchange,
    tradeMode: isTradeMode(raw.tradeMode) ? raw.tradeMode : defaults.defaultTradeMode,
    intent,
  };
}

export function loadPersistedScalpBoard(
  defaults: PersistedScalpBoardDefaults,
): ScalpTerminalInstance[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SCALP_BOARD_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedScalpBoardState> | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.terminals)) {
      return null;
    }

    const terminals = parsed.terminals
      .map((terminal) => sanitizeTerminal(terminal, defaults))
      .filter((terminal): terminal is ScalpTerminalInstance => terminal !== null);

    if (parsed.terminals.length === 0) return [];
    return terminals.length ? terminals : null;
  } catch {
    return null;
  }
}

export function savePersistedScalpBoard(terminals: ScalpTerminalInstance[]) {
  if (typeof window === "undefined") return;

  const payload: PersistedScalpBoardState = {
    version: 1,
    terminals,
  };

  window.localStorage.setItem(SCALP_BOARD_STORAGE_KEY, JSON.stringify(payload));
}
