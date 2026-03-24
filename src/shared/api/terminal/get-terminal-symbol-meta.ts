import type { TerminalExchange, TerminalSymbolMetaResponse } from "@/src/shared/model/terminal/contracts";

export async function fetchTerminalSymbolMeta(
  params: { exchange: TerminalExchange; symbol: string },
  signal?: AbortSignal,
): Promise<TerminalSymbolMetaResponse> {
  const searchParams = new URLSearchParams({
    exchange: params.exchange,
    symbol: params.symbol,
  });

  const res = await fetch(`/api/terminal/symbol-meta?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  return (await res.json()) as TerminalSymbolMetaResponse;
}
