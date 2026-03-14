export type PulseLabel = "positive" | "neutral" | "negative";
export type RiskLabel = "risk-on" | "mixed" | "risk-off";
export type Direction = "up" | "down" | "flat";

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
  isAvailable?: boolean;
};

export type EquitiesPulseDto = {
  label: RiskLabel;
  breadth: number;
  items: EquityPulseItemDto[];
  updatedAt: number;
  source: "fmp";
  isAvailable?: boolean;
  isFallback?: boolean;
  errorCode?: string;
};

export type MarketPulseDto = {
  fearGreed: FearGreedDto;
  btc: BtcPulseDto;
  sentiment: NewsSentimentDto;
  equities: EquitiesPulseDto;
};
