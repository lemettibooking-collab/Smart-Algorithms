"use client";

import { useEffect, useState } from "react";
import type { MarketPulseDto } from "@/src/entities/market-pulse";
import { MarketStructureCard } from "@/src/entities/market-pulse/ui/market-structure-card";
import { fetchMarketPulseSnapshot, marketPulseStreamUrl } from "@/src/shared/api/market-pulse";

type AdvancedStructureState = Pick<
  MarketPulseDto,
  "btcRotation" | "derivativesHeat" | "marketLeadership" | "breakoutHealth" | "stablecoinFlow" | "narrativeHeat"
>;

function emptyMetric(): AdvancedStructureState["btcRotation"] {
  const now = Date.now();
  return {
    score: 0,
    label: "Unavailable",
    bias: "neutral" as const,
    confidence: "unavailable" as const,
    status: "unavailable" as const,
    source: "smart-algorithms",
    methodology: "Advanced market structure snapshot unavailable.",
    stats: [
      { label: "Status", value: "No data" },
      { label: "Coverage", value: "Unavailable" },
      { label: "Signal", value: "Waiting" },
    ],
    summary: "Not enough data to build a reliable signal.",
    updatedAt: now,
    ageSec: 0,
    isAvailable: false,
    isFallback: true,
    errorCode: "provider_unavailable",
  };
}

function emptyAdvancedSnapshot(): AdvancedStructureState {
  const metric = emptyMetric();
  return {
    btcRotation: metric,
    derivativesHeat: metric,
    marketLeadership: metric,
    breakoutHealth: metric,
    stablecoinFlow: metric,
    narrativeHeat: metric,
  };
}

function StructureSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-3 md:grid-cols-2">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)]">
          <div className="animate-pulse space-y-3">
            <div className="h-3 w-28 rounded bg-[var(--panel2)]" />
            <div className="h-7 w-16 rounded bg-[var(--panel2)]" />
            <div className="h-2 w-full rounded bg-[var(--panel2)]" />
            <div className="h-12 rounded bg-[var(--panel2)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

const TOOLTIP_LINES: Record<keyof ReturnType<typeof emptyAdvancedSnapshot>, string[]> = {
  btcRotation: [
    "Shows whether capital is favouring BTC, large-cap alts, or the broader liquid alt basket.",
    "Built from BTC relative performance, large-cap alt leadership, and the share of liquid alts outperforming BTC over 24h.",
  ],
  derivativesHeat: [
    "A Binance-futures MVP crowding proxy.",
    "Combines funding, open-interest change, and price versus OI behaviour on BTC and ETH.",
    "Use it as positioning heat, not a full-market liquidation tape.",
  ],
  marketLeadership: [
    "Shows whether market participation is broad or concentrated in a few names.",
    "Uses top-mover concentration, breadth depth, and large-cap participation across liquid alts.",
  ],
  breakoutHealth: [
    "Measures whether recent breakouts across the liquid market are following through or failing.",
    "Built from rolling 15m candle behaviour across liquid tradable alts, not from manual event labels.",
    "It also compares bullish versus bearish breakout quality, so thin directional samples lower confidence.",
  ],
  stablecoinFlow: [
    "A risk-on versus defensive flow proxy.",
    "Built from stable-pair activity, liquid-alt breadth, and stable-share trend.",
    "This is not direct on-chain balance data.",
  ],
  narrativeHeat: [
    "Tracks which crypto theme is strongest across the liquid thematic basket.",
    "Uses explicit narrative buckets plus breadth, price strength, volume support and participation quality.",
    "Thin theme coverage lowers confidence, and this is not a social-media hype score.",
    "Theme leading means one bucket is clearly ahead. Leadership broadening is reserved for multiple healthy themes with similar strength.",
  ],
};

export function AdvancedMarketStructureGrid() {
  const [snapshot, setSnapshot] = useState<AdvancedStructureState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void fetchMarketPulseSnapshot(ac.signal)
      .then((data) => {
        setSnapshot({
          btcRotation: data.btcRotation,
          derivativesHeat: data.derivativesHeat,
          marketLeadership: data.marketLeadership,
          breakoutHealth: data.breakoutHealth,
          stablecoinFlow: data.stablecoinFlow,
          narrativeHeat: data.narrativeHeat,
        });
      })
      .catch(() => {
        setSnapshot((prev) => prev ?? emptyAdvancedSnapshot());
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const es = new EventSource(marketPulseStreamUrl());
    const onSnapshot = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as MarketPulseDto;
        setSnapshot({
          btcRotation: data.btcRotation,
          derivativesHeat: data.derivativesHeat,
          marketLeadership: data.marketLeadership,
          breakoutHealth: data.breakoutHealth,
          stablecoinFlow: data.stablecoinFlow,
          narrativeHeat: data.narrativeHeat,
        });
      } catch {
        // ignore bad payload
      }
    };

    es.addEventListener("snapshot", onSnapshot as EventListener);
    return () => {
      es.removeEventListener("snapshot", onSnapshot as EventListener);
      es.close();
    };
  }, []);

  if (loading && !snapshot) return <StructureSkeleton />;
  const data = snapshot ?? emptyAdvancedSnapshot();

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <MarketStructureCard title="BTC ROTATION" data={data.btcRotation} tooltipLines={TOOLTIP_LINES.btcRotation} />
      <MarketStructureCard title="DERIVATIVES HEAT" data={data.derivativesHeat} tooltipLines={TOOLTIP_LINES.derivativesHeat} />
      <MarketStructureCard title="MARKET LEADERSHIP" data={data.marketLeadership} tooltipLines={TOOLTIP_LINES.marketLeadership} />
      <MarketStructureCard title="BREAKOUT HEALTH" data={data.breakoutHealth} tooltipLines={TOOLTIP_LINES.breakoutHealth} />
      <MarketStructureCard title="STABLECOIN FLOW" data={data.stablecoinFlow} tooltipLines={TOOLTIP_LINES.stablecoinFlow} />
      <MarketStructureCard title="NARRATIVE HEAT" data={data.narrativeHeat} tooltipLines={TOOLTIP_LINES.narrativeHeat} />
    </div>
  );
}
