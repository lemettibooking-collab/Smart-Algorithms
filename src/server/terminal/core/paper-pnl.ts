import { getTerminalAssetUsdPrice, getTerminalSymbolMarkPrice } from "@/src/server/terminal/core/paper-account-valuation";
import { listPaperFillLedger } from "@/src/server/terminal/repositories/paper-fill-ledger-repository";
import type {
  TerminalExchange,
  TerminalPnlPositionDto,
  TerminalPnlResponse,
  TerminalPnlSummaryDto,
} from "@/src/shared/model/terminal/contracts";

type PositionAccumulator = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  quantity: number;
  avgEntryPrice: number;
  realizedPnlQuote: number;
  updatedAt: number;
};

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number) {
  const normalized = Number(value.toFixed(12));
  if (!Number.isFinite(normalized) || normalized <= 0) return "0";
  return normalized.toFixed(12).replace(/\.?0+$/, "");
}

export async function getPaperPnlSummary(input: {
  exchange: TerminalExchange;
}): Promise<TerminalPnlResponse> {
  const fills = listPaperFillLedger({ exchange: input.exchange });
  const positions = new Map<string, PositionAccumulator>();

  for (const fill of fills) {
    const qty = toNumber(fill.qty);
    const price = toNumber(fill.price);
    if (qty <= 0 || price <= 0) continue;
    const feeAmount = toNumber(fill.feeAmount);

    const current = positions.get(fill.symbol) ?? {
      symbol: fill.symbol,
      baseAsset: fill.baseAsset,
      quoteAsset: fill.quoteAsset,
      quantity: 0,
      avgEntryPrice: 0,
      realizedPnlQuote: 0,
      updatedAt: fill.createdAtMs,
    };

    if (fill.side === "BUY") {
      const acquiredQuantity = fill.feeAsset === fill.baseAsset ? Math.max(0, qty - feeAmount) : qty;
      const totalCostQuote = qty * price + (fill.feeAsset === fill.quoteAsset ? feeAmount : 0);
      if (acquiredQuantity <= 0) {
        current.updatedAt = Math.max(current.updatedAt, fill.createdAtMs);
        positions.set(fill.symbol, current);
        continue;
      }

      const nextQuantity = current.quantity + acquiredQuantity;
      const nextCost = current.quantity * current.avgEntryPrice + totalCostQuote;
      current.quantity = nextQuantity;
      current.avgEntryPrice = nextQuantity > 0 ? nextCost / nextQuantity : 0;
    } else {
      const matchedQty = Math.min(qty, current.quantity);
      const netProceedsQuote = qty * price - (fill.feeAsset === fill.quoteAsset ? feeAmount : 0);
      const realizedProceedsQuote = qty > 0 ? netProceedsQuote * (matchedQty / qty) : 0;
      current.realizedPnlQuote += realizedProceedsQuote - matchedQty * current.avgEntryPrice;
      current.quantity = Math.max(0, current.quantity - qty);
      if (current.quantity === 0) {
        current.avgEntryPrice = 0;
      }
    }

    current.updatedAt = Math.max(current.updatedAt, fill.createdAtMs);
    positions.set(fill.symbol, current);
  }

  const derivedPositions = await Promise.all(
    Array.from(positions.values()).map(async (position) => {
      const mark = await getTerminalSymbolMarkPrice(input.exchange, position.symbol);
      const quoteUsd = await getTerminalAssetUsdPrice(input.exchange, position.quoteAsset);
      const quoteToUsd = quoteUsd.priceUsd;
      const unrealizedPnlQuote =
        position.quantity > 0 && mark.price != null
          ? position.quantity * (mark.price - position.avgEntryPrice)
          : position.quantity > 0
            ? null
            : 0;

      const realizedPnlUsd =
        quoteToUsd == null ? null : Number((position.realizedPnlQuote * quoteToUsd).toFixed(2));
      const unrealizedPnlUsd =
        unrealizedPnlQuote == null || quoteToUsd == null ? null : Number((unrealizedPnlQuote * quoteToUsd).toFixed(2));
      const marketValueUsd =
        mark.price == null || quoteToUsd == null
          ? null
          : Number((position.quantity * mark.price * quoteToUsd).toFixed(2));

      return {
        symbol: position.symbol,
        baseAsset: position.baseAsset,
        quoteAsset: position.quoteAsset,
        quantity: formatAmount(position.quantity),
        avgEntryPrice: position.quantity > 0 ? formatAmount(position.avgEntryPrice) : null,
        markPrice: mark.price != null ? formatAmount(mark.price) : null,
        realizedPnlUsd,
        unrealizedPnlUsd,
        marketValueUsd,
        updatedAt: Math.max(position.updatedAt, mark.updatedAt ?? 0, quoteUsd.updatedAt ?? 0) || null,
      } satisfies TerminalPnlPositionDto;
    }),
  );

  const orderedPositions = derivedPositions.sort((a, b) => a.symbol.localeCompare(b.symbol));
  const realizedPnlUsd = Number(
    orderedPositions.reduce((sum, position) => sum + (position.realizedPnlUsd ?? 0), 0).toFixed(2),
  );
  const unrealizedPnlUsd = Number(
    orderedPositions.reduce((sum, position) => sum + (position.unrealizedPnlUsd ?? 0), 0).toFixed(2),
  );
  const updatedAt = orderedPositions.reduce((latest, position) => Math.max(latest, position.updatedAt ?? 0), 0);

  return {
    ok: true,
    pnl: {
      exchange: input.exchange,
      realizedPnlUsd,
      unrealizedPnlUsd,
      positions: orderedPositions,
      updatedAt: updatedAt || Date.now(),
    } satisfies TerminalPnlSummaryDto,
  };
}
