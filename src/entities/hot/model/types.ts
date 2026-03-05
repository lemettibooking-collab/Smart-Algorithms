export type HotTf = "24h" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M" | "1y";
export type Exchange = "binance" | "mexc";
export type SpikeMode = "pulse" | "scalp";

export type HotRow = {
  symbol: string;
  price: number;
  changePercent: number;
  change24hPercent: number;
  changeApprox?: boolean;
  volume: string;
  volumeRaw?: number;
  volSpike: number | null;
  spikeCandles?: number;
  spikeNeed?: number;
  newListing?: boolean;
  spikeMode?: SpikeMode;
  score: number;
  signal: string;
  source?: "klines" | "fallback";
  marketCap?: string;
  marketCapRaw?: number | null;
  logoUrl?: string | null;
  iconUrl?: string | null;
  baseAsset?: string | null;
  exchange?: Exchange;
};

export type HotResponse = {
  ok: boolean;
  tf?: HotTf;
  exchange?: Exchange;
  data: HotRow[];
  ts: number;
  error?: string;
  degraded?: boolean;
  degradeReason?: string[];
  computedBy?: {
    klines: number;
    tickerFallback: number;
    wsUsed?: number;
    rejected: number;
  };
};
