import type {
  TerminalAccountValuationResponse,
  TerminalBalancesResponse,
  TerminalCancelAllOrdersRequest,
  TerminalCancelAllOrdersResponse,
  TerminalCancelOrderRequest,
  TerminalCancelOrderResponse,
  TerminalExchange,
  TerminalOpenOrdersResponse,
  TerminalOrderHistoryResponse,
  TerminalOrderTestRequest,
  TerminalOrderTestResponse,
  TerminalPnlResponse,
  TerminalPlaceOrderRequest,
  TerminalPlaceOrderResponse,
  TerminalScalpMarketResponse,
  TerminalSymbolMetaResponse,
} from "@/src/shared/model/terminal/contracts";

export type TerminalAdapterContext = {
  exchange: TerminalExchange;
};

export type TerminalSymbolMetaAdapter = {
  getSymbolMeta: (input: { exchange?: string; symbol?: string }) => Promise<TerminalSymbolMetaResponse>;
};

export type TerminalMarketDataAdapter = {
  getScalpMarket: (input: { exchange?: string; symbol?: string }) => Promise<TerminalScalpMarketResponse>;
};

export type TerminalExecutionAdapter = {
  testOrder: (input: Partial<TerminalOrderTestRequest> | null | undefined) => Promise<TerminalOrderTestResponse>;
  placeOrder: (input: Partial<TerminalPlaceOrderRequest> | null | undefined) => Promise<TerminalPlaceOrderResponse>;
  cancelOrder: (input: Partial<TerminalCancelOrderRequest> | null | undefined) => Promise<TerminalCancelOrderResponse>;
  cancelAllOrders: (
    input: Partial<TerminalCancelAllOrdersRequest> | null | undefined,
  ) => Promise<TerminalCancelAllOrdersResponse>;
};

export type TerminalAccountReadAdapter = {
  getBalances: (input?: { exchange?: string; symbol?: string }) => Promise<TerminalBalancesResponse>;
  getAccountValuation: (input?: { exchange?: string }) => Promise<TerminalAccountValuationResponse>;
  getPnl: (input?: { exchange?: string }) => Promise<TerminalPnlResponse>;
  getOpenOrders: (input?: { exchange?: string; symbol?: string }) => Promise<TerminalOpenOrdersResponse>;
  getOrderHistory: (input?: {
    exchange?: string;
    symbol?: string;
    limit?: number | string;
  }) => Promise<TerminalOrderHistoryResponse>;
};
