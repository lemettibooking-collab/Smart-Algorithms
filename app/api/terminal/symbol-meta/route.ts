import { NextResponse } from "next/server";
import { rateLimitOr429 } from "@/src/shared/api";
import { getTerminalSymbolMetaAdapter } from "@/src/server/terminal/adapters";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimitOr429(req, { keyPrefix: "api:terminal-symbol-meta", max: 120, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.res;

  const { searchParams } = new URL(req.url);
  const response = await getTerminalSymbolMetaAdapter().getSymbolMeta({
    symbol: searchParams.get("symbol") ?? undefined,
    exchange: searchParams.get("exchange") ?? undefined,
  });

  if (!response.ok) {
    const status = response.error.code === "symbol_not_found" ? 404 : 400;
    return NextResponse.json(response, { status });
  }

  return NextResponse.json(response);
}
