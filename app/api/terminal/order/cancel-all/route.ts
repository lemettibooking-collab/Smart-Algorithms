import { NextResponse } from "next/server";
import { rateLimitOr429 } from "@/src/shared/api";
import { getTerminalExecutionAdapter } from "@/src/server/terminal/adapters";
import type { TerminalCancelAllOrdersRequest, TerminalExecutionErrorCode } from "@/src/shared/model/terminal/contracts";

export const runtime = "nodejs";

function statusForError(code: TerminalExecutionErrorCode) {
  if (code === "order_not_found") return 404;
  if (code === "unsupported_exchange" || code === "live_mode_disabled" || code === "validation_failed" || code === "symbol_meta_unavailable") {
    return 400;
  }
  return 400;
}

export async function POST(req: Request) {
  const rl = rateLimitOr429(req, { keyPrefix: "api:terminal-order-cancel-all", max: 120, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.res;

  let body: Partial<TerminalCancelAllOrdersRequest> | null = null;
  try {
    body = (await req.json()) as Partial<TerminalCancelAllOrdersRequest>;
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_request", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  const response = await getTerminalExecutionAdapter().cancelAllOrders(body);
  if (!response.ok) {
    return NextResponse.json(response, { status: statusForError(response.error.code) });
  }
  return NextResponse.json(response);
}
