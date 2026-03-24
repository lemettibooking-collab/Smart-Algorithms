import { NextResponse } from "next/server";
import { buildTerminalAccountSnapshot } from "@/src/server/terminal/account/application/build-terminal-account-snapshot";
import { toScopeKey, toTerminalAccountScope } from "@/src/server/terminal/account/domain/terminal-account-scope";
import { terminalAccountVersionRepo } from "@/src/server/terminal/account/infrastructure/terminal-account-version-repo";
import { rateLimitOr429 } from "@/src/shared/api";

export const runtime = "nodejs";

function badRequest(message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "invalid_request",
        message,
      },
    },
    { status: 400 },
  );
}

export async function GET(req: Request) {
  const rl = rateLimitOr429(req, { keyPrefix: "api:terminal-account-snapshot", max: 120, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.res;

  const { searchParams } = new URL(req.url);
  const exchange = searchParams.get("exchange");
  const tradeMode = searchParams.get("tradeMode");

  if (!exchange || (exchange !== "binance" && exchange !== "mexc")) {
    return badRequest("exchange must be one of: binance, mexc");
  }

  if (!tradeMode || tradeMode !== "paper") {
    return badRequest("tradeMode must be paper in v1");
  }

  const scope = toTerminalAccountScope({ exchange, tradeMode });
  if (!scope) {
    return badRequest("Only paper terminal account snapshots for binance or mexc are supported in v1.");
  }

  const version = terminalAccountVersionRepo.ensure(toScopeKey(scope), "initial");
  const snapshot = await buildTerminalAccountSnapshot({
    scope,
    version,
  });

  return NextResponse.json(snapshot);
}
