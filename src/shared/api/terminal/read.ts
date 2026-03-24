import type {
  TerminalAccountValuationResponse,
  TerminalBalancesResponse,
  TerminalExchange,
  TerminalOpenOrdersResponse,
  TerminalOrderHistoryResponse,
  TerminalPnlResponse,
} from "@/src/shared/model/terminal/contracts";

async function fetchTerminalReadJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  return (await res.json()) as T;
}

export function fetchTerminalBalances(params: { exchange: TerminalExchange }, signal?: AbortSignal) {
  const searchParams = new URLSearchParams({
    exchange: params.exchange,
  });
  return fetchTerminalReadJson<TerminalBalancesResponse>(`/api/terminal/balances?${searchParams.toString()}`, signal);
}

export function fetchTerminalAccountValuation(params: { exchange: TerminalExchange }, signal?: AbortSignal) {
  const searchParams = new URLSearchParams({
    exchange: params.exchange,
  });
  return fetchTerminalReadJson<TerminalAccountValuationResponse>(`/api/terminal/equity?${searchParams.toString()}`, signal);
}

export function fetchTerminalPnl(params: { exchange: TerminalExchange }, signal?: AbortSignal) {
  const searchParams = new URLSearchParams({
    exchange: params.exchange,
  });
  return fetchTerminalReadJson<TerminalPnlResponse>(`/api/terminal/pnl?${searchParams.toString()}`, signal);
}

export function fetchTerminalOpenOrders(
  params: { exchange: TerminalExchange; symbol?: string },
  signal?: AbortSignal,
) {
  const searchParams = new URLSearchParams({
    exchange: params.exchange,
  });
  if (params.symbol) searchParams.set("symbol", params.symbol);
  return fetchTerminalReadJson<TerminalOpenOrdersResponse>(`/api/terminal/open-orders?${searchParams.toString()}`, signal);
}

export function fetchTerminalOrderHistory(
  params: { exchange: TerminalExchange; symbol?: string; limit?: number },
  signal?: AbortSignal,
) {
  const searchParams = new URLSearchParams({
    exchange: params.exchange,
    limit: String(params.limit ?? 50),
  });
  if (params.symbol) searchParams.set("symbol", params.symbol);
  return fetchTerminalReadJson<TerminalOrderHistoryResponse>(`/api/terminal/history?${searchParams.toString()}`, signal);
}
