export type Exchange = "binance" | "mexc";

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

export type EventRow = AlertRow & {
  eventId?: string;
  eventType: "signal_change" | "score_jump";
  prevSignal?: string | null;
  prevScore?: number | null;
};

export type EventsResponse = {
  tf: string;
  ts: number;
  data: EventRow[];
  sources?: unknown;
  error?: string;
};
