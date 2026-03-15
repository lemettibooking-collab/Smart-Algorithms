import type { AltBreadthBias, AltBreadthConfidence, AltBreadthDto, AltBreadthLabel, AltBreadthStatus } from "@/src/entities/market-pulse/model/types";
import { MARKET_PULSE_ALT_BREADTH } from "@/src/shared/config/market-pulse";

export type AltBreadthInput = {
  baseAsset: string;
  exchange: "binance" | "mexc";
  return24hPct: number;
  quoteVolumeUsd: number;
  marketCap: number;
};

type Counts = {
  advancers: number;
  decliners: number;
  flats: number;
  strongGainers: number;
  strongLosers: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function median(values: number[]) {
  const nums = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function scoreToLabel(score: number): AltBreadthLabel {
  if (score <= 19) return "extreme-selling";
  if (score <= 39) return "selling-pressure";
  if (score <= 59) return "neutral";
  if (score <= 79) return "buying-pressure";
  return "extreme-buying";
}

function scoreToBias(score: number): AltBreadthBias {
  if (score >= 60) return "buying";
  if (score <= 39) return "selling";
  return "neutral";
}

function confidenceFromIncluded(included: number): { confidence: AltBreadthConfidence; status: AltBreadthStatus; isAvailable: boolean } {
  if (included < MARKET_PULSE_ALT_BREADTH.unavailableMinIncluded) {
    return { confidence: "unavailable", status: "unavailable", isAvailable: false };
  }
  if (included < MARKET_PULSE_ALT_BREADTH.mediumMinIncluded) {
    return { confidence: "low", status: "partial", isAvailable: true };
  }
  if (included < MARKET_PULSE_ALT_BREADTH.highMinIncluded) {
    return { confidence: "medium", status: "ok", isAvailable: true };
  }
  return { confidence: "high", status: "ok", isAvailable: true };
}

function signedBucket(changePct: number) {
  if (changePct > MARKET_PULSE_ALT_BREADTH.deadZonePct) return 1;
  if (changePct < -MARKET_PULSE_ALT_BREADTH.deadZonePct) return -1;
  return 0;
}

function components(rows: AltBreadthInput[]) {
  const N = rows.length;
  const counts: Counts = {
    advancers: 0,
    decliners: 0,
    flats: 0,
    strongGainers: 0,
    strongLosers: 0,
  };

  let upVol = 0;
  let downVol = 0;
  let weightedSigned = 0;
  const sqrtCaps = rows.map((row) => Math.sqrt(row.marketCap));
  const sqrtCapTotal = sqrtCaps.reduce((sum, value) => sum + value, 0) || 1;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const sign = signedBucket(row.return24hPct);
    if (sign > 0) counts.advancers += 1;
    else if (sign < 0) counts.decliners += 1;
    else counts.flats += 1;

    if (row.return24hPct >= MARKET_PULSE_ALT_BREADTH.strongMovePct) counts.strongGainers += 1;
    if (row.return24hPct <= -MARKET_PULSE_ALT_BREADTH.strongMovePct) counts.strongLosers += 1;

    if (sign > 0) upVol += row.quoteVolumeUsd;
    if (sign < 0) downVol += row.quoteVolumeUsd;

    const weight = sqrtCaps[i] / sqrtCapTotal;
    weightedSigned += weight * sign;
  }

  const breadthScore = 100 * (counts.advancers + 0.5 * counts.flats) / Math.max(1, N);
  const volumeBreadthScore = upVol + downVol > 0 ? 100 * upVol / (upVol + downVol) : 50;
  const weightedBreadthScore = 100 * (weightedSigned + 1) / 2;

  const medianMove = median(rows.map((row) => row.return24hPct));
  const medianMoveClamped = clamp(medianMove, -10, 10);
  const medianReturnScore = 100 * (medianMoveClamped + 10) / 20;

  const tailRatio = (counts.strongGainers - counts.strongLosers) / Math.max(1, N);
  const tailRatioClamped = clamp(tailRatio, -0.15, 0.15);
  const tailBalanceScore = 100 * (tailRatioClamped + 0.15) / 0.30;

  const rawScore =
    0.35 * breadthScore +
    0.25 * volumeBreadthScore +
    0.20 * weightedBreadthScore +
    0.10 * medianReturnScore +
    0.10 * tailBalanceScore;

  return {
    counts,
    breadthScore,
    volumeBreadthScore,
    weightedBreadthScore,
    medianMove,
    medianReturnScore,
    tailBalanceScore,
    rawScore,
    upVolPct: upVol + downVol > 0 ? 100 * upVol / (upVol + downVol) : 50,
  };
}

function buildDrivers(input: {
  advancersPct: number;
  declinersPct: number;
  upVolPct: number;
  medianMove: number;
  bias: AltBreadthBias;
}) {
  const drivers: string[] = [];
  if (input.bias === "selling") {
    drivers.push(`Decliners dominate ${Math.round(input.declinersPct)}% to ${Math.round(input.advancersPct)}%`);
  } else if (input.bias === "buying") {
    drivers.push(`Advancers lead ${Math.round(input.advancersPct)}% to ${Math.round(input.declinersPct)}%`);
  } else {
    drivers.push(`Breadth stays balanced at ${Math.round(input.advancersPct)}% vs ${Math.round(input.declinersPct)}%`);
  }

  const volDelta = input.upVolPct - 50;
  if (Math.abs(volDelta) >= 10) {
    const ratio = input.upVolPct > 50
      ? (input.upVolPct / Math.max(1, 100 - input.upVolPct)).toFixed(1)
      : ((100 - input.upVolPct) / Math.max(1, input.upVolPct)).toFixed(1);
    drivers.push(input.upVolPct >= 50 ? `Up-volume dominates at ${ratio}x` : `Down-volume dominates at ${ratio}x`);
  } else {
    drivers.push(input.bias === "selling" ? `Down-volume share sits near ${Math.round(100 - input.upVolPct)}%` : `Up-volume share sits near ${Math.round(input.upVolPct)}%`);
  }

  drivers.push(`Median alt move is ${input.medianMove >= 0 ? "+" : ""}${input.medianMove.toFixed(1)}%`);
  return drivers.slice(0, 3);
}

export function fallbackAltBreadth(errorCode = "provider_unavailable"): AltBreadthDto {
  return {
    score: 0,
    label: "neutral",
    bias: "neutral",
    confidence: "unavailable",
    status: "unavailable",
    source: "smart-algorithms",
    methodology: "Composite breadth across liquid altcoins on supported spot exchanges.",
    universe: {
      eligibleCount: 0,
      includedCount: 0,
      coveragePct: 0,
      exchangeMix: { binance: 0, mexc: 0 },
    },
    stats: {
      advancersPct: 0,
      upVolumePct: 0,
      medianReturnPct: 0,
      advancers: 0,
      decliners: 0,
      flats: 0,
      strongGainers: 0,
      strongLosers: 0,
    },
    components: {
      breadthScore: 0,
      volumeBreadthScore: 0,
      weightedBreadthScore: 0,
      medianReturnScore: 0,
      tailBalanceScore: 0,
      rawScore: 0,
    },
    drivers: ["No usable breadth data."],
    updatedAt: Date.now(),
    ageSec: 0,
    isAvailable: false,
    isFallback: true,
    errorCode,
  };
}

export function computeAltBreadthSnapshot(args: {
  rows: AltBreadthInput[];
  eligibleCount: number;
  exchangeMix: { binance: number; mexc: number };
  prevScore?: number | null;
  now?: number;
}): AltBreadthDto {
  const now = args.now ?? Date.now();
  const includedCount = args.rows.length;
  const state = confidenceFromIncluded(includedCount);

  if (includedCount === 0) {
    return {
      ...fallbackAltBreadth("empty_provider_payload"),
      updatedAt: now,
      ageSec: 0,
      universe: {
        eligibleCount: args.eligibleCount,
        includedCount: 0,
        coveragePct: 0,
        exchangeMix: args.exchangeMix,
      },
    };
  }

  const calc = components(args.rows);
  const rawRounded = clamp(Math.round(calc.rawScore), 0, 100);
  const finalScore = clamp(
    Math.round(args.prevScore != null ? 0.7 * calc.rawScore + 0.3 * args.prevScore : rawRounded),
    0,
    100,
  );

  const advancersPct = 100 * calc.counts.advancers / Math.max(1, includedCount);
  const declinersPct = 100 * calc.counts.decliners / Math.max(1, includedCount);
  const label = scoreToLabel(finalScore);
  const bias = scoreToBias(finalScore);

  return {
    score: finalScore,
    label,
    bias,
    confidence: state.confidence,
    status: state.status,
    source: "smart-algorithms",
    methodology: "Composite breadth from advancers, volume breadth, market-cap weighting, median move and tail balance across liquid altcoins.",
    universe: {
      eligibleCount: args.eligibleCount,
      includedCount,
      coveragePct: args.eligibleCount > 0 ? 100 * includedCount / args.eligibleCount : 0,
      exchangeMix: args.exchangeMix,
    },
    stats: {
      advancersPct,
      upVolumePct: calc.upVolPct,
      medianReturnPct: calc.medianMove,
      advancers: calc.counts.advancers,
      decliners: calc.counts.decliners,
      flats: calc.counts.flats,
      strongGainers: calc.counts.strongGainers,
      strongLosers: calc.counts.strongLosers,
    },
    components: {
      breadthScore: calc.breadthScore,
      volumeBreadthScore: calc.volumeBreadthScore,
      weightedBreadthScore: calc.weightedBreadthScore,
      medianReturnScore: calc.medianReturnScore,
      tailBalanceScore: calc.tailBalanceScore,
      rawScore: calc.rawScore,
    },
    drivers: buildDrivers({
      advancersPct,
      declinersPct,
      upVolPct: calc.upVolPct,
      medianMove: calc.medianMove,
      bias,
    }),
    updatedAt: now,
    ageSec: 0,
    isAvailable: state.isAvailable,
    isFallback: !state.isAvailable,
    errorCode: state.isAvailable ? undefined : "insufficient_coverage",
  };
}
