export const MARKET_PULSE_TTL = {
  fearGreedMs: 30 * 60 * 1000,
  newsSentimentMs: 15 * 60 * 1000,
  newsSentimentCooldownMs: 45 * 60 * 1000,
  equitiesMs: 60 * 1000,
  btcSnapshotMs: 5 * 1000,
} as const;

export const MARKETAUX_NEWS_CONFIG = {
  language: "en",
  cryptoSymbols: ["BTCUSD", "ETHUSD"],
  cryptoHoursBack: 6,
  macroHoursBack: 12,
  marketHoursBack: 6,
  cryptoFallbackHoursBack: 12,
  macroFallbackHoursBack: 24,
  marketFallbackHoursBack: 12,
  requestLimit: 10,
  cryptoSearch: "bitcoin btc ethereum eth",
  macroSearch: "inflation cpi fed fomc rates yield jobs recession",
  marketSearch: "stocks market equities",
  cryptoFallbackSearch: "bitcoin btc ethereum eth crypto cryptocurrency",
  macroFallbackSearch: "fed rates inflation economy",
  marketFallbackSearch: "stocks market equities risk rally selloff",
} as const;

export const MARKET_PULSE_EQUITY_INDEXES = [
  // FMP batch-index-quotes uses canonical index symbols for the majors below.
  { key: "sp500", name: "S&P 500", symbol: "^GSPC" },
  { key: "dow", name: "Dow Jones", symbol: "^DJI" },
  { key: "nasdaq", name: "Nasdaq", symbol: "^IXIC" },
  { key: "russell", name: "Russell 2000", symbol: "^RUT" },
] as const;

export const MARKET_PULSE_STREAM = {
  btcPollMs: 5_000,
  heartbeatMs: 30_000,
} as const;
