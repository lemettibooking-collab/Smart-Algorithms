import { getDb } from "@/lib/db";
import { buildPaperFillEconomics } from "@/src/server/terminal/core/paper-execution-config";
import { getTerminalSymbolMeta } from "@/src/server/terminal/repositories/get-terminal-symbol-meta";
import {
  applyPaperBalanceDeltas,
} from "@/src/server/terminal/repositories/paper-account-repository";
import { createPaperFillLedgerEntry } from "@/src/server/terminal/repositories/paper-fill-ledger-repository";
import {
  fillPaperOrderIfActive,
  listOpenPaperOrders,
} from "@/src/server/terminal/repositories/paper-execution-repository";
import type {
  TerminalOrderDto,
  TerminalScalpMarketDto,
  TerminalSymbolMetaDto,
} from "@/src/shared/model/terminal/contracts";

function parsePositiveNumber(value?: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function shouldFillOrder(order: TerminalOrderDto, market: TerminalScalpMarketDto) {
  if (order.type !== "LIMIT" || order.status !== "NEW") return false;

  const limitPrice = parsePositiveNumber(order.price);
  const bestAsk = parsePositiveNumber(market.bestAsk);
  const bestBid = parsePositiveNumber(market.bestBid);
  if (limitPrice == null || bestAsk == null || bestBid == null) return false;

  if (order.side === "BUY") {
    return limitPrice >= bestAsk;
  }

  return limitPrice <= bestBid;
}

function buildFilledLimitResult(order: TerminalOrderDto, symbolMeta: TerminalSymbolMetaDto) {
  const quantity = parsePositiveNumber(order.origQty);
  const limitPrice = parsePositiveNumber(order.price);
  if (quantity == null || limitPrice == null) return null;

  return buildPaperFillEconomics({
    exchange: order.exchange,
    liquidity: "maker",
    side: order.side,
    quantity,
    price: limitPrice,
    baseAsset: symbolMeta.baseAsset,
    quoteAsset: symbolMeta.quoteAsset,
    reserveSource: "locked",
  });
}

export async function runPaperLimitMatcher(params: {
  market: TerminalScalpMarketDto;
}) {
  const symbolMeta = await getTerminalSymbolMeta({
    exchange: params.market.exchange,
    symbol: params.market.symbol,
  });
  if (!symbolMeta.ok) {
    return { filledCount: 0, filledOrderIds: [] as string[] };
  }

  const candidates = listOpenPaperOrders({
    exchange: params.market.exchange,
    symbol: params.market.symbol,
  }).filter((order) => shouldFillOrder(order, params.market));

  if (!candidates.length) {
    return { filledCount: 0, filledOrderIds: [] as string[] };
  }

  const db = getDb();
  const tx = db.transaction(() => {
    const filledOrderIds: string[] = [];

    for (const order of candidates) {
      const fillResult = buildFilledLimitResult(order, symbolMeta.symbol);
      if (!fillResult) continue;

      const filledOrder = fillPaperOrderIfActive(
        {
          orderId: order.id,
          executedQty: order.origQty,
          orderPrice: order.price ?? "",
        },
        db,
      );
      if (!filledOrder) continue;

      applyPaperBalanceDeltas(
        {
          exchange: filledOrder.exchange,
          deltas: fillResult.balanceDeltas,
        },
        db,
      );

      createPaperFillLedgerEntry(
        {
          orderId: filledOrder.id,
          exchange: filledOrder.exchange,
          symbol: filledOrder.symbol,
          side: filledOrder.side,
          baseAsset: symbolMeta.symbol.baseAsset,
          quoteAsset: symbolMeta.symbol.quoteAsset,
          qty: filledOrder.executedQty,
          price: filledOrder.price ?? order.price ?? "",
          notional: fillResult.grossNotional,
          feeAmount: fillResult.feeAmount,
          feeAsset: fillResult.feeAsset,
          liquidity: "maker",
        },
        db,
      );

      filledOrderIds.push(filledOrder.id);
    }

    return filledOrderIds;
  });

  const filledOrderIds = tx();
  return {
    filledCount: filledOrderIds.length,
    filledOrderIds,
  };
}
