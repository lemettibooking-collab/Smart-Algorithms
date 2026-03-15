export type ExchangeId = "binance" | "mexc" | "okx" | "bybit" | "kucoin" | "gate";

export type ExchangeSymbolRef = {
  exchange: ExchangeId;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
};

export type NormalizedTicker = {
  exchange: ExchangeId;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  openPrice: number;
  changePct24h: number;
  quoteVolumeUsd: number;
  isSpot: boolean;
  isActive: boolean;
  marketCapUsd?: number;
  raw?: unknown;
};

export type NormalizedCandle = {
  openTime?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime?: number;
  quoteVolume?: number;
};

export type CanonicalAssetFlags = {
  stable: boolean;
  leveraged: boolean;
  wrapped: boolean;
  synthetic: boolean;
  ignoreFromMarketMetrics: boolean;
};

export type CanonicalAsset = {
  assetId: string;
  baseAsset: string;
  quoteAsset: string;
  displayName: string;
  marketCapUsd?: number;
  tags?: string[];
  flags: CanonicalAssetFlags;
  exchangeSymbols: ExchangeSymbolRef[];
};

export type SourceSelectionDecision = {
  selectedExchange: ExchangeId;
  selectedSymbol: string;
  reason: "preferred_exchange" | "higher_volume_fallback" | "only_valid_source";
  sourceConfidence: "high" | "medium";
  alternateCount: number;
};

export type UniverseMember = {
  assetId: string;
  baseAsset: string;
  quoteAsset: string;
  selectedExchange: ExchangeId;
  selectedSymbol: string;
  selectedTicker: NormalizedTicker;
  alternates: NormalizedTicker[];
  marketCapUsd?: number;
  tags?: string[];
  flags: CanonicalAssetFlags;
  sourceConfidence: SourceSelectionDecision["sourceConfidence"];
  selectionReason: SourceSelectionDecision["reason"];
};

export type LiquidUniverseOptions = {
  exchanges?: ExchangeId[];
  quoteAsset?: string;
  topNByMarketCap?: number;
  minQuoteVolumeUsd?: number;
  excludeStable?: boolean;
  excludeLeveraged?: boolean;
  preferExchanges?: ExchangeId[];
};

export type MarketMetricUniverseInputs = {
  allMembers: UniverseMember[];
  eligibleAltMembers: UniverseMember[];
  liquidAltMembers: UniverseMember[];
  stableMembers: UniverseMember[];
  btcMember: UniverseMember | null;
  largeCapMembers: UniverseMember[];
  exchangeMix: Record<ExchangeId, number>;
};

export type MarketUniverseDebugEntry = {
  assetId: string;
  baseAsset: string;
  quoteAsset: string;
  selectedExchange: ExchangeId;
  selectedSymbol: string;
  selectedPrice: number;
  selectedVolume: number;
  sourceConfidence: UniverseMember["sourceConfidence"];
  selectionReason: UniverseMember["selectionReason"];
  alternates: Array<{
    exchange: ExchangeId;
    symbol: string;
    volume: number;
    valid: boolean;
  }>;
  flags: CanonicalAssetFlags;
  marketCapUsd?: number;
  tags?: string[];
};

export type MarketUniverseDebugSnapshot = {
  summary: {
    totalMembers: number;
    exchangeMix: Record<ExchangeId, number>;
    selectedWithAlternates: number;
    excludedStable: number;
    excludedLeveraged: number;
    excludedIgnored: number;
    excludedWrapped: number;
    excludedSynthetic: number;
    excludedLowVolume: number;
    excludedMissingMarketCap: number;
  };
  adapters: Array<{
    exchange: ExchangeId;
    enabled: boolean;
    supportsProductionUniverse: boolean;
  }>;
  assets: MarketUniverseDebugEntry[];
};
