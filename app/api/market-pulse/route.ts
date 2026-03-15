import { NextResponse } from "next/server";
import { rateLimitOr429 } from "@/src/shared/api";
import { getMarketPulseSnapshot } from "@/src/shared/api/server/market-pulse";
import { fallbackBtcPulse } from "@/src/shared/api/server/market-pulse/btc";
import { fallbackEquitiesPulse } from "@/src/shared/api/server/market-pulse/equities";
import { fallbackFearGreed } from "@/src/shared/api/server/market-pulse/fear-greed";
import { fallbackNewsSentiment } from "@/src/shared/api/server/market-pulse/news-sentiment";
import { fallbackAltBreadthPulse } from "@/src/shared/api/server/market-pulse/alt-breadth";
import { fallbackAdvancedStructure } from "@/src/shared/api/server/market-pulse/advanced-structure";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimitOr429(req, { keyPrefix: "api:market-pulse", max: 60, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.res;

  try {
    const snapshot = await getMarketPulseSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.warn("[market-pulse] snapshot route failed", error);
    const advanced = fallbackAdvancedStructure();
    return NextResponse.json(
      {
        fearGreed: fallbackFearGreed(),
        btc: fallbackBtcPulse(),
        sentiment: fallbackNewsSentiment(),
        equities: fallbackEquitiesPulse(),
        altBreadth: fallbackAltBreadthPulse(),
        btcRotation: advanced.btcRotation,
        derivativesHeat: advanced.derivativesHeat,
        marketLeadership: advanced.marketLeadership,
        breakoutHealth: advanced.breakoutHealth,
        stablecoinFlow: advanced.stablecoinFlow,
        narrativeHeat: advanced.narrativeHeat,
      },
      { status: 200 }
    );
  }
}
