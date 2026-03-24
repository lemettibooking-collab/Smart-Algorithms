import { getDb } from "@/lib/db";
import { fetchBinanceDepthSnapshot } from "@/src/server/terminal/adapters/binance/client";
import { fetchMexcDepthSnapshot } from "@/src/server/terminal/adapters/mexc/client";
import {
  applyPaperMarketSlippage,
  buildPaperFillEconomics,
} from "@/src/server/terminal/core/paper-execution-config";
import {
  applyPaperBalanceDeltas,
  getPaperBalanceSnapshot,
  listPaperBalances,
} from "@/src/server/terminal/repositories/paper-account-repository";
import { createPaperFillLedgerEntry } from "@/src/server/terminal/repositories/paper-fill-ledger-repository";
import {
  cancelActiveOrdersBySymbol,
  createPaperOrder,
  findActiveOrderById,
  findRecentActiveOrderBySignature,
  listOpenPaperOrders,
  listPaperOrderHistory,
  updatePaperOrderStatus,
} from "@/src/server/terminal/repositories/paper-execution-repository";
import { getTerminalSymbolMeta } from "@/src/server/terminal/repositories/get-terminal-symbol-meta";
import { validateTerminalOrderDraft } from "@/src/shared/lib/terminal/validate-order";
import type {
  TerminalBalancesResponse,
  TerminalCancelAllOrdersRequest,
  TerminalCancelAllOrdersResponse,
  TerminalCancelOrderRequest,
  TerminalCancelOrderResponse,
  TerminalExecutionErrorResponse,
  TerminalOrderDraft,
  TerminalOrderHistoryResponse,
  TerminalOrderSide,
  TerminalOrderTestRequest,
  TerminalOrderTestResponse,
  TerminalOrderType,
  TerminalOpenOrdersResponse,
  TerminalPlaceOrderRequest,
  TerminalPlaceOrderResponse,
  TerminalExchange,
  TerminalSymbolMetaDto,
  TerminalTradeMode,
} from "@/src/shared/model/terminal/contracts";

const DEDUPE_WINDOW_MS = 5_000;
const DEFAULT_EXCHANGE = "binance" as const;

function executionError(
  code: TerminalExecutionErrorResponse["error"]["code"],
  message: string,
  issues?: TerminalExecutionErrorResponse["error"]["issues"],
): TerminalExecutionErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      issues,
    },
  };
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSymbol(value: unknown) {
  return normalizeString(value).toUpperCase();
}

function normalizeExchange(value: unknown) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return DEFAULT_EXCHANGE;
  if (normalized === "binance" || normalized === "mexc") return normalized;
  return null;
}

function normalizeMode(value: unknown): TerminalTradeMode {
  return normalizeString(value).toLowerCase() === "live" ? "live" : "demo";
}

function normalizeSide(value: unknown): TerminalOrderSide {
  return normalizeString(value).toUpperCase() === "SELL" ? "SELL" : "BUY";
}

function normalizeType(value: unknown): TerminalOrderType {
  return normalizeString(value).toUpperCase() === "MARKET" ? "MARKET" : "LIMIT";
}

function normalizeDraft(input: Partial<TerminalOrderDraft> | null | undefined): TerminalOrderDraft {
  return {
    exchange: normalizeExchange(input?.exchange) ?? DEFAULT_EXCHANGE,
    symbol: normalizeSymbol(input?.symbol),
    side: normalizeSide(input?.side),
    type: normalizeType(input?.type),
    quantity: normalizeString(input?.quantity),
    price: normalizeString(input?.price) || undefined,
    mode: normalizeMode(input?.mode),
  };
}

function normalizeCancelRequest(input: Partial<TerminalCancelOrderRequest> | null | undefined): TerminalCancelOrderRequest {
  return {
    exchange: normalizeExchange(input?.exchange) ?? DEFAULT_EXCHANGE,
    symbol: normalizeSymbol(input?.symbol),
    orderId: normalizeString(input?.orderId),
    mode: normalizeMode(input?.mode),
  };
}

function normalizeCancelAllRequest(
  input: Partial<TerminalCancelAllOrdersRequest> | null | undefined,
): TerminalCancelAllOrdersRequest {
  return {
    exchange: normalizeExchange(input?.exchange) ?? DEFAULT_EXCHANGE,
    symbol: normalizeSymbol(input?.symbol),
    mode: normalizeMode(input?.mode),
  };
}

function normalizeQueryExchange(value: unknown) {
  return normalizeExchange(value);
}

function normalizeLimit(value: unknown, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

function parsePositiveNumber(value: string | undefined | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatAmount(value: number) {
  const normalized = Number(value.toFixed(12));
  if (!Number.isFinite(normalized) || normalized <= 0) return "0";
  return normalized.toFixed(12).replace(/\.?0+$/, "");
}

async function getMarketReferencePrice(params: {
  exchange: TerminalExchange;
  symbol: string;
  side: TerminalOrderSide;
}): Promise<string | null> {
  if (params.exchange === "binance") {
    const depth = await fetchBinanceDepthSnapshot(params.symbol, 1);
    return params.side === "BUY" ? depth?.asks?.[0]?.[0] ?? null : depth?.bids?.[0]?.[0] ?? null;
  }

  if (params.exchange === "mexc") {
    const depth = await fetchMexcDepthSnapshot(params.symbol, 1);
    return params.side === "BUY" ? depth?.asks?.[0]?.[0] ?? null : depth?.bids?.[0]?.[0] ?? null;
  }

  return null;
}

function buildBalanceValidationIssue(message: string) {
  return [
    {
      code: "insufficient_balance",
      message,
      field: "quantity" as const,
    },
  ];
}

type ResolvedExecutionPlan =
  | {
      kind: "fill";
      liquidity: "maker" | "taker";
      orderStatus: "FILLED";
      executedQty: string;
      orderPrice: string;
      grossNotional: string;
      feeAmount: string;
      feeAsset: string | null;
      deltas: Array<{ asset: string; freeDelta?: number; lockedDelta?: number }>;
    }
  | {
      kind: "reserve";
      orderStatus: "NEW";
      executedQty: "0";
      orderPrice: string;
      deltas: Array<{ asset: string; freeDelta?: number; lockedDelta?: number }>;
    };

async function resolveExecutionPlan(params: {
  draft: TerminalOrderDraft;
  symbol: TerminalSymbolMetaDto;
}): Promise<
  | { ok: true; plan: ResolvedExecutionPlan }
  | TerminalExecutionErrorResponse
> {
  const quantity = parsePositiveNumber(params.draft.quantity);
  if (quantity == null) {
    return executionError("validation_failed", "Order draft failed validation.", [
      { code: "quantity_invalid", message: "Quantity must be a positive number.", field: "quantity" },
    ]);
  }

  const balances = getPaperBalanceSnapshot(params.draft.exchange);
  const baseFree = balances.get(params.symbol.baseAsset)?.free ?? 0;
  const quoteFree = balances.get(params.symbol.quoteAsset)?.free ?? 0;

  if (params.draft.type === "MARKET") {
    const marketPriceRaw = await getMarketReferencePrice({
      exchange: params.draft.exchange,
      symbol: params.draft.symbol,
      side: params.draft.side,
    });
    const referencePrice = parsePositiveNumber(marketPriceRaw);
    if (referencePrice == null) {
      return executionError(
        "validation_failed",
        "Order draft failed validation.",
        [{ code: "market_price_unavailable", message: "Current market price is unavailable for this pair.", field: "price" }],
      );
    }
    const marketPrice = applyPaperMarketSlippage({
      exchange: params.draft.exchange,
      side: params.draft.side,
      referencePrice,
    });
    const fillEconomics = buildPaperFillEconomics({
      exchange: params.draft.exchange,
      liquidity: "taker",
      side: params.draft.side,
      quantity,
      price: marketPrice,
      baseAsset: params.symbol.baseAsset,
      quoteAsset: params.symbol.quoteAsset,
      reserveSource: "free",
    });

    if (params.draft.side === "BUY") {
      const quoteCost = parsePositiveNumber(fillEconomics.grossNotional) ?? 0;
      if (quoteFree + 1e-12 < quoteCost) {
        return executionError(
          "validation_failed",
          "Order draft failed validation.",
          buildBalanceValidationIssue(
            `Insufficient ${params.symbol.quoteAsset} free balance for this buy order after paper slippage.`,
          ),
        );
      }

      return {
        ok: true,
        plan: {
          kind: "fill",
          liquidity: "taker",
          orderStatus: "FILLED",
          executedQty: params.draft.quantity,
          orderPrice: fillEconomics.orderPrice,
          grossNotional: fillEconomics.grossNotional,
          feeAmount: fillEconomics.feeAmount,
          feeAsset: fillEconomics.feeAsset,
          deltas: fillEconomics.balanceDeltas,
        },
      };
    }

    if (baseFree + 1e-12 < quantity) {
      return executionError(
        "validation_failed",
        "Order draft failed validation.",
        buildBalanceValidationIssue(`Insufficient ${params.symbol.baseAsset} free balance for this sell order.`),
      );
    }

    return {
      ok: true,
      plan: {
        kind: "fill",
        liquidity: "taker",
        orderStatus: "FILLED",
        executedQty: params.draft.quantity,
        orderPrice: fillEconomics.orderPrice,
        grossNotional: fillEconomics.grossNotional,
        feeAmount: fillEconomics.feeAmount,
        feeAsset: fillEconomics.feeAsset,
        deltas: fillEconomics.balanceDeltas,
      },
    };
  }

  const limitPrice = parsePositiveNumber(params.draft.price);
  if (limitPrice == null) {
    return executionError(
      "validation_failed",
      "Order draft failed validation.",
      [{ code: "price_invalid", message: "Price must be a positive number.", field: "price" }],
    );
  }

  if (params.draft.side === "BUY") {
    const quoteCost = quantity * limitPrice;
    if (quoteFree + 1e-12 < quoteCost) {
      return executionError(
        "validation_failed",
        "Order draft failed validation.",
        buildBalanceValidationIssue(`Insufficient ${params.symbol.quoteAsset} free balance for this buy order.`),
      );
    }

      return {
        ok: true,
        plan: {
          kind: "reserve",
        orderStatus: "NEW",
        executedQty: "0",
        orderPrice: params.draft.price ?? formatAmount(limitPrice),
        deltas: [
          { asset: params.symbol.quoteAsset, freeDelta: -quoteCost, lockedDelta: quoteCost },
        ],
      },
    };
  }

  if (baseFree + 1e-12 < quantity) {
    return executionError(
      "validation_failed",
      "Order draft failed validation.",
      buildBalanceValidationIssue(`Insufficient ${params.symbol.baseAsset} free balance for this sell order.`),
    );
  }

  return {
    ok: true,
    plan: {
      kind: "reserve",
      orderStatus: "NEW",
      executedQty: "0",
      orderPrice: params.draft.price ?? formatAmount(limitPrice),
      deltas: [{ asset: params.symbol.baseAsset, freeDelta: -quantity, lockedDelta: quantity }],
    },
  };
}

function buildCancelReleaseDeltas(order: {
  side: TerminalOrderSide;
  type: TerminalOrderType;
  price: string | null;
  origQty: string;
}, symbol: TerminalSymbolMetaDto) {
  if (order.type !== "LIMIT") return [];

  const quantity = parsePositiveNumber(order.origQty);
  if (quantity == null) return [];

  if (order.side === "BUY") {
    const price = parsePositiveNumber(order.price);
    if (price == null) return [];
    const reserved = quantity * price;
    return [{ asset: symbol.quoteAsset, freeDelta: reserved, lockedDelta: -reserved }];
  }

  return [{ asset: symbol.baseAsset, freeDelta: quantity, lockedDelta: -quantity }];
}

function ensureDemoMode(mode: TerminalTradeMode) {
  if (mode === "demo") return null;
  return executionError("live_mode_disabled", "Live terminal execution is not available in this environment yet.");
}

function buildPlaceSignature(draft: TerminalOrderDraft) {
  return [draft.exchange, draft.symbol, draft.side, draft.type, draft.quantity, draft.price ?? "", draft.mode].join("|");
}

async function resolveValidatedDraft(
  input: Partial<TerminalOrderDraft> | null | undefined,
): Promise<
  | {
      ok: true;
      draft: TerminalOrderDraft;
      symbol: TerminalSymbolMetaDto;
      plan: ResolvedExecutionPlan;
    }
  | TerminalExecutionErrorResponse
> {
  const draft = normalizeDraft(input);
  const symbolMeta = await getTerminalSymbolMeta({
    exchange: draft.exchange,
    symbol: draft.symbol,
  });

  if (!symbolMeta.ok) {
    return executionError("symbol_meta_unavailable", symbolMeta.error.message);
  }

  const validation = validateTerminalOrderDraft(draft, symbolMeta.symbol);
  if (!validation.ok) {
    return executionError("validation_failed", "Order draft failed validation.", validation.issues);
  }

  const executionPlan = await resolveExecutionPlan({
    draft,
    symbol: symbolMeta.symbol,
  });
  if (!executionPlan.ok) {
    return executionPlan;
  }

  return {
    ok: true,
    draft,
    symbol: symbolMeta.symbol,
    plan: executionPlan.plan,
  };
}

export async function testTerminalOrder(
  input: Partial<TerminalOrderTestRequest> | null | undefined,
): Promise<TerminalOrderTestResponse> {
  const resolved = await resolveValidatedDraft(input);
  if (!resolved.ok) return resolved;

  const modeError = ensureDemoMode(resolved.draft.mode);
  if (modeError) return modeError;

  return {
    ok: true,
    validation: { ok: true, issues: [] },
    symbol: resolved.symbol,
  };
}

export async function placeTerminalOrder(
  input: Partial<TerminalPlaceOrderRequest> | null | undefined,
): Promise<TerminalPlaceOrderResponse> {
  const resolved = await resolveValidatedDraft(input);
  if (!resolved.ok) return resolved;

  const modeError = ensureDemoMode(resolved.draft.mode);
  if (modeError) return modeError;

  const now = Date.now();

  const signature = buildPlaceSignature(resolved.draft);
  const existing = findRecentActiveOrderBySignature(signature, now - DEDUPE_WINDOW_MS);
  if (existing) {
    return {
      ok: true,
      order: existing,
      duplicated: true,
    };
  }

  const db = getDb();
  const tx = db.transaction(() => {
    applyPaperBalanceDeltas({
      exchange: resolved.draft.exchange,
      deltas: resolved.plan.deltas,
    }, db);

    const order = createPaperOrder(
      {
        draft: resolved.draft,
        dedupeSignature: signature,
        status: resolved.plan.orderStatus,
        executedQty: resolved.plan.executedQty,
        orderPrice: resolved.plan.orderPrice,
      },
      db,
    );

    if (resolved.plan.kind === "fill") {
      createPaperFillLedgerEntry(
        {
          orderId: order.id,
          exchange: order.exchange,
          symbol: order.symbol,
          side: order.side,
          baseAsset: resolved.symbol.baseAsset,
          quoteAsset: resolved.symbol.quoteAsset,
          qty: order.executedQty,
          price: order.price ?? resolved.plan.orderPrice,
          notional: resolved.plan.grossNotional,
          feeAmount: resolved.plan.feeAmount,
          feeAsset: resolved.plan.feeAsset,
          liquidity: resolved.plan.liquidity,
        },
        db,
      );
    }

    return order;
  });

  const order = tx();

  return {
    ok: true,
    order,
  };
}

export async function cancelTerminalOrder(
  input: Partial<TerminalCancelOrderRequest> | null | undefined,
): Promise<TerminalCancelOrderResponse> {
  const request = normalizeCancelRequest(input);

  const modeError = ensureDemoMode(request.mode);
  if (modeError) return modeError;

  if (!request.orderId) {
    return executionError("invalid_request", "orderId is required to cancel an order.");
  }

  const symbolMeta = await getTerminalSymbolMeta({ exchange: request.exchange, symbol: request.symbol });
  if (!symbolMeta.ok) {
    return executionError("symbol_meta_unavailable", symbolMeta.error.message);
  }

  const order = findActiveOrderById({
    orderId: request.orderId,
    exchange: request.exchange,
    symbol: request.symbol,
  });
  if (!order) {
    return executionError("order_not_found", "No active matching demo order was found to cancel.");
  }

  const db = getDb();
  const tx = db.transaction(() => {
    const releaseDeltas = buildCancelReleaseDeltas(order, symbolMeta.symbol);
    if (releaseDeltas.length) {
      applyPaperBalanceDeltas({
        exchange: request.exchange,
        deltas: releaseDeltas,
      }, db);
    }

    return updatePaperOrderStatus(
      {
        orderId: order.id,
        status: "CANCELED",
      },
      db,
    );
  });

  const canceledOrder = tx();
  if (!canceledOrder) {
    return executionError("order_not_found", "No active matching demo order was found to cancel.");
  }

  return {
    ok: true,
    order: canceledOrder,
  };
}

export async function cancelAllTerminalOrdersBySymbol(
  input: Partial<TerminalCancelAllOrdersRequest> | null | undefined,
): Promise<TerminalCancelAllOrdersResponse> {
  const request = normalizeCancelAllRequest(input);

  const modeError = ensureDemoMode(request.mode);
  if (modeError) return modeError;

  const symbolMeta = await getTerminalSymbolMeta({ exchange: request.exchange, symbol: request.symbol });
  if (!symbolMeta.ok) {
    return executionError("symbol_meta_unavailable", symbolMeta.error.message);
  }

  const openOrders = listOpenPaperOrders({
    exchange: request.exchange,
    symbol: request.symbol,
  });
  const db = getDb();
  const tx = db.transaction(() => {
    const releaseDeltas = openOrders.flatMap((order) => buildCancelReleaseDeltas(order, symbolMeta.symbol));
    if (releaseDeltas.length) {
      applyPaperBalanceDeltas({
        exchange: request.exchange,
        deltas: releaseDeltas,
      }, db);
    }

    return cancelActiveOrdersBySymbol(
      {
        exchange: request.exchange,
        symbol: request.symbol,
      },
      db,
    );
  });

  const canceledOrders = tx();

  return {
    ok: true,
    orders: canceledOrders,
    canceledCount: canceledOrders.length,
  };
}

export async function getTerminalBalances(input: {
  exchange?: string;
} = {}): Promise<TerminalBalancesResponse> {
  const exchange = normalizeQueryExchange(input.exchange);

  if (!exchange) {
    return executionError("unsupported_exchange", "Only binance and mexc terminal balances are supported right now.");
  }

  return {
    ok: true,
    balances: listPaperBalances(exchange),
  };
}

export async function getTerminalOpenOrders(input: {
  exchange?: string;
  symbol?: string;
} = {}): Promise<TerminalOpenOrdersResponse> {
  const exchange = normalizeQueryExchange(input.exchange);
  const symbol = normalizeSymbol(input.symbol);

  if (!exchange) {
    return executionError("unsupported_exchange", "Only binance and mexc terminal read-side queries are supported right now.");
  }

  return {
    ok: true,
    orders: listOpenPaperOrders({
      exchange,
      symbol: symbol || undefined,
    }),
  };
}

export async function getTerminalOrderHistory(input: {
  exchange?: string;
  symbol?: string;
  limit?: number | string;
} = {}): Promise<TerminalOrderHistoryResponse> {
  const exchange = normalizeQueryExchange(input.exchange);
  const symbol = normalizeSymbol(input.symbol);
  const limit = normalizeLimit(input.limit, 50);

  if (!exchange) {
    return executionError("unsupported_exchange", "Only binance and mexc terminal read-side queries are supported right now.");
  }

  return {
    ok: true,
    orders: listPaperOrderHistory({
      exchange,
      symbol: symbol || undefined,
      limit,
    }),
  };
}
