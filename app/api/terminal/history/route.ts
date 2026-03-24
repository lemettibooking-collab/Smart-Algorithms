import { NextResponse } from "next/server";
import { rateLimitOr429 } from "@/src/shared/api";
import { getTerminalAccountReadAdapter } from "@/src/server/terminal/adapters";
import type { TerminalExecutionErrorCode } from "@/src/shared/model/terminal/contracts";

export const runtime = "nodejs";

function statusForError(code: TerminalExecutionErrorCode) {
  if (code === "order_not_found") return 404;
  return 400;
}

export async function GET(req: Request) {
  const rl = rateLimitOr429(req, { keyPrefix: "api:terminal-history", max: 120, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.res;

  const { searchParams } = new URL(req.url);
  const response = await getTerminalAccountReadAdapter().getOrderHistory({
    exchange: searchParams.get("exchange") ?? undefined,
    symbol: searchParams.get("symbol") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!response.ok) {
    return NextResponse.json(response, { status: statusForError(response.error.code) });
  }

  return NextResponse.json(response);
}
