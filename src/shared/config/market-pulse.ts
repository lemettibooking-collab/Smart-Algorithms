export const MARKET_PULSE_TTL = {
  exchangeTickerMs: 30 * 1000,
  marketUniverseMs: 2 * 60 * 1000,
  fearGreedMs: 30 * 60 * 1000,
  newsSentimentMs: 15 * 60 * 1000,
  newsSentimentCooldownMs: 45 * 60 * 1000,
  equitiesMs: 30 * 60 * 1000,
  equitiesLastGoodMs: 24 * 60 * 60 * 1000,
  altBreadthMs: 90 * 1000,
  altBreadthPrevMs: 12 * 60 * 60 * 1000,
  marketStructureMs: 60 * 1000,
  marketStructureSlowMs: 3 * 60 * 1000,
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

export const MARKET_PULSE_RISK_ASSETS = [
  { key: "sp500", name: "S&P 500", symbols: ["^GSPC"], twelveDataResolvedSymbol: "SPX", twelveDataSymbols: ["SPX", "GSPC"], twelveDataSearch: ["S&P 500", "SPX", "GSPC"], group: "equities" },
  { key: "dow", name: "Dow Jones", symbols: ["^DJI"], twelveDataSymbols: ["DJI", "DJIA"], twelveDataSearch: ["Dow Jones", "DJIA", "DJI"], group: "equities" },
  { key: "nasdaq", name: "Nasdaq", symbols: ["^IXIC"], twelveDataSymbols: ["IXIC", "NASDAQ"], twelveDataSearch: ["NASDAQ Composite", "IXIC", "NASDAQ"], group: "equities" },
  { key: "russell", name: "Russell 2000", symbols: ["^RUT"], twelveDataSymbols: ["RUT", "RUSSELL2000"], twelveDataSearch: ["Russell 2000", "RUT"], group: "equities" },
  { key: "gold", name: "Gold", symbols: ["GCUSD", "XAUUSD"], twelveDataSymbols: ["XAU/USD", "XAUUSD"], twelveDataSearch: ["Gold", "XAU/USD", "XAUUSD"], group: "commodities" },
  { key: "silver", name: "Silver", symbols: ["SIUSD", "XAGUSD"], twelveDataResolvedSymbol: "XAG/USD", twelveDataSymbols: ["XAG/USD", "XAGUSD"], twelveDataSearch: ["Silver", "XAG/USD", "XAGUSD"], group: "commodities" },
  { key: "oil", name: "Oil", symbols: ["CLUSD", "USOIL", "BZUSD"], twelveDataSymbols: ["USOIL", "WTI"], twelveDataSearch: ["Crude Oil", "USOIL", "WTI"], group: "commodities" },
  { key: "natgas", name: "Natural Gas", symbols: ["NGUSD", "NATGASUSD"], twelveDataSymbols: ["NATGAS", "XNG/USD"], twelveDataSearch: ["Natural Gas", "NATGAS", "XNG/USD"], group: "commodities" },
] as const;

export const MARKET_PULSE_STREAM = {
  btcPollMs: 5_000,
  heartbeatMs: 30_000,
} as const;

export const MARKET_PULSE_ALT_BREADTH = {
  topCapUniverse: 1000,
  liquidityUsd: 500_000,
  deadZonePct: 0.5,
  strongMovePct: 8,
  unavailableMinIncluded: 80,
  mediumMinIncluded: 150,
  highMinIncluded: 250,
} as const;
