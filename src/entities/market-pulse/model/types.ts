export type PulseLabel = "positive" | "neutral" | "negative";
export type RiskLabel = "risk-on" | "mixed" | "risk-off";
export type Direction = "up" | "down" | "flat";
export type AltBreadthLabel = "extreme-selling" | "selling-pressure" | "neutral" | "buying-pressure" | "extreme-buying";
export type AltBreadthBias = "selling" | "neutral" | "buying";
export type AltBreadthConfidence = "unavailable" | "low" | "medium" | "high";
export type AltBreadthStatus = "ok" | "partial" | "unavailable";
export type MarketStructureBias = "bullish" | "neutral" | "bearish";
export type MarketStructureConfidence = "unavailable" | "low" | "medium" | "high";
export type MarketStructureStatus = "ok" | "partial" | "unavailable";

export type MarketStructureMetricDto = {
  score: number;
  label: string;
  bias: MarketStructureBias;
  confidence: MarketStructureConfidence;
  status: MarketStructureStatus;
  source: string;
  methodology: string;
  stats: Array<{
    label: string;
    value: string;
  }>;
  summary: string;
  updatedAt: number;
  ageSec: number;
  isAvailable?: boolean;
  isFallback?: boolean;
  errorCode?: string;
};

export type FearGreedDto = {
  value: number;
  label: "extreme-fear" | "fear" | "neutral" | "greed" | "extreme-greed";
  updatedAt: number;
  nextUpdateInSec?: number;
  source: "alternative.me";
};

export type BtcPulseDto = {
  price: number;
  change24hPct: number;
  direction: Direction;
  updatedAt: number;
  source: "binance";
};

export type NewsSentimentDto = {
  score: number;
  label: PulseLabel;
  drivers: string[];
  updatedAt: number;
  source: "marketaux";
  isAvailable?: boolean;
  isFallback?: boolean;
  errorCode?: string;
};

export type EquityPulseItemDto = {
  key: string;
  name: string;
  price: number;
  changePct24h: number;
  group?: "equities" | "commodities";
  isAvailable?: boolean;
};

export type EquitiesPulseDto = {
  label: RiskLabel;
  breadth: number;
  items: EquityPulseItemDto[];
  updatedAt: number;
  source: "twelve-data" | "fmp";
  isAvailable?: boolean;
  isFallback?: boolean;
  errorCode?: string;
};

export type AltBreadthDto = {
  score: number;
  label: AltBreadthLabel;
  bias: AltBreadthBias;
  confidence: AltBreadthConfidence;
  status: AltBreadthStatus;
  source: "smart-algorithms";
  methodology: string;
  universe: {
    eligibleCount: number;
    includedCount: number;
    coveragePct: number;
    exchangeMix: {
      binance: number;
      mexc: number;
    };
  };
  stats: {
    advancersPct: number;
    upVolumePct: number;
    medianReturnPct: number;
    advancers: number;
    decliners: number;
    flats: number;
    strongGainers: number;
    strongLosers: number;
  };
  components: {
    breadthScore: number;
    volumeBreadthScore: number;
    weightedBreadthScore: number;
    medianReturnScore: number;
    tailBalanceScore: number;
    rawScore: number;
  };
  drivers: string[];
  updatedAt: number;
  ageSec: number;
  isAvailable?: boolean;
  isFallback?: boolean;
  errorCode?: string;
};

export type MarketPulseDto = {
  fearGreed: FearGreedDto;
  btc: BtcPulseDto;
  sentiment: NewsSentimentDto;
  equities: EquitiesPulseDto;
  altBreadth: AltBreadthDto;
  btcRotation: MarketStructureMetricDto;
  derivativesHeat: MarketStructureMetricDto;
  marketLeadership: MarketStructureMetricDto;
  breakoutHealth: MarketStructureMetricDto;
  stablecoinFlow: MarketStructureMetricDto;
  narrativeHeat: MarketStructureMetricDto;
};
