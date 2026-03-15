import { NextResponse } from "next/server";
import { getMarketUniverseDebugSnapshot } from "@/src/shared/lib/market-universe";

export const runtime = "nodejs";

export async function GET() {
  if (process.env.NODE_ENV === "production" && process.env.DEBUG_MARKET_UNIVERSE !== "1") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    const snapshot = await getMarketUniverseDebugSnapshot();
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    console.warn("[debug] market-universe failed", error);
    return NextResponse.json({ ok: false, error: "market_universe_debug_failed" }, { status: 500 });
  }
}
