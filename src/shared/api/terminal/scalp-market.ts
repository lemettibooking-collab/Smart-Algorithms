import type { TerminalExchange, TerminalScalpMarketResponse } from "@/src/shared/model/terminal/contracts";

export async function fetchTerminalScalpMarket(
  params: { exchange: TerminalExchange; symbol: string },
  signal?: AbortSignal,
): Promise<TerminalScalpMarketResponse> {
  const searchParams = new URLSearchParams({
    exchange: params.exchange,
    symbol: params.symbol,
  });

  const res = await fetch(`/api/terminal/scalp-market?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  return (await res.json()) as TerminalScalpMarketResponse;
}
