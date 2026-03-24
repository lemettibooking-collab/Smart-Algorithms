import { NextResponse } from "next/server";
import { getTerminalAccountReadAdapter } from "@/src/server/terminal/adapters";
import { rateLimitOr429 } from "@/src/shared/api";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimitOr429(req, { keyPrefix: "api:terminal-equity", max: 120, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.res;

  const { searchParams } = new URL(req.url);
  const response = await getTerminalAccountReadAdapter().getAccountValuation({
    exchange: searchParams.get("exchange") ?? undefined,
  });

  return NextResponse.json(response);
}
