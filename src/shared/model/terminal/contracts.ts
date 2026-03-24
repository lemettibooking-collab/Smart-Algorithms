export type TerminalMode = "chart" | "scalp";

export type TerminalExchange = "binance" | "mexc";

export type TerminalTradeMode = "demo" | "live";

export type TerminalConnectionState = "idle" | "connecting" | "connected" | "stale" | "reconnecting" | "disconnected";

export type TerminalMarketHealthSource = "exchange_snapshot" | "demo_fallback";
export type TerminalMarketTransportMode = "stream" | "snapshot";

export type TerminalMarketHealthDto = {
  connectionState: TerminalConnectionState;
  source: TerminalMarketHealthSource;
  snapshotAgeMs: number | null;
  updatedAt: number | null;
  fallbackUsed: boolean;
  transport?: TerminalMarketTransportMode;
};

export type TerminalBootstrapTerminalDto = {
  defaultExchange: TerminalExchange;
  defaultMode: TerminalMode;
  pinnedSymbols: string[];
  supportedModes: TerminalMode[];
};

export type TerminalBootstrapAccountPreviewDto = {
  demo: boolean;
  connected: boolean;
  balancesPreview: Array<{
    asset: string;
    free: string;
    locked: string;
  }>;
};

export type TerminalSymbolMetaDto = {
  exchange: TerminalExchange;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  filters: {
    tickSize?: string;
    stepSize?: string;
    minQty?: string;
    minNotional?: string;
  };
};

export type TerminalBootstrapResponse = {
  ok: true;
  terminal: TerminalBootstrapTerminalDto;
  account: TerminalBootstrapAccountPreviewDto;
  symbol?: TerminalSymbolMetaDto;
};

export type TerminalSymbolMetaErrorCode = "unsupported_exchange" | "invalid_symbol" | "symbol_not_found";

export type TerminalSymbolMetaErrorResponse = {
  ok: false;
  error: {
    code: TerminalSymbolMetaErrorCode;
    message: string;
  };
};

export type TerminalSymbolMetaResponse =
  | {
      ok: true;
      symbol: TerminalSymbolMetaDto;
    }
  | TerminalSymbolMetaErrorResponse;

export type TerminalOrderSide = "BUY" | "SELL";

export type TerminalOrderType = "MARKET" | "LIMIT";

export type TerminalOrderDraft = {
  exchange: TerminalExchange;
  symbol: string;
  side: TerminalOrderSide;
  type: TerminalOrderType;
  quantity: string;
  price?: string;
  mode: TerminalTradeMode;
};

export type TerminalOrderValidationField = "symbol" | "side" | "type" | "quantity" | "price" | "mode";

export type TerminalOrderValidationIssue = {
  code: string;
  message: string;
  field?: TerminalOrderValidationField;
};

export type TerminalOrderValidationResult = {
  ok: boolean;
  issues: TerminalOrderValidationIssue[];
};

export type TerminalOrderStatus = "NEW" | "PARTIALLY_FILLED" | "FILLED" | "CANCELED" | "REJECTED" | "EXPIRED";

export type TerminalOrderDto = {
  id: string;
  exchange: TerminalExchange;
  symbol: string;
  side: TerminalOrderSide;
  type: TerminalOrderType;
  status: TerminalOrderStatus;
  price: string | null;
  origQty: string;
  executedQty: string;
  createdAt: string;
};

export type TerminalExecutionErrorCode =
  | "invalid_request"
  | "unsupported_exchange"
  | "live_mode_disabled"
  | "validation_failed"
  | "symbol_meta_unavailable"
  | "order_not_found";

export type TerminalExecutionErrorResponse = {
  ok: false;
  error: {
    code: TerminalExecutionErrorCode;
    message: string;
    issues?: TerminalOrderValidationIssue[];
  };
};

export type TerminalOrderTestRequest = TerminalOrderDraft;

export type TerminalOrderTestResponse =
  | {
      ok: true;
      validation: TerminalOrderValidationResult;
      symbol: TerminalSymbolMetaDto;
    }
  | TerminalExecutionErrorResponse;

export type TerminalPlaceOrderRequest = TerminalOrderDraft;

export type TerminalPlaceOrderResponse =
  | {
      ok: true;
      order: TerminalOrderDto;
      duplicated?: boolean;
    }
  | TerminalExecutionErrorResponse;

export type TerminalCancelOrderRequest = {
  exchange: TerminalExchange;
  symbol: string;
  orderId: string;
  mode: TerminalTradeMode;
};

export type TerminalCancelOrderResponse =
  | {
      ok: true;
      order: TerminalOrderDto;
    }
  | TerminalExecutionErrorResponse;

export type TerminalCancelAllOrdersRequest = {
  exchange: TerminalExchange;
  symbol: string;
  mode: TerminalTradeMode;
};

export type TerminalCancelAllOrdersResponse =
  | {
      ok: true;
      orders: TerminalOrderDto[];
      canceledCount: number;
    }
  | TerminalExecutionErrorResponse;

export type TerminalBalanceDto = {
  asset: string;
  free: string;
  locked: string;
  usdValue?: number | null;
};

export type TerminalDomLevelDto = {
  price: string;
  bidSize?: string | null;
  askSize?: string | null;
  bidTotal?: string | null;
  askTotal?: string | null;
};

export type TerminalTapeTradeDto = {
  id: string;
  side: "buy" | "sell";
  price: string;
  qty: string;
  ts: number;
};

export type TerminalScalpMarketDto = {
  exchange: TerminalExchange;
  symbol: string;
  bestBid: string;
  bestAsk: string;
  spread: string;
  midPrice: string;
  dom: TerminalDomLevelDto[];
  tape: TerminalTapeTradeDto[];
  updatedAt: number;
};

export type TerminalBalancesResponse =
  | {
      ok: true;
      balances: TerminalBalanceDto[];
    }
  | TerminalExecutionErrorResponse;

export type TerminalAccountValuationAssetDto = {
  asset: string;
  free: string;
  locked: string;
  total: string;
  priceUsd: number | null;
  usdValue: number | null;
  pricingSymbol?: string | null;
  updatedAt?: number | null;
};

export type TerminalAccountValuationDto = {
  exchange: TerminalExchange;
  equityUsd: number;
  assets: TerminalAccountValuationAssetDto[];
  updatedAt: number;
};

export type TerminalAccountValuationResponse =
  | {
      ok: true;
      account: TerminalAccountValuationDto;
    }
  | TerminalExecutionErrorResponse;

export type TerminalPnlPositionDto = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  quantity: string;
  avgEntryPrice: string | null;
  markPrice: string | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  marketValueUsd: number | null;
  updatedAt: number | null;
};

export type TerminalPnlSummaryDto = {
  exchange: TerminalExchange;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  positions: TerminalPnlPositionDto[];
  updatedAt: number;
};

export type TerminalPnlResponse =
  | {
      ok: true;
      pnl: TerminalPnlSummaryDto;
    }
  | TerminalExecutionErrorResponse;

export type TerminalOpenOrdersResponse =
  | {
      ok: true;
      orders: TerminalOrderDto[];
    }
  | TerminalExecutionErrorResponse;

export type TerminalOrderHistoryResponse =
  | {
      ok: true;
      orders: TerminalOrderDto[];
    }
  | TerminalExecutionErrorResponse;

export type TerminalScalpMarketResponse =
  | {
      ok: true;
      market: TerminalScalpMarketDto;
      health: TerminalMarketHealthDto;
    }
  | TerminalSymbolMetaErrorResponse;
