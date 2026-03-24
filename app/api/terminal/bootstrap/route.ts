import { NextResponse } from "next/server";
import { rateLimitOr429 } from "@/src/shared/api";
import { getTerminalBootstrap } from "@/src/server/terminal/repositories/get-terminal-bootstrap";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimitOr429(req, { keyPrefix: "api:terminal-bootstrap", max: 120, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.res;

  const { searchParams } = new URL(req.url);
  const snapshot = await getTerminalBootstrap({
    symbol: searchParams.get("symbol") ?? undefined,
    exchange: searchParams.get("exchange") ?? undefined,
  });

  return NextResponse.json(snapshot);
}
