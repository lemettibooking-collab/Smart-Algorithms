export type SymbolExchange = "binance" | "mexc" | string;

export type SymbolCandle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
};

export type SymbolMetrics = {
  atr14: number | null;
  change1h: number | null;
  change4h: number | null;
  change24h: number | null;
  volumeSpike: number | null;
};

export type SymbolPeriods = {
  "1m": { pct: number | null; from?: number | null; to?: number | null };
  "5m": { pct: number | null; from?: number | null; to?: number | null };
  "15m": { pct: number | null; from?: number | null; to?: number | null };
  "1h": { pct: number | null; from?: number | null; to?: number | null };
  "4h": { pct: number | null; from?: number | null; to?: number | null };
  "1d": { pct: number | null; from?: number | null; to?: number | null };
  "1w": { pct: number | null; from?: number | null; to?: number | null };
  "1M": { pct: number | null; from?: number | null; to?: number | null };
  "1y": { pct: number | null; from?: number | null; to?: number | null };
};

export type KlinesResponse = {
  ok: true;
  symbol: string;
  interval: string;
  limit: number;
  candles: SymbolCandle[];
  metrics: SymbolMetrics;
  periods?: SymbolPeriods;
  ts: number;
};
