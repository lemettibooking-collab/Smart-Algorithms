import { cacheGet, cacheSet } from "@/lib/repos/cacheRepo";
import { fetchWithRetry, InFlight, TTLCache } from "@/lib/server-cache";
import type { MarketPulseDto, MarketStructureBias, MarketStructureMetricDto, MarketStructureStatus } from "@/src/entities/market-pulse";
import { NARRATIVE_BUCKETS, narrativeDisplay, narrativeLabel } from "@/src/shared/config/market-vision-narratives";
import { MARKET_PULSE_ALT_BREADTH, MARKET_PULSE_TTL } from "@/src/shared/config/market-pulse";
import { fetchUniverseCandles, getBtcRotationInputs } from "@/src/shared/lib/market-universe";
import type { ExchangeId } from "@/src/shared/lib/market-universe-types";

type ExchangeName = ExchangeId;

type TickerRow = {
  exchange: ExchangeName;
  symbol: string;
  baseAsset: string;
  change24hPct: number;
  quoteVolumeUsd: number;
  marketCap: number;
  lastPrice: number;
  openPrice: number;
  isStable: boolean;
};

type FuturesPoint = {
  symbol: string;
  fundingRate: number;
  openInterestUsd: number;
};

type CandleLike = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type BreakoutDirection = "bullish" | "bearish";

type BreakoutScanResult = {
  resolvedSamples: number;
  successCount: number;
  failureCount: number;
  persistentCount: number;
  bullishResolved: number;
  bullishSuccess: number;
  bullishFailure: number;
  bearishResolved: number;
  bearishSuccess: number;
  bearishFailure: number;
};

type AdvancedSnapshot = Pick<
  MarketPulseDto,
  "btcRotation" | "derivativesHeat" | "marketLeadership" | "breakoutHealth" | "stablecoinFlow" | "narrativeHeat"
>;

type MetricInput = {
  score: number;
  label: string;
  bias: MarketStructureBias;
  confidence: MarketStructureMetricDto["confidence"];
  status: MarketStructureStatus;
  source: string;
  methodology: string;
  stats: Array<{ label: string; value: string }>;
  summary: string;
  errorCode?: string;
};

const cache = new TTLCache<AdvancedSnapshot>(MARKET_PULSE_TTL.marketStructureMs, 8);
const inflight = new InFlight<AdvancedSnapshot>();
const KEY = "market-pulse:advanced-structure:v1";
const DERIVATIVES_PREV_KEY = "market-pulse:advanced-structure:derivatives-prev:v1";
const STABLE_SHARE_PREV_KEY = "market-pulse:advanced-structure:stable-share-prev:v1";

const BINANCE_FUTURES_BASE = "https://fapi.binance.com";
const STABLE_BASE_ASSETS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USDP", "USDE", "PYUSD", "EURC"]);
const DEBUG_MARKET_PULSE = process.env.DEBUG_MARKET_PULSE === "1";
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (!nums.length) return 0;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function median(values: number[]) {
  const nums = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function pctDiff(from: number, to: number) {
  if (!(from > 0) || !Number.isFinite(to)) return 0;
  return ((to - from) / from) * 100;
}

function confidenceFromCount(count: number) {
  if (count < 40) return { confidence: "unavailable" as const, status: "unavailable" as const, isAvailable: false };
  if (count < 90) return { confidence: "low" as const, status: "partial" as const, isAvailable: true };
  if (count < 180) return { confidence: "medium" as const, status: "ok" as const, isAvailable: true };
  return { confidence: "high" as const, status: "ok" as const, isAvailable: true };
}

function formatSignedPct(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function leadershipConcentrationScore(topShare: number) {
  const normalized = clamp((topShare - 25) / 35, 0, 1);
  return clamp(100 - Math.pow(normalized, 1.15) * 100, 0, 100);
}

function leadershipBreadthScore(breadthDepth: number) {
  const normalized = clamp((breadthDepth - 25) / 45, 0, 1);
  return clamp(Math.pow(normalized, 0.9) * 100, 0, 100);
}

function leadershipLargeCapScore(largeCapParticipation: number) {
  const normalized = clamp((largeCapParticipation - 40) / 50, 0, 1);
  return clamp(Math.pow(normalized, 1.05) * 100, 0, 100);
}

function compressLeadershipScore(rawScore: number, subScores: { concentration: number; breadth: number; largeCap: number }) {
  if (subScores.concentration >= 97 && subScores.breadth >= 95 && subScores.largeCap >= 95) {
    return 100;
  }
  if (rawScore <= 90) return rawScore;
  return 90 + (rawScore - 90) * 0.62;
}

function debugLeadership(message: string, payload?: unknown) {
  if (!DEBUG_MARKET_PULSE) return;
  if (payload === undefined) {
    console.warn(`[market-pulse/leadership] ${message}`);
    return;
  }
  console.warn(`[market-pulse/leadership] ${message}`, payload);
}

function buildMetric(input: MetricInput): MarketStructureMetricDto {
  const updatedAt = Date.now();
  return {
    ...input,
    score: clamp(Math.round(input.score), 0, 100),
    updatedAt,
    ageSec: 0,
    isAvailable: input.status !== "unavailable",
    isFallback: input.status === "unavailable",
  };
}

function fallbackMetric(label: string, methodology: string, source = "smart-algorithms", errorCode = "provider_unavailable"): MarketStructureMetricDto {
  return buildMetric({
    score: 0,
    label,
    bias: "neutral",
    confidence: "unavailable",
    status: "unavailable",
    source,
    methodology,
    stats: [
      { label: "Status", value: "No data" },
      { label: "Coverage", value: "Unavailable" },
      { label: "Signal", value: "Waiting" },
    ],
    summary: "Not enough data to build a reliable signal.",
    errorCode,
  });
}

async function fetchFuturesPoint(symbol: string): Promise<FuturesPoint | null> {
  try {
    const [premiumRes, oiRes] = await Promise.all([
      fetchWithRetry(`${BINANCE_FUTURES_BASE}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`, { method: "GET", cache: "no-store" }, { retries: 1 }),
      fetchWithRetry(`${BINANCE_FUTURES_BASE}/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`, { method: "GET", cache: "no-store" }, { retries: 1 }),
    ]);
    if (!premiumRes.ok || !oiRes.ok) return null;
    const premiumJson = (await premiumRes.json()) as Record<string, unknown>;
    const oiJson = (await oiRes.json()) as Record<string, unknown>;
    const fundingRate = Number(premiumJson.lastFundingRate ?? premiumJson.fundingRate ?? 0);
    const openInterest = Number(oiJson.openInterest ?? 0);
    const markPrice = Number(premiumJson.markPrice ?? 0);
    if (!Number.isFinite(fundingRate) || !(openInterest > 0) || !(markPrice > 0)) return null;
    return {
      symbol,
      fundingRate,
      openInterestUsd: openInterest * markPrice,
    };
  } catch {
    return null;
  }
}

async function fetchAdvancedInputs() {
  const inputs = await getBtcRotationInputs();
  const toTickerRow = (member: (typeof inputs.allMembers)[number]): TickerRow => ({
    exchange: member.selectedExchange,
    symbol: member.selectedSymbol,
    baseAsset: member.baseAsset,
    change24hPct: member.selectedTicker.changePct24h,
    quoteVolumeUsd: member.selectedTicker.quoteVolumeUsd,
    marketCap: member.marketCapUsd ?? 0,
    lastPrice: member.selectedTicker.price,
    openPrice: member.selectedTicker.openPrice,
    isStable: member.flags.stable || STABLE_BASE_ASSETS.has(member.baseAsset),
  });

  const btcRow = inputs.btcMember ? toTickerRow(inputs.btcMember) : null;
  const stableRows = inputs.stableMembers.map(toTickerRow);
  const altRows = inputs.liquidAltMembers.map(toTickerRow);
  const largeCapRows = inputs.largeCapMembers.map(toTickerRow);

  return {
    altRows,
    largeCapRows,
    stableRows,
    btcRow,
  };
}

function computeBtcRotation(input: Awaited<ReturnType<typeof fetchAdvancedInputs>>): MarketStructureMetricDto {
  const { altRows, largeCapRows, btcRow } = input;
  if (!btcRow || altRows.length < 40) {
    return fallbackMetric("Mixed rotation", "BTC versus liquid alt basket rotation across supported spot markets.", "smart-algorithms", "insufficient_coverage");
  }

  const altMedian = median(altRows.map((row) => row.change24hPct));
  const largeMedian = median(largeCapRows.map((row) => row.change24hPct));
  const outperformShare = 100 * altRows.filter((row) => row.change24hPct > btcRow.change24hPct).length / Math.max(1, altRows.length);
  const altStrength = altMedian - btcRow.change24hPct;
  const largeCapLead = largeMedian - altMedian;
  const state = confidenceFromCount(altRows.length);

  const score = clamp(50 + altStrength * 4 + (outperformShare - 50) * 0.7 + largeCapLead * 6, 0, 100);

  if (altStrength <= -1.5 && outperformShare < 40) {
    return buildMetric({
      score,
      label: "BTC-led",
      bias: "bearish",
      confidence: state.confidence,
      status: state.status,
      source: "smart-algorithms",
      methodology: "Compares BTC performance with large-cap alts and the wider liquid alt basket over 24h.",
      stats: [
        { label: "Alt strength", value: formatSignedPct(altStrength) },
        { label: "Large-cap lead", value: formatSignedPct(largeCapLead) },
        { label: "BTC vs alts", value: `${Math.round(100 - outperformShare)}% ahead` },
      ],
      summary: "BTC is outperforming the liquid alt basket, with limited rotation into broader alt risk.",
    });
  }

  if (altStrength >= 1.25 && outperformShare >= 60) {
    return buildMetric({
      score,
      label: "Broad alt rotation",
      bias: "bullish",
      confidence: state.confidence,
      status: state.status,
      source: "smart-algorithms",
      methodology: "Compares BTC performance with large-cap alts and the wider liquid alt basket over 24h.",
      stats: [
        { label: "Alt strength", value: formatSignedPct(altStrength) },
        { label: "Large-cap lead", value: formatSignedPct(largeCapLead) },
        { label: "BTC underperformance", value: `${Math.round(outperformShare)}% beat BTC` },
      ],
      summary: "Rotation is broadening across liquid alts, with the wider basket outperforming BTC.",
    });
  }

  if (largeCapLead >= 0.75 && outperformShare >= 45) {
    return buildMetric({
      score,
      label: "Large caps leading",
      bias: "bullish",
      confidence: state.confidence,
      status: state.status,
      source: "smart-algorithms",
      methodology: "Compares BTC performance with large-cap alts and the wider liquid alt basket over 24h.",
      stats: [
        { label: "Alt strength", value: formatSignedPct(altStrength) },
        { label: "Large-cap lead", value: formatSignedPct(largeCapLead) },
        { label: "BTC underperformance", value: `${Math.round(outperformShare)}% beat BTC` },
      ],
      summary: "Leadership is concentrated in the large-cap alt complex rather than the broader market.",
    });
  }

  return buildMetric({
    score,
    label: "Mixed rotation",
    bias: "neutral",
    confidence: state.confidence,
    status: state.status,
    source: "smart-algorithms",
    methodology: "Compares BTC performance with large-cap alts and the wider liquid alt basket over 24h.",
    stats: [
      { label: "Alt strength", value: formatSignedPct(altStrength) },
      { label: "Large-cap lead", value: formatSignedPct(largeCapLead) },
      { label: "BTC underperformance", value: `${Math.round(outperformShare)}% beat BTC` },
    ],
    summary: "Rotation is mixed, with no clean handoff from BTC to a broad alt-led market.",
  });
}

async function computeDerivativesHeat(input: Awaited<ReturnType<typeof fetchAdvancedInputs>>): Promise<MarketStructureMetricDto> {
  const [btc, eth] = await Promise.all([fetchFuturesPoint("BTCUSDT"), fetchFuturesPoint("ETHUSDT")]);
  const points = [btc, eth].filter(Boolean) as FuturesPoint[];
  if (!points.length) {
    return fallbackMetric("Balanced", "Binance futures funding and open-interest proxy for crowding.", "binance-futures", "upstream_error");
  }

  const prev = cacheGet<Record<string, number>>(DERIVATIVES_PREV_KEY) ?? {};
  const spotLookup = new Map<string, number>();
  const btcSpot = input.btcRow?.change24hPct;
  if (typeof btcSpot === "number") spotLookup.set("BTCUSDT", btcSpot);
  const ethSpot = input.altRows.find((row) => row.baseAsset === "ETH")?.change24hPct;
  if (typeof ethSpot === "number") spotLookup.set("ETHUSDT", ethSpot);

  const avgFundingBps = average(points.map((point) => point.fundingRate * 10_000));
  const oiChanges = points
    .map((point) => {
      const prevValue = Number(prev[point.symbol] ?? 0);
      if (!(prevValue > 0)) return null;
      return ((point.openInterestUsd - prevValue) / prevValue) * 100;
    })
    .filter((value): value is number => value != null && Number.isFinite(value));
  const avgOiChange = average(oiChanges);
  const avgSpotMove = average(points.map((point) => spotLookup.get(point.symbol) ?? 0));

  cacheSet(
    DERIVATIVES_PREV_KEY,
    Object.fromEntries(points.map((point) => [point.symbol, point.openInterestUsd])),
    MARKET_PULSE_TTL.marketStructureSlowMs,
  );

  const hasOiHistory = oiChanges.length > 0;
  const crowdScore = clamp(50 + avgFundingBps * 8 + avgOiChange * 2 + avgSpotMove * 1.8, 0, 100);
  const priceOiAligned = Math.sign(avgSpotMove || 0) === Math.sign(avgOiChange || 0) && Math.abs(avgOiChange) > 0.5;
  const pressureText = avgFundingBps > 0.3 ? "Long pressure" : avgFundingBps < -0.3 ? "Short pressure" : "Balanced";

  if (avgFundingBps >= 0.8 && avgOiChange >= 2 && avgSpotMove >= 1) {
    return buildMetric({
      score: crowdScore,
      label: "Long crowded",
      bias: "bearish",
      confidence: hasOiHistory ? "medium" : "low",
      status: hasOiHistory ? "ok" : "partial",
      source: "binance-futures",
      methodology: "Binance futures funding plus open-interest change on BTC and ETH as a crowding proxy.",
      stats: [
        { label: "Funding", value: `${avgFundingBps >= 0 ? "+" : ""}${avgFundingBps.toFixed(2)} bps` },
        { label: "OI change", value: `${avgOiChange >= 0 ? "+" : ""}${avgOiChange.toFixed(1)}%` },
        { label: "Liquidation bias", value: pressureText },
      ],
      summary: priceOiAligned
        ? "Funding and open interest both point to crowded long positioning."
        : "Long exposure is building quickly, even if follow-through is not fully confirmed.",
    });
  }

  if (avgFundingBps <= -0.8 && avgOiChange >= 2 && avgSpotMove <= -1) {
    return buildMetric({
      score: 100 - crowdScore,
      label: "Short crowded",
      bias: "bullish",
      confidence: hasOiHistory ? "medium" : "low",
      status: hasOiHistory ? "ok" : "partial",
      source: "binance-futures",
      methodology: "Binance futures funding plus open-interest change on BTC and ETH as a crowding proxy.",
      stats: [
        { label: "Funding", value: `${avgFundingBps >= 0 ? "+" : ""}${avgFundingBps.toFixed(2)} bps` },
        { label: "OI change", value: `${avgOiChange >= 0 ? "+" : ""}${avgOiChange.toFixed(1)}%` },
        { label: "Liquidation bias", value: pressureText },
      ],
      summary: "Short positioning looks crowded, leaving room for squeezes if price stabilizes.",
    });
  }

  if (Math.abs(avgFundingBps) >= 0.35 || Math.abs(avgOiChange) >= 1.5) {
    return buildMetric({
      score: crowdScore,
      label: "Heating up",
      bias: avgFundingBps >= 0 ? "bearish" : "bullish",
      confidence: hasOiHistory ? "medium" : "low",
      status: hasOiHistory ? "ok" : "partial",
      source: "binance-futures",
      methodology: "Binance futures funding plus open-interest change on BTC and ETH as a crowding proxy.",
      stats: [
        { label: "Funding", value: `${avgFundingBps >= 0 ? "+" : ""}${avgFundingBps.toFixed(2)} bps` },
        { label: "OI change", value: `${avgOiChange >= 0 ? "+" : ""}${avgOiChange.toFixed(1)}%` },
        { label: "Liquidation bias", value: pressureText },
      ],
      summary: "Futures positioning is heating up, but the market is not yet decisively crowded on one side.",
    });
  }

  return buildMetric({
    score: 50,
    label: "Balanced",
    bias: "neutral",
    confidence: hasOiHistory ? "medium" : "low",
    status: hasOiHistory ? "ok" : "partial",
    source: "binance-futures",
    methodology: "Binance futures funding plus open-interest change on BTC and ETH as a crowding proxy.",
    stats: [
      { label: "Funding", value: `${avgFundingBps >= 0 ? "+" : ""}${avgFundingBps.toFixed(2)} bps` },
      { label: "OI change", value: `${avgOiChange >= 0 ? "+" : ""}${avgOiChange.toFixed(1)}%` },
      { label: "Liquidation bias", value: pressureText },
    ],
    summary: "Futures positioning looks balanced, without an obvious crowding extreme.",
  });
}

function computeMarketLeadership(input: Awaited<ReturnType<typeof fetchAdvancedInputs>>): MarketStructureMetricDto {
  const { altRows, largeCapRows } = input;
  if (altRows.length < 40) {
    return fallbackMetric("Mixed leadership", "Measures whether market participation is broad or concentrated in a few names.", "smart-algorithms", "insufficient_coverage");
  }

  const medianMove = median(altRows.map((row) => row.change24hPct));
  const direction = medianMove >= 0 ? 1 : -1;
  const activeRows = altRows.filter((row) => (direction > 0 ? row.change24hPct > MARKET_PULSE_ALT_BREADTH.deadZonePct : row.change24hPct < -MARKET_PULSE_ALT_BREADTH.deadZonePct));
  const contributions = activeRows
    .map((row) => Math.abs(row.change24hPct) * Math.sqrt(Math.max(1, row.quoteVolumeUsd)))
    .sort((a, b) => b - a);
  const totalContribution = contributions.reduce((sum, value) => sum + value, 0);
  const topShare = totalContribution > 0 ? 100 * contributions.slice(0, 5).reduce((sum, value) => sum + value, 0) / totalContribution : 0;
  const breadthDepth = 100 * activeRows.length / Math.max(1, altRows.length);
  const largeCapParticipation = 100 * largeCapRows.filter((row) => (direction > 0 ? row.change24hPct > 0 : row.change24hPct < 0)).length / Math.max(1, largeCapRows.length);
  const subScores = {
    concentration: leadershipConcentrationScore(topShare),
    breadth: leadershipBreadthScore(breadthDepth),
    largeCap: leadershipLargeCapScore(largeCapParticipation),
  };
  const rawScore = clamp(
    0.4 * subScores.concentration +
    0.35 * subScores.breadth +
    0.25 * subScores.largeCap,
    0,
    100,
  );
  const score = clamp(compressLeadershipScore(rawScore, subScores), 0, 100);
  const state = confidenceFromCount(altRows.length);

  debugLeadership("score components", {
    topShare,
    breadthDepth,
    largeCapParticipation,
    concentrationSubScore: subScores.concentration,
    breadthSubScore: subScores.breadth,
    largeCapSubScore: subScores.largeCap,
    rawScore,
    finalScore: score,
  });

  if (direction > 0 && topShare >= 65 && breadthDepth < 45) {
    return buildMetric({
      score,
      label: "Top-heavy rally",
      bias: "bearish",
      confidence: state.confidence,
      status: state.status,
      source: "smart-algorithms",
      methodology: "Measures contribution concentration, breadth depth and large-cap participation across liquid alts.",
      stats: [
        { label: "Top movers share", value: `${Math.round(topShare)}%` },
        { label: "Breadth depth", value: `${Math.round(breadthDepth)}%` },
        { label: "Large-cap participation", value: `${Math.round(largeCapParticipation)}%` },
      ],
      summary: "The move is being carried by a narrow group of leaders rather than broad participation.",
    });
  }

  if (score >= 65 && breadthDepth >= 50) {
    return buildMetric({
      score,
      label: "Broad participation",
      bias: "bullish",
      confidence: state.confidence,
      status: state.status,
      source: "smart-algorithms",
      methodology: "Measures contribution concentration, breadth depth and large-cap participation across liquid alts.",
      stats: [
        { label: "Top movers share", value: `${Math.round(topShare)}%` },
        { label: "Breadth depth", value: `${Math.round(breadthDepth)}%` },
        { label: "Large-cap participation", value: `${Math.round(largeCapParticipation)}%` },
      ],
      summary: "Participation is broad, with leadership spread across the liquid alt basket.",
    });
  }

  if (topShare >= 60) {
    return buildMetric({
      score,
      label: "Narrow leadership",
      bias: "bearish",
      confidence: state.confidence,
      status: state.status,
      source: "smart-algorithms",
      methodology: "Measures contribution concentration, breadth depth and large-cap participation across liquid alts.",
      stats: [
        { label: "Top movers share", value: `${Math.round(topShare)}%` },
        { label: "Breadth depth", value: `${Math.round(breadthDepth)}%` },
        { label: "Large-cap participation", value: `${Math.round(largeCapParticipation)}%` },
      ],
      summary: "Leadership is narrow, and only a limited part of the liquid market is doing the heavy lifting.",
    });
  }

  return buildMetric({
    score,
    label: "Mixed leadership",
    bias: "neutral",
    confidence: state.confidence,
    status: state.status,
    source: "smart-algorithms",
    methodology: "Measures contribution concentration, breadth depth and large-cap participation across liquid alts.",
    stats: [
      { label: "Top movers share", value: `${Math.round(topShare)}%` },
      { label: "Breadth depth", value: `${Math.round(breadthDepth)}%` },
      { label: "Large-cap participation", value: `${Math.round(largeCapParticipation)}%` },
    ],
    summary: "Leadership is mixed, with neither a fully broad move nor an extremely concentrated tape.",
  });
}

function classifyBreakout(
  candle: CandleLike,
  prev20High: number,
  prev20Low: number,
  medianVolume: number,
): BreakoutDirection | null {
  const range = candle.high - candle.low;
  if (!(range > 0) || !(medianVolume > 0)) return null;

  const breaksHigh = candle.close > prev20High * 1.0025;
  const breaksLow = candle.close < prev20Low * 0.9975;
  const hasVolume = candle.volume >= medianVolume * 1.5;
  const bullishCloseStrength = (candle.close - candle.low) / range;
  const bearishCloseStrength = (candle.high - candle.close) / range;

  if (breaksHigh && hasVolume && bullishCloseStrength >= 0.7) return "bullish";
  if (breaksLow && hasVolume && bearishCloseStrength >= 0.7) return "bearish";
  return null;
}

function evaluateBreakoutCandles(candles: CandleLike[]): BreakoutScanResult {
  let resolvedSamples = 0;
  let successCount = 0;
  let failureCount = 0;
  let persistentCount = 0;
  let bullishResolved = 0;
  let bullishSuccess = 0;
  let bullishFailure = 0;
  let bearishResolved = 0;
  let bearishSuccess = 0;
  let bearishFailure = 0;

  for (let index = 20; index <= candles.length - 5; index += 1) {
    const current = candles[index];
    const priorWindow = candles.slice(index - 20, index);
    const prev20High = Math.max(...priorWindow.map((candle) => candle.high));
    const prev20Low = Math.min(...priorWindow.map((candle) => candle.low));
    const medianVolume = median(priorWindow.map((candle) => candle.volume));
    const direction = classifyBreakout(current, prev20High, prev20Low, medianVolume);
    if (!direction) continue;

    const forward = candles.slice(index + 1, index + 5);
    if (forward.length < 4) continue;

    const forwardHigh = Math.max(...forward.map((candle) => candle.high));
    const forwardLow = Math.min(...forward.map((candle) => candle.low));
    const finalClose = forward[forward.length - 1]?.close ?? current.close;
    const breakoutClose = current.close;

    const bullishSuccessHit = pctDiff(breakoutClose, forwardHigh) >= 1.0 && finalClose > prev20High * 1.001;
    const bullishFailureHit =
      finalClose <= prev20High ||
      forwardLow <= prev20High ||
      pctDiff(breakoutClose, forwardLow) <= -0.8;
    const bearishSuccessHit = pctDiff(breakoutClose, forwardLow) <= -1.0 && finalClose < prev20Low * 0.999;
    const bearishFailureHit =
      finalClose >= prev20Low ||
      forwardHigh >= prev20Low ||
      pctDiff(breakoutClose, forwardHigh) >= 0.8;

    const isSuccess = direction === "bullish" ? bullishSuccessHit : bearishSuccessHit;
    const isFailure = direction === "bullish" ? bullishFailureHit : bearishFailureHit;
    if (isSuccess && !isFailure) {
      resolvedSamples += 1;
      successCount += 1;
      persistentCount += 1;
      if (direction === "bullish") {
        bullishResolved += 1;
        bullishSuccess += 1;
      } else {
        bearishResolved += 1;
        bearishSuccess += 1;
      }
      continue;
    }

    if (isFailure) {
      resolvedSamples += 1;
      failureCount += 1;
      if (direction === "bullish") {
        bullishResolved += 1;
        bullishFailure += 1;
      } else {
        bearishResolved += 1;
        bearishFailure += 1;
      }
    }
  }

  return {
    resolvedSamples,
    successCount,
    failureCount,
    persistentCount,
    bullishResolved,
    bullishSuccess,
    bullishFailure,
    bearishResolved,
    bearishSuccess,
    bearishFailure,
  };
}

async function scanBreakoutUniverse(rows: TickerRow[], candleLimit: number): Promise<BreakoutScanResult> {
  const universe = rows
    .slice()
    .sort((a, b) => b.quoteVolumeUsd - a.quoteVolumeUsd)
    .slice(0, 30);

  const scans = await Promise.all(
    universe.map(async (row) => {
      try {
        const candles = await fetchUniverseCandles(
          { selectedExchange: row.exchange, selectedSymbol: row.symbol },
          "15m",
          candleLimit,
        );
        return evaluateBreakoutCandles(candles);
      } catch {
        return {
          resolvedSamples: 0,
          successCount: 0,
          failureCount: 0,
          persistentCount: 0,
          bullishResolved: 0,
          bullishSuccess: 0,
          bullishFailure: 0,
          bearishResolved: 0,
          bearishSuccess: 0,
          bearishFailure: 0,
        } satisfies BreakoutScanResult;
      }
    }),
  );

  return scans.reduce<BreakoutScanResult>(
    (acc, item) => ({
      resolvedSamples: acc.resolvedSamples + item.resolvedSamples,
      successCount: acc.successCount + item.successCount,
      failureCount: acc.failureCount + item.failureCount,
      persistentCount: acc.persistentCount + item.persistentCount,
      bullishResolved: acc.bullishResolved + item.bullishResolved,
      bullishSuccess: acc.bullishSuccess + item.bullishSuccess,
      bullishFailure: acc.bullishFailure + item.bullishFailure,
      bearishResolved: acc.bearishResolved + item.bearishResolved,
      bearishSuccess: acc.bearishSuccess + item.bearishSuccess,
      bearishFailure: acc.bearishFailure + item.bearishFailure,
    }),
    {
      resolvedSamples: 0,
      successCount: 0,
      failureCount: 0,
      persistentCount: 0,
      bullishResolved: 0,
      bullishSuccess: 0,
      bullishFailure: 0,
      bearishResolved: 0,
      bearishSuccess: 0,
      bearishFailure: 0,
    },
  );
}

function breakoutDirectionLine(scan: BreakoutScanResult) {
  const bullResolved = scan.bullishResolved;
  const bearResolved = scan.bearishResolved;
  if (bullResolved < 2 && bearResolved < 2) return "Directional sample remains thin.";

  const bullFailurePct = bullResolved > 0 ? 100 * scan.bullishFailure / bullResolved : 0;
  const bearFailurePct = bearResolved > 0 ? 100 * scan.bearishFailure / bearResolved : 0;
  const bullFollowPct = bullResolved > 0 ? 100 * scan.bullishSuccess / bullResolved : 0;
  const bearFollowPct = bearResolved > 0 ? 100 * scan.bearishSuccess / bearResolved : 0;

  if (bullResolved >= 2 && bearResolved >= 2) {
    if (bullFailurePct >= 60 && bearFailurePct >= 60) return "Follow-through is weak on both sides of the market.";
    if (bullFollowPct >= bearFollowPct + 20 && bullFailurePct + 15 <= bearFailurePct) return "Bull breakouts are holding better than bearish setups.";
    if (bearFollowPct >= bullFollowPct + 20 && bearFailurePct + 15 <= bullFailurePct) return "Bearish breakouts are holding better than bullish setups.";
    if (bullFailurePct >= bearFailurePct + 20) return "Bull breakouts are failing faster than bearish setups.";
    if (bearFailurePct >= bullFailurePct + 20) return "Bear breakouts are failing faster than bullish setups.";
    return "Both sides are choppy, with no clear directional edge.";
  }

  if (bullResolved >= 2) {
    return bullFailurePct >= 55 ? "Bull breakouts are failing quickly." : "Bull breakouts are holding better than expected.";
  }

  return bearFailurePct >= 55 ? "Bear breakouts are failing quickly." : "Bearish breakouts are holding better than expected.";
}

async function computeBreakoutHealth(input: Awaited<ReturnType<typeof fetchAdvancedInputs>>): Promise<MarketStructureMetricDto> {
  const primaryScan = await scanBreakoutUniverse(input.altRows, 96);
  const expandedScan = primaryScan.resolvedSamples < 4 ? await scanBreakoutUniverse(input.altRows, 192) : primaryScan;
  const scan = expandedScan.resolvedSamples > primaryScan.resolvedSamples ? expandedScan : primaryScan;
  const samples = scan.resolvedSamples;

  if (samples < 4) {
    return fallbackMetric(
      "Mixed follow-through",
      "Measures whether rolling 15m breakouts across liquid tradable alts are following through or failing over the next hour.",
      "smart-algorithms",
      "insufficient_coverage",
    );
  }

  const followPct = 100 * scan.successCount / samples;
  const failurePct = 100 * scan.failureCount / samples;
  const persistencePct = 100 * scan.persistentCount / samples;
  const score = clamp(0.45 * followPct + 0.35 * (100 - failurePct) + 0.2 * persistencePct, 0, 100);
  const status = samples >= 8 ? "ok" : "partial";
  const confidence = samples >= 12 ? "medium" : "low";
  const methodology = "Measures rolling 15m breakout candidates across liquid tradable alts, then scores follow-through, failure rate and persistence over the next 4 candles.";
  const stats = [
    { label: "Follow-through", value: `${Math.round(followPct)}%` },
    { label: "Failure rate", value: `${Math.round(failurePct)}%` },
    { label: "Samples", value: String(samples) },
  ];
  const directionLine = breakoutDirectionLine(scan);

  if (score >= 70) {
    return buildMetric({
      score,
      label: "Breakouts working",
      bias: "bullish",
      confidence,
      status,
      source: "smart-algorithms",
      methodology,
      stats,
      summary: `Breakouts are holding and follow-through remains healthy. ${directionLine}`,
    });
  }

  if (score <= 39) {
    return buildMetric({
      score,
      label: "Breakouts failing",
      bias: "bearish",
      confidence,
      status,
      source: "smart-algorithms",
      methodology,
      stats,
      summary: `Most breakouts are failing quickly in the current market. ${directionLine}`,
    });
  }

  if (score <= 54) {
    return buildMetric({
      score,
      label: "Choppy market",
      bias: "bearish",
      confidence,
      status,
      source: "smart-algorithms",
      methodology,
      stats,
      summary: `Breakouts are struggling to extend cleanly in a choppy tape. ${directionLine}`,
    });
  }

  return buildMetric({
    score,
    label: "Mixed follow-through",
    bias: "neutral",
    confidence,
    status,
    source: "smart-algorithms",
    methodology,
    stats,
    summary: `Follow-through is mixed, with moderate failure across recent setups. ${directionLine}`,
  });
}

function computeStablecoinFlow(input: Awaited<ReturnType<typeof fetchAdvancedInputs>>): MarketStructureMetricDto {
  const { stableRows, altRows, btcRow } = input;
  if (!altRows.length) {
    return fallbackMetric("Neutral flows", "Risk-on versus defensive stablecoin flow proxy built from spot participation and stable-share behaviour.", "smart-algorithms", "insufficient_coverage");
  }

  const stableVolume = stableRows.reduce((sum, row) => sum + row.quoteVolumeUsd, 0);
  const riskVolume = altRows.reduce((sum, row) => sum + row.quoteVolumeUsd, 0) + (btcRow?.quoteVolumeUsd ?? 0);
  const stableShare = stableVolume / Math.max(1, stableVolume + riskVolume);
  const prevStableShare = cacheGet<number>(STABLE_SHARE_PREV_KEY);
  const stableShareDeltaPp = typeof prevStableShare === "number" && Number.isFinite(prevStableShare) ? (stableShare - prevStableShare) * 100 : 0;
  cacheSet(STABLE_SHARE_PREV_KEY, stableShare, MARKET_PULSE_TTL.marketStructureSlowMs);

  const riskBreadth = 100 * altRows.filter((row) => row.change24hPct > MARKET_PULSE_ALT_BREADTH.deadZonePct).length / Math.max(1, altRows.length);
  const riskMedian = median(altRows.map((row) => row.change24hPct));
  const score = clamp(50 + (riskBreadth - 50) * 0.55 + riskMedian * 3.2 - stableShareDeltaPp * 8, 0, 100);
  const state = confidenceFromCount(altRows.length);

  if (score >= 60 && stableShareDeltaPp <= 1) {
    return buildMetric({
      score,
      label: "Risk capital entering",
      bias: "bullish",
      confidence: state.confidence,
      status: typeof prevStableShare === "number" ? state.status : "partial",
      source: "smart-algorithms-proxy",
      methodology: "Proxy from stable-pair volume share, liquid-alt breadth and stable-share trend. Not direct on-chain flow.",
      stats: [
        { label: "Stable dom. trend", value: `${stableShareDeltaPp >= 0 ? "+" : ""}${stableShareDeltaPp.toFixed(1)}pp` },
        { label: "Risk appetite", value: `${Math.round(riskBreadth)}%` },
        { label: "Flow bias", value: "Risk-on" },
      ],
      summary: "The risk backdrop is improving while stablecoin demand is not rising enough to signal defensive parking.",
    });
  }

  if (score <= 40 && stableShareDeltaPp >= 1) {
    return buildMetric({
      score,
      label: "Capital parking in stables",
      bias: "bearish",
      confidence: state.confidence,
      status: typeof prevStableShare === "number" ? state.status : "partial",
      source: "smart-algorithms-proxy",
      methodology: "Proxy from stable-pair volume share, liquid-alt breadth and stable-share trend. Not direct on-chain flow.",
      stats: [
        { label: "Stable dom. trend", value: `${stableShareDeltaPp >= 0 ? "+" : ""}${stableShareDeltaPp.toFixed(1)}pp` },
        { label: "Risk appetite", value: `${Math.round(riskBreadth)}%` },
        { label: "Flow bias", value: "Defensive" },
      ],
      summary: "Stablecoin demand is rising while risk participation softens, pointing to a more defensive posture.",
    });
  }

  return buildMetric({
    score,
    label: "Neutral flows",
    bias: "neutral",
    confidence: state.confidence,
    status: typeof prevStableShare === "number" ? state.status : "partial",
    source: "smart-algorithms-proxy",
    methodology: "Proxy from stable-pair volume share, liquid-alt breadth and stable-share trend. Not direct on-chain flow.",
    stats: [
      { label: "Stable dom. trend", value: `${stableShareDeltaPp >= 0 ? "+" : ""}${stableShareDeltaPp.toFixed(1)}pp` },
      { label: "Risk appetite", value: `${Math.round(riskBreadth)}%` },
      { label: "Flow bias", value: "Neutral" },
    ],
    summary: "Flow proxies are balanced, with no strong sign of capital either rushing into risk or hiding in stables.",
  });
}

function computeNarrativeHeat(input: Awaited<ReturnType<typeof fetchAdvancedInputs>>): MarketStructureMetricDto {
  const totalThemeVolume = input.altRows.reduce((sum, row) => sum + row.quoteVolumeUsd, 0);
  const buckets = Object.entries(NARRATIVE_BUCKETS)
    .map(([key, symbols]) => {
      const members = input.altRows.filter((row) => symbols.includes(row.baseAsset as never));
      const sampleSize = members.length;
      if (sampleSize < 2) return null;

      const breadth = 100 * members.filter((row) => row.change24hPct > MARKET_PULSE_ALT_BREADTH.deadZonePct).length / sampleSize;
      const upVolume = members
        .filter((row) => row.change24hPct > MARKET_PULSE_ALT_BREADTH.deadZonePct)
        .reduce((sum, row) => sum + row.quoteVolumeUsd, 0);
      const downVolume = members
        .filter((row) => row.change24hPct < -MARKET_PULSE_ALT_BREADTH.deadZonePct)
        .reduce((sum, row) => sum + row.quoteVolumeUsd, 0);
      const volumeSupport = upVolume + downVolume > 0 ? 100 * upVolume / (upVolume + downVolume) : 50;
      const medianMove = median(members.map((row) => row.change24hPct));
      const medianMoveScore = 100 * (clamp(medianMove, -10, 10) + 10) / 20;
      const participationWeights = members
        .map((row) => Math.abs(row.change24hPct) * row.quoteVolumeUsd)
        .filter((value) => value > 0)
        .sort((a, b) => b - a);
      const totalParticipationWeight = participationWeights.reduce((sum, value) => sum + value, 0);
      const topTwoShare = totalParticipationWeight > 0
        ? 100 * participationWeights.slice(0, 2).reduce((sum, value) => sum + value, 0) / totalParticipationWeight
        : 100;
      const participationQuality = clamp(100 - Math.max(0, topTwoShare - 45) * 1.8, 0, 100);
      const sampleFactor = sampleSize >= 4 ? 1 : sampleSize === 3 ? 0.88 : 0.75;
      const themeVolumeShare = totalThemeVolume > 0 ? 100 * members.reduce((sum, row) => sum + row.quoteVolumeUsd, 0) / totalThemeVolume : 0;
      const heat =
        clamp(
          (
            0.35 * breadth +
            0.30 * volumeSupport +
            0.20 * medianMoveScore +
            0.15 * participationQuality
          ) * sampleFactor,
          0,
          100,
        );

      return {
        key: key as keyof typeof NARRATIVE_BUCKETS,
        members,
        sampleSize,
        breadth,
        volumeSupport,
        medianMove,
        participationQuality,
        topTwoShare,
        themeVolumeShare,
        heat,
      };
    })
    .filter((bucket): bucket is NonNullable<typeof bucket> => Boolean(bucket))
    .sort((a, b) => b.heat - a.heat);

  if (!buckets.length) {
    return fallbackMetric(
      "Narratives cooling",
      "Mapped narrative buckets scored by breadth, volume support, median move and participation quality across the liquid thematic basket.",
      "smart-algorithms",
      "insufficient_coverage",
    );
  }

  const top = buckets[0];
  const second = buckets[1];
  const status = top.sampleSize >= 4 ? "ok" : "partial";
  const confidence = top.sampleSize >= 6 ? "high" : top.sampleSize >= 4 ? "medium" : "low";
  const methodology = "Mapped narrative buckets scored from liquid-alt breadth, directional volume support, median 24h move and a concentration penalty so one-coin pumps do not dominate the signal.";
  const stats = [
    { label: "Active theme", value: narrativeDisplay(top.key) },
    { label: "Theme breadth", value: `${Math.round(top.breadth)}%` },
    { label: "Theme volume", value: `${Math.round(top.volumeSupport)}%` },
  ];

  if (top.heat < 52) {
    return buildMetric({
      score: top.heat,
      label: "Narratives cooling",
      bias: "bearish",
      confidence,
      status,
      source: "smart-algorithms",
      methodology,
      stats,
      summary: top.sampleSize < 4
        ? `${narrativeDisplay(top.key)} is showing some activity, but thematic coverage is still thin.`
        : "Theme leadership is weak and scattered across the market.",
    });
  }

  const leadMargin = second ? top.heat - second.heat : top.heat;
  const multipleHealthyThemes = buckets.filter((bucket) => bucket.heat >= 56 && bucket.sampleSize >= 3).length >= 2;

  if (second && multipleHealthyThemes && leadMargin < 8) {
    return buildMetric({
      score: Math.round((top.heat + second.heat) / 2),
      label: "Leadership broadening",
      bias: "neutral",
      confidence,
      status,
      source: "smart-algorithms",
      methodology,
      stats,
      summary: "Narrative leadership is broadening, with more than one theme attracting meaningful participation.",
    });
  }

  if (top.heat < 60 && leadMargin < 8) {
    return buildMetric({
      score: top.heat,
      label: "Narratives cooling",
      bias: "bearish",
      confidence,
      status,
      source: "smart-algorithms",
      methodology,
      stats,
      summary: "No single narrative is strong enough to claim clear leadership right now.",
    });
  }

  return buildMetric({
    score: top.heat,
    label: narrativeLabel(top.key),
    bias: "bullish",
    confidence,
    status,
    source: "smart-algorithms",
    methodology,
    stats,
    summary:
      top.sampleSize < 4
        ? `${narrativeDisplay(top.key)} is improving, though coverage remains limited.`
        : top.topTwoShare > 68
          ? `${narrativeDisplay(top.key)} is active, but leadership is still somewhat concentrated.`
          : `${narrativeDisplay(top.key)} is leading the liquid thematic basket with broad participation.`,
  });
}

function addAge(metric: MarketStructureMetricDto): MarketStructureMetricDto {
  return {
    ...metric,
    ageSec: Math.max(0, Math.round((Date.now() - metric.updatedAt) / 1000)),
  };
}

function addAgeSnapshot(snapshot: AdvancedSnapshot): AdvancedSnapshot {
  return {
    btcRotation: addAge(snapshot.btcRotation),
    derivativesHeat: addAge(snapshot.derivativesHeat),
    marketLeadership: addAge(snapshot.marketLeadership),
    breakoutHealth: addAge(snapshot.breakoutHealth),
    stablecoinFlow: addAge(snapshot.stablecoinFlow),
    narrativeHeat: addAge(snapshot.narrativeHeat),
  };
}

export function fallbackAdvancedStructure(): AdvancedSnapshot {
  return addAgeSnapshot({
    btcRotation: fallbackMetric("Mixed rotation", "BTC versus liquid alt basket rotation across supported spot markets."),
    derivativesHeat: fallbackMetric("Balanced", "Binance futures funding and open-interest proxy for crowding.", "binance-futures"),
    marketLeadership: fallbackMetric("Mixed leadership", "Measures whether market participation is broad or concentrated in a few names."),
    breakoutHealth: fallbackMetric("Mixed follow-through", "Checks whether recent high-volume breakouts are holding or fading across liquid alts."),
    stablecoinFlow: fallbackMetric("Neutral flows", "Risk-on versus defensive stablecoin flow proxy built from spot participation and stable-share behaviour."),
    narrativeHeat: fallbackMetric("Narratives cooling", "Mapped narrative buckets scored by breadth, volume support, median move and participation quality."),
  });
}

export async function getAdvancedStructureSnapshot(): Promise<AdvancedSnapshot> {
  const cached = cache.get(KEY);
  if (cached) return addAgeSnapshot(cached);

  const pending = inflight.get(KEY);
  if (pending) return pending.then(addAgeSnapshot);

  const task = (async () => {
    try {
      const inputs = await fetchAdvancedInputs();
      const [derivativesHeat, breakoutHealth] = await Promise.all([
        computeDerivativesHeat(inputs),
        computeBreakoutHealth(inputs),
      ]);

      const snapshot: AdvancedSnapshot = {
        btcRotation: computeBtcRotation(inputs),
        derivativesHeat,
        marketLeadership: computeMarketLeadership(inputs),
        breakoutHealth,
        stablecoinFlow: computeStablecoinFlow(inputs),
        narrativeHeat: computeNarrativeHeat(inputs),
      };

      cache.set(KEY, snapshot, MARKET_PULSE_TTL.marketStructureMs);
      return snapshot;
    } catch (error) {
      console.warn("[market-pulse] advanced-structure failed", error);
      const fallback = fallbackAdvancedStructure();
      cache.set(KEY, fallback, MARKET_PULSE_TTL.marketStructureMs);
      return fallback;
    }
  })();

  inflight.set(KEY, task);
  return task.then(addAgeSnapshot);
}
