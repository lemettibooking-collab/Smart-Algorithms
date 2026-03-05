export type Exchange = "binance" | "mexc" | string;

export type AlertRow = {
  id?: string;
  bucketTs?: number;
  ts: number;
  tf: string;

  baseAsset: string;
  exchange: Exchange;
  symbol: string;

  price: number;
  score: number;
  signal: string;

  changePercent: number;
  change24hPercent: number;

  volSpike: number | null;
  quoteVol24h?: number;

  marketCapRaw: number | null;
  marketCap?: string;

  logoUrl?: string | null;
  iconUrl?: string | null;

  mergedFrom?: Array<{ exchange: Exchange; symbol: string; score: number }>;
};

export type AlertsResponse = {
  tf: string;
  ts: number;
  data: AlertRow[];
  sources?: unknown;
  error?: string;
};

export type Wall = {
  price: number;
  notional: number;
  distancePct: number;
  status: "NEW" | "HOLD" | "EATING" | "REMOVED";
};

export type WallsResponse = {
  ts: number;
  data: Record<string, { bid?: Wall; ask?: Wall }>;
};
