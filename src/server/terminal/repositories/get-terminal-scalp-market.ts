import { getTerminalSymbolMeta } from "@/src/server/terminal/repositories/get-terminal-symbol-meta";
import type {
  TerminalMarketHealthDto,
  TerminalDomLevelDto,
  TerminalScalpMarketDto,
  TerminalScalpMarketResponse,
  TerminalSymbolMetaDto,
} from "@/src/shared/model/terminal/contracts";

type TerminalScalpMarketInput = {
  exchange?: string;
  symbol?: string;
};

const DEFAULT_DEPTH = 7;
const PRICE_ANCHORS: Record<string, number> = {
  BTC: 68425,
  ETH: 3520,
  SOL: 182,
  BNB: 615,
  XRP: 0.63,
  ADA: 0.82,
  DOGE: 0.21,
};

function parsePositiveNumber(value?: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function decimalPlaces(value?: string) {
  if (!value || !value.includes(".")) return 0;
  return value.split(".")[1]?.length ?? 0;
}

function formatPrice(value: number, decimals: number) {
  return value.toFixed(decimals);
}

function hashString(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 1_000_003;
  }
  return hash;
}

function deriveMidPrice(symbolMeta: TerminalSymbolMetaDto) {
  const anchor = PRICE_ANCHORS[symbolMeta.baseAsset];
  if (anchor) return anchor;

  const hash = hashString(symbolMeta.symbol);
  const magnitude = symbolMeta.quoteAsset === "BTC" ? 0.005 : symbolMeta.quoteAsset === "ETH" ? 0.35 : 125;
  return Number(((hash % 9000) / 100 + magnitude).toFixed(6));
}

function deriveStepSize(symbolMeta: TerminalSymbolMetaDto) {
  return parsePositiveNumber(symbolMeta.filters.tickSize) ?? 0.01;
}

function deriveSpread(stepSize: number, hash: number) {
  const multiplier = hash % 2 === 0 ? 2 : 3;
  return Number((stepSize * multiplier).toFixed(decimalPlaces(String(stepSize)) + 2));
}

function buildDomRows(params: {
  bestBid: number;
  bestAsk: number;
  stepSize: number;
  decimals: number;
  hash: number;
}) {
  const { bestBid, bestAsk, stepSize, decimals, hash } = params;

  const askRows: TerminalDomLevelDto[] = [];
  let askRunningTotal = 0;
  for (let level = DEFAULT_DEPTH - 1; level >= 0; level -= 1) {
    const price = bestAsk + stepSize * level;
    const askSize = Number((1.2 + ((hash + level * 17) % 65) / 10).toFixed(2));
    askRunningTotal += askSize;
    askRows.push({
      price: formatPrice(price, decimals),
      askSize: askSize.toFixed(2),
      askTotal: askRunningTotal.toFixed(2),
      bidSize: null,
      bidTotal: null,
    });
  }

  const bidRows: TerminalDomLevelDto[] = [];
  let bidRunningTotal = 0;
  for (let level = 0; level < DEFAULT_DEPTH; level += 1) {
    const price = bestBid - stepSize * level;
    const bidSize = Number((1.15 + ((hash + level * 13) % 60) / 10).toFixed(2));
    bidRunningTotal += bidSize;
    bidRows.push({
      price: formatPrice(price, decimals),
      askSize: null,
      askTotal: null,
      bidSize: bidSize.toFixed(2),
      bidTotal: bidRunningTotal.toFixed(2),
    });
  }

  return [...askRows, ...bidRows];
}

function buildTapeTrades(params: {
  midPrice: number;
  stepSize: number;
  decimals: number;
  symbol: string;
  hash: number;
}): TerminalScalpMarketDto["tape"] {
  const { midPrice, stepSize, decimals, symbol, hash } = params;
  const updatedAt = Date.now();

  return Array.from({ length: 14 }, (_, index) => {
    const side: TerminalScalpMarketDto["tape"][number]["side"] = (hash + index) % 2 === 0 ? "buy" : "sell";
    const priceOffset = ((hash + index * 7) % 5) * stepSize;
    const signedOffset = side === "buy" ? -priceOffset : priceOffset;
    const qty = (0.18 + ((hash + index * 19) % 34) / 20).toFixed(3);

    return {
      id: `${symbol.toLowerCase()}-${index + 1}`,
      side,
      price: formatPrice(midPrice + signedOffset, decimals),
      qty,
      ts: updatedAt - index * 3_000,
    };
  });
}

function buildScalpMarket(symbolMeta: TerminalSymbolMetaDto): TerminalScalpMarketDto {
  const hash = hashString(symbolMeta.symbol);
  const stepSize = deriveStepSize(symbolMeta);
  const decimals = Math.max(decimalPlaces(symbolMeta.filters.tickSize), decimalPlaces(String(stepSize)));
  const midPrice = deriveMidPrice(symbolMeta);
  const spread = deriveSpread(stepSize, hash);
  const bestBid = Number((midPrice - spread / 2).toFixed(decimals));
  const bestAsk = Number((midPrice + spread / 2).toFixed(decimals));

  return {
    exchange: symbolMeta.exchange,
    symbol: symbolMeta.symbol,
    bestBid: formatPrice(bestBid, decimals),
    bestAsk: formatPrice(bestAsk, decimals),
    spread: formatPrice(spread, decimals),
    midPrice: formatPrice(midPrice, decimals),
    dom: buildDomRows({
      bestBid,
      bestAsk,
      stepSize,
      decimals,
      hash,
    }),
    tape: buildTapeTrades({
      midPrice,
      stepSize,
      decimals,
      symbol: symbolMeta.symbol,
      hash,
    }),
    updatedAt: Date.now(),
  };
}

export async function getTerminalScalpMarket(
  input: TerminalScalpMarketInput = {},
): Promise<TerminalScalpMarketResponse> {
  const symbolMeta = await getTerminalSymbolMeta(input);
  if (!symbolMeta.ok) {
    return symbolMeta;
  }

  return {
    ok: true,
    market: buildScalpMarket(symbolMeta.symbol),
    health: {
      connectionState: "stale",
      source: "demo_fallback",
      snapshotAgeMs: null,
      updatedAt: Date.now(),
      fallbackUsed: true,
      transport: "snapshot",
    } satisfies TerminalMarketHealthDto,
  };
}
