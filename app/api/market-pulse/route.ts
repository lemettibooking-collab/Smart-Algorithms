import { NextResponse } from "next/server";
import { rateLimitOr429 } from "@/src/shared/api";
import { getMarketPulseSnapshot } from "@/src/shared/api/server/market-pulse";
import { fallbackBtcPulse } from "@/src/shared/api/server/market-pulse/btc";
import { fallbackEquitiesPulse } from "@/src/shared/api/server/market-pulse/equities";
import { fallbackFearGreed } from "@/src/shared/api/server/market-pulse/fear-greed";
import { fallbackNewsSentiment } from "@/src/shared/api/server/market-pulse/news-sentiment";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimitOr429(req, { keyPrefix: "api:market-pulse", max: 60, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.res;

  try {
    const snapshot = await getMarketPulseSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.warn("[market-pulse] snapshot route failed", error);
    return NextResponse.json(
      {
        fearGreed: fallbackFearGreed(),
        btc: fallbackBtcPulse(),
        sentiment: fallbackNewsSentiment(),
        equities: fallbackEquitiesPulse(),
      },
      { status: 200 }
    );
  }
}
