import { NextResponse } from "next/server";
import { rateLimitOr429 } from "@/src/shared/api";
import { getTerminalMarketDataAdapter } from "@/src/server/terminal/adapters";
import { runPaperLimitMatcher } from "@/src/server/terminal/core/paper-limit-matcher";
import { getTerminalTransportMarket } from "@/src/server/terminal/transport";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimitOr429(req, { keyPrefix: "api:terminal-scalp-market", max: 120, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.res;

  const { searchParams } = new URL(req.url);
  const exchange = searchParams.get("exchange") ?? undefined;
  const symbol = searchParams.get("symbol") ?? undefined;
  const adapter = getTerminalMarketDataAdapter();
  const normalizedExchange = exchange?.trim().toLowerCase();
  const response =
    normalizedExchange === "binance" || normalizedExchange === "mexc" || !normalizedExchange
      ? await getTerminalTransportMarket({
          exchange: normalizedExchange === "mexc" ? "mexc" : "binance",
          symbol: symbol ?? "",
          snapshotLoader: ({ exchange: resolvedExchange, symbol: resolvedSymbol }) =>
            adapter.getScalpMarket({
              exchange: resolvedExchange,
              symbol: resolvedSymbol,
            }),
        })
      : await adapter.getScalpMarket({
          exchange,
          symbol,
        });

  if (!response.ok) {
    const status = response.error.code === "symbol_not_found" ? 404 : 400;
    return NextResponse.json(response, { status });
  }

  if (response.health.source === "exchange_snapshot" && !response.health.fallbackUsed) {
    try {
      await runPaperLimitMatcher({
        market: response.market,
      });
    } catch {
      // Keep market snapshot delivery independent from paper matching failures.
    }
  }

  return NextResponse.json(response);
}
