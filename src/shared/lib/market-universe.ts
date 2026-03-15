import { getMarketCapMapTop1000 } from "@/lib/marketcap";
import { InFlight, TTLCache } from "@/lib/server-cache";
import { getSpotExchangeAdapter, listSpotExchangeAdapters } from "@/src/shared/api/exchanges";
import { getCanonicalAssetDisplayName, getCanonicalAssetOverride, getCanonicalAssetTags, mergeCanonicalAssetFlags, resolveCanonicalBaseAsset } from "@/src/shared/config/canonical-assets";
import { MARKET_PULSE_ALT_BREADTH, MARKET_PULSE_TTL } from "@/src/shared/config/market-pulse";
import type {
  CanonicalAsset,
  CanonicalAssetFlags,
  ExchangeId,
  LiquidUniverseOptions,
  MarketUniverseDebugSnapshot,
  MarketMetricUniverseInputs,
  NormalizedCandle,
  NormalizedTicker,
  SourceSelectionDecision,
  UniverseMember,
} from "@/src/shared/lib/market-universe-types";

const SUPPORTED_EXCHANGES: ExchangeId[] = ["binance", "mexc"];
const DEFAULT_PREFERENCES: ExchangeId[] = ["binance", "mexc"];
const SNAPSHOT_KEY = "canonical-spot-snapshot:v1";

const snapshotCache = new TTLCache<UniverseMember[]>(MARKET_PULSE_TTL.exchangeTickerMs, 6);
const snapshotInflight = new InFlight<UniverseMember[]>();
const universeCache = new TTLCache<UniverseMember[]>(MARKET_PULSE_TTL.marketUniverseMs, 12);
const universeInflight = new InFlight<UniverseMember[]>();
const metricInputsCache = new TTLCache<MarketMetricUniverseInputs>(MARKET_PULSE_TTL.marketUniverseMs, 6);
const metricInputsInflight = new InFlight<MarketMetricUniverseInputs>();

function toFinite(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isLeveragedBase(baseAsset: string) {
  return /(UP|DOWN|BULL|BEAR|[235]L|[235]S)$/.test(baseAsset);
}

function detectFlags(baseAsset: string): CanonicalAssetFlags {
  const canonicalBase = resolveCanonicalBaseAsset(baseAsset);
  const inferred: CanonicalAssetFlags = {
    stable: false,
    leveraged: isLeveragedBase(baseAsset),
    wrapped: canonicalBase.startsWith("W") && canonicalBase.length > 3,
    synthetic: false,
    ignoreFromMarketMetrics: false,
  };
  return mergeCanonicalAssetFlags(canonicalBase, inferred);
}

function normalizeTickerRow(raw: unknown, exchange: ExchangeId, capMap: Map<string, { cap: number }>): NormalizedTicker | null {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!row) return null;

  const symbol = String(row.symbol ?? "").trim().toUpperCase();
  const parsed = getSpotExchangeAdapter(exchange).normalizeSpotSymbol(symbol);
  if (!parsed || parsed.quoteAsset !== "USDT") return null;
  const canonicalBase = resolveCanonicalBaseAsset(parsed.baseAsset);

  const price = toFinite(row.lastPrice);
  const openPrice = toFinite(row.openPrice);
  const quoteVolumeUsd = toFinite(row.quoteVolume);
  if (!(price && price > 0) || !(openPrice && openPrice > 0) || !(quoteVolumeUsd && quoteVolumeUsd > 0)) return null;

  const changePct24h = ((price - openPrice) / openPrice) * 100;
  if (!Number.isFinite(changePct24h)) return null;

  const marketCapUsd = Number(capMap.get(canonicalBase)?.cap ?? 0) || undefined;

  return {
    exchange,
    symbol,
    baseAsset: canonicalBase,
    quoteAsset: parsed.quoteAsset,
    price,
    openPrice,
    changePct24h,
    quoteVolumeUsd,
    isSpot: true,
    isActive: true,
    marketCapUsd,
    raw,
  };
}

async function fetchExchangeTickers(exchange: ExchangeId) {
  return getSpotExchangeAdapter(exchange).fetchSpotTickers();
}

function selectionPreference(exchange: ExchangeId, preferExchanges: ExchangeId[]) {
  const idx = preferExchanges.indexOf(exchange);
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

function isTickerUsable(ticker: NormalizedTicker) {
  return ticker.isSpot && ticker.isActive && ticker.price > 0 && Number.isFinite(ticker.changePct24h) && ticker.quoteVolumeUsd > 0;
}

function buildCanonicalAsset(assetId: string, tickers: NormalizedTicker[]): CanonicalAsset {
  const leader = tickers[0];
  const marketCapUsd = tickers.map((ticker) => ticker.marketCapUsd ?? 0).find((value) => value > 0) || undefined;
  const override = getCanonicalAssetOverride(leader.baseAsset);
  const flags = detectFlags(leader.baseAsset);
  return {
    assetId: override?.assetId ?? assetId,
    baseAsset: leader.baseAsset,
    quoteAsset: leader.quoteAsset,
    displayName: getCanonicalAssetDisplayName(leader.baseAsset),
    marketCapUsd,
    tags: getCanonicalAssetTags(leader.baseAsset),
    flags,
    exchangeSymbols: tickers.map((ticker) => ({
      exchange: ticker.exchange,
      symbol: ticker.symbol,
      baseAsset: ticker.baseAsset,
      quoteAsset: ticker.quoteAsset,
    })),
  };
}

function selectBestSource(candidates: NormalizedTicker[], preferExchanges: ExchangeId[]): { selected: NormalizedTicker; alternates: NormalizedTicker[]; decision: SourceSelectionDecision } | null {
  const valid = candidates.filter(isTickerUsable);
  if (!valid.length) return null;

  const sorted = valid.slice().sort((a, b) => {
    const prefDiff = selectionPreference(a.exchange, preferExchanges) - selectionPreference(b.exchange, preferExchanges);
    if (prefDiff !== 0) return prefDiff;
    return b.quoteVolumeUsd - a.quoteVolumeUsd;
  });

  const selected = sorted[0];
  const alternates = sorted.slice(1);
  const strongestAlternate = alternates[0];
  let reason: SourceSelectionDecision["reason"] = "only_valid_source";
  if (alternates.length) {
    const selectedPref = selectionPreference(selected.exchange, preferExchanges);
    const alternatePref = selectionPreference(strongestAlternate.exchange, preferExchanges);
    reason = selectedPref < alternatePref ? "preferred_exchange" : "higher_volume_fallback";
  }

  const sourceConfidence: SourceSelectionDecision["sourceConfidence"] =
    !strongestAlternate || selected.quoteVolumeUsd >= strongestAlternate.quoteVolumeUsd * 0.8 ? "high" : "medium";

  return {
    selected,
    alternates,
    decision: {
      selectedExchange: selected.exchange,
      selectedSymbol: selected.symbol,
      reason,
      sourceConfidence,
      alternateCount: alternates.length,
    },
  };
}

async function getCanonicalSpotSnapshot(exchanges: ExchangeId[] = SUPPORTED_EXCHANGES, preferExchanges: ExchangeId[] = DEFAULT_PREFERENCES) {
  const cacheKey = `${SNAPSHOT_KEY}:${[...exchanges].sort().join(",")}:${preferExchanges.join(",")}`;
  const cached = snapshotCache.get(cacheKey);
  if (cached) return cached;

  const pending = snapshotInflight.get(cacheKey);
  if (pending) return pending;

  const task = (async () => {
    const capMap = await getMarketCapMapTop1000();
    const exchangePayloads = await Promise.all(exchanges.map(async (exchange) => ({ exchange, rows: await fetchExchangeTickers(exchange) })));
    const normalized = exchangePayloads.flatMap(({ exchange, rows }) => rows.map((row) => normalizeTickerRow(row, exchange, capMap)).filter((row): row is NormalizedTicker => Boolean(row)));

    const grouped = new Map<string, NormalizedTicker[]>();
    for (const ticker of normalized) {
      const assetId = `${ticker.baseAsset}:${ticker.quoteAsset}`;
      const existing = grouped.get(assetId) ?? [];
      existing.push(ticker);
      grouped.set(assetId, existing);
    }

    const members: UniverseMember[] = [];
    for (const [assetId, tickers] of grouped.entries()) {
      const canonical = buildCanonicalAsset(assetId, tickers);
      const selected = selectBestSource(tickers, preferExchanges);
      if (!selected) continue;
      members.push({
        assetId: canonical.assetId,
        baseAsset: canonical.baseAsset,
        quoteAsset: canonical.quoteAsset,
        selectedExchange: selected.selected.exchange,
        selectedSymbol: selected.selected.symbol,
        selectedTicker: selected.selected,
        alternates: selected.alternates,
        marketCapUsd: canonical.marketCapUsd,
        tags: canonical.tags,
        flags: canonical.flags,
        sourceConfidence: selected.decision.sourceConfidence,
        selectionReason: selected.decision.reason,
      });
    }

    members.sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0) || b.selectedTicker.quoteVolumeUsd - a.selectedTicker.quoteVolumeUsd);
    snapshotCache.set(cacheKey, members, MARKET_PULSE_TTL.exchangeTickerMs);
    return members;
  })();

  snapshotInflight.set(cacheKey, task);
  return task;
}

export async function getLiquidSpotUniverse(options: LiquidUniverseOptions = {}): Promise<UniverseMember[]> {
  const exchanges = (options.exchanges?.length ? options.exchanges : SUPPORTED_EXCHANGES)
    .filter((exchange): exchange is ExchangeId => Boolean(getSpotExchangeAdapter(exchange as ExchangeId)?.enabled));
  const quoteAsset = String(options.quoteAsset ?? "USDT").toUpperCase();
  const preferExchanges = options.preferExchanges?.length ? options.preferExchanges : DEFAULT_PREFERENCES;
  const cacheKey = JSON.stringify({
    exchanges: [...exchanges].sort(),
    quoteAsset,
    topNByMarketCap: options.topNByMarketCap ?? null,
    minQuoteVolumeUsd: options.minQuoteVolumeUsd ?? null,
    excludeStable: options.excludeStable ?? false,
    excludeLeveraged: options.excludeLeveraged ?? true,
    preferExchanges,
  });

  const cached = universeCache.get(cacheKey);
  if (cached) return cached;
  const pending = universeInflight.get(cacheKey);
  if (pending) return pending;

  const task = (async () => {
    let members = await getCanonicalSpotSnapshot(exchanges, preferExchanges);
    members = members.filter((member) => member.quoteAsset === quoteAsset);
    if (options.excludeStable) members = members.filter((member) => !member.flags.stable);
    if (options.excludeLeveraged ?? true) members = members.filter((member) => !member.flags.leveraged);
    members = members.filter((member) => !member.flags.ignoreFromMarketMetrics);
    const minQuoteVolumeUsd = options.minQuoteVolumeUsd;
    if (minQuoteVolumeUsd != null) members = members.filter((member) => member.selectedTicker.quoteVolumeUsd >= minQuoteVolumeUsd);
    const topNByMarketCap = options.topNByMarketCap;
    if (topNByMarketCap != null) {
      members = members
        .slice()
        .sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0))
        .slice(0, topNByMarketCap);
    }
    universeCache.set(cacheKey, members, MARKET_PULSE_TTL.marketUniverseMs);
    return members;
  })();

  universeInflight.set(cacheKey, task);
  return task;
}

async function getMetricUniverseInputs(): Promise<MarketMetricUniverseInputs> {
  const cacheKey = `metric-inputs:${MARKET_PULSE_ALT_BREADTH.liquidityUsd}`;
  const cached = metricInputsCache.get(cacheKey);
  if (cached) return cached;
  const pending = metricInputsInflight.get(cacheKey);
  if (pending) return pending;

  const task = (async () => {
    const allMembers = await getLiquidSpotUniverse({
      exchanges: SUPPORTED_EXCHANGES,
      quoteAsset: "USDT",
      excludeLeveraged: true,
      preferExchanges: DEFAULT_PREFERENCES,
    });

    const eligibleAltMembers = allMembers
      .filter((member) => !member.flags.stable && member.baseAsset !== "BTC" && (member.marketCapUsd ?? 0) > 0)
      .sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0));
    const liquidAltMembers = eligibleAltMembers.filter((member) => member.selectedTicker.quoteVolumeUsd >= MARKET_PULSE_ALT_BREADTH.liquidityUsd);
    const stableMembers = allMembers.filter((member) => member.flags.stable && member.selectedTicker.quoteVolumeUsd > 0);
    const btcMember = allMembers.find((member) => member.baseAsset === "BTC") ?? null;
    const largeCapMembers = liquidAltMembers.slice(0, 15);
    const exchangeMix = {
      binance: 0,
      mexc: 0,
      okx: 0,
      bybit: 0,
      kucoin: 0,
      gate: 0,
    } satisfies Record<ExchangeId, number>;

    for (const member of liquidAltMembers) {
      exchangeMix[member.selectedExchange] += 1;
    }

    const result: MarketMetricUniverseInputs = {
      allMembers,
      eligibleAltMembers,
      liquidAltMembers,
      stableMembers,
      btcMember,
      largeCapMembers,
      exchangeMix,
    };
    metricInputsCache.set(cacheKey, result, MARKET_PULSE_TTL.marketUniverseMs);
    return result;
  })();

  metricInputsInflight.set(cacheKey, task);
  return task;
}

export async function getAltMarketMoodInputs() {
  return getMetricUniverseInputs();
}

export async function getBtcRotationInputs() {
  return getMetricUniverseInputs();
}

export async function getMarketLeadershipInputs() {
  return getMetricUniverseInputs();
}

export async function getBreakoutHealthInputs() {
  return getMetricUniverseInputs();
}

export async function getNarrativeHeatInputs() {
  return getMetricUniverseInputs();
}

export async function getStablecoinFlowInputs() {
  return getMetricUniverseInputs();
}

export async function fetchUniverseCandles(member: Pick<UniverseMember, "selectedExchange" | "selectedSymbol">, interval: string, limit: number): Promise<NormalizedCandle[]> {
  return getSpotExchangeAdapter(member.selectedExchange).fetchSpotCandles(member.selectedSymbol, interval, limit);
}

export async function getMarketUniverseDebugSnapshot(): Promise<MarketUniverseDebugSnapshot> {
  const allMembers = await getCanonicalSpotSnapshot(SUPPORTED_EXCHANGES, DEFAULT_PREFERENCES);
  const exchangeMix = {
    binance: 0,
    mexc: 0,
    okx: 0,
    bybit: 0,
    kucoin: 0,
    gate: 0,
  } satisfies Record<ExchangeId, number>;

  for (const member of allMembers) {
    exchangeMix[member.selectedExchange] += 1;
  }

  const excludedStable = allMembers.filter((member) => member.flags.stable).length;
  const excludedLeveraged = allMembers.filter((member) => member.flags.leveraged).length;
  const excludedIgnored = allMembers.filter((member) => member.flags.ignoreFromMarketMetrics).length;
  const excludedWrapped = allMembers.filter((member) => member.flags.wrapped).length;
  const excludedSynthetic = allMembers.filter((member) => member.flags.synthetic).length;
  const excludedLowVolume = allMembers.filter((member) => member.selectedTicker.quoteVolumeUsd < MARKET_PULSE_ALT_BREADTH.liquidityUsd).length;
  const excludedMissingMarketCap = allMembers.filter((member) => (member.marketCapUsd ?? 0) <= 0).length;

  return {
    summary: {
      totalMembers: allMembers.length,
      exchangeMix,
      selectedWithAlternates: allMembers.filter((member) => member.alternates.length > 0).length,
      excludedStable,
      excludedLeveraged,
      excludedIgnored,
      excludedWrapped,
      excludedSynthetic,
      excludedLowVolume,
      excludedMissingMarketCap,
    },
    adapters: listSpotExchangeAdapters().map((adapter) => ({
      exchange: adapter.exchange,
      enabled: adapter.enabled,
      supportsProductionUniverse: adapter.supportsProductionUniverse,
    })),
    assets: allMembers.map((member) => ({
      assetId: member.assetId,
      baseAsset: member.baseAsset,
      quoteAsset: member.quoteAsset,
      selectedExchange: member.selectedExchange,
      selectedSymbol: member.selectedSymbol,
      selectedPrice: member.selectedTicker.price,
      selectedVolume: member.selectedTicker.quoteVolumeUsd,
      sourceConfidence: member.sourceConfidence,
      selectionReason: member.selectionReason,
      alternates: member.alternates.map((alternate) => ({
        exchange: alternate.exchange,
        symbol: alternate.symbol,
        volume: alternate.quoteVolumeUsd,
        valid: true,
      })),
      flags: member.flags,
      marketCapUsd: member.marketCapUsd,
      tags: member.tags,
    })),
  };
}
