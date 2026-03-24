import type { TerminalExchange, TerminalOrderSide } from "@/src/shared/model/terminal/contracts";

export type PaperExecutionLiquidity = "maker" | "taker";

type PaperExecutionConfig = {
  makerFeeBps: number;
  takerFeeBps: number;
  marketSlippageBps: number;
};

const PAPER_EXECUTION_CONFIG: Record<TerminalExchange, PaperExecutionConfig> = {
  binance: {
    makerFeeBps: 10,
    takerFeeBps: 10,
    marketSlippageBps: 2,
  },
  mexc: {
    makerFeeBps: 0,
    takerFeeBps: 20,
    marketSlippageBps: 4,
  },
};

function formatAmount(value: number) {
  const normalized = Number(value.toFixed(12));
  if (!Number.isFinite(normalized) || normalized <= 0) return "0";
  return normalized.toFixed(12).replace(/\.?0+$/, "");
}

export function getPaperExecutionConfig(exchange: TerminalExchange) {
  return PAPER_EXECUTION_CONFIG[exchange];
}

export function applyPaperMarketSlippage(params: {
  exchange: TerminalExchange;
  side: TerminalOrderSide;
  referencePrice: number;
}) {
  const bps = getPaperExecutionConfig(params.exchange).marketSlippageBps / 10_000;
  const multiplier = params.side === "BUY" ? 1 + bps : 1 - bps;
  return Number((params.referencePrice * multiplier).toFixed(12));
}

export function buildPaperFillEconomics(params: {
  exchange: TerminalExchange;
  liquidity: PaperExecutionLiquidity;
  side: TerminalOrderSide;
  quantity: number;
  price: number;
  baseAsset: string;
  quoteAsset: string;
  reserveSource: "free" | "locked";
}) {
  const feeBps =
    params.liquidity === "maker"
      ? getPaperExecutionConfig(params.exchange).makerFeeBps
      : getPaperExecutionConfig(params.exchange).takerFeeBps;
  const feeRate = feeBps / 10_000;
  const grossNotional = params.quantity * params.price;

  if (params.side === "BUY") {
    const feeAmount = params.quantity * feeRate;
    const receivedBase = Math.max(0, params.quantity - feeAmount);

    return {
      orderPrice: formatAmount(params.price),
      grossNotional: formatAmount(grossNotional),
      feeBps,
      feeAmount: formatAmount(feeAmount),
      feeAsset: params.baseAsset,
      balanceDeltas:
        params.reserveSource === "locked"
          ? [
              { asset: params.quoteAsset, lockedDelta: -grossNotional },
              { asset: params.baseAsset, freeDelta: receivedBase },
            ]
          : [
              { asset: params.quoteAsset, freeDelta: -grossNotional },
              { asset: params.baseAsset, freeDelta: receivedBase },
            ],
    };
  }

  const feeAmount = grossNotional * feeRate;
  const receivedQuote = Math.max(0, grossNotional - feeAmount);

  return {
    orderPrice: formatAmount(params.price),
    grossNotional: formatAmount(grossNotional),
    feeBps,
    feeAmount: formatAmount(feeAmount),
    feeAsset: params.quoteAsset,
    balanceDeltas:
      params.reserveSource === "locked"
        ? [
            { asset: params.baseAsset, lockedDelta: -params.quantity },
            { asset: params.quoteAsset, freeDelta: receivedQuote },
          ]
        : [
            { asset: params.baseAsset, freeDelta: -params.quantity },
            { asset: params.quoteAsset, freeDelta: receivedQuote },
          ],
  };
}
