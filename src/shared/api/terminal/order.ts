import type {
  TerminalCancelAllOrdersRequest,
  TerminalCancelAllOrdersResponse,
  TerminalCancelOrderRequest,
  TerminalCancelOrderResponse,
  TerminalOrderTestRequest,
  TerminalOrderTestResponse,
  TerminalPlaceOrderRequest,
  TerminalPlaceOrderResponse,
} from "@/src/shared/model/terminal/contracts";

async function postTerminalJson<TResponse>(url: string, body: unknown, signal?: AbortSignal): Promise<TResponse> {
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    signal,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return (await res.json()) as TResponse;
}

export function testTerminalOrderRequest(body: TerminalOrderTestRequest, signal?: AbortSignal) {
  return postTerminalJson<TerminalOrderTestResponse>("/api/terminal/order/test", body, signal);
}

export function placeTerminalOrderRequest(body: TerminalPlaceOrderRequest, signal?: AbortSignal) {
  return postTerminalJson<TerminalPlaceOrderResponse>("/api/terminal/order", body, signal);
}

export function cancelTerminalOrderRequest(body: TerminalCancelOrderRequest, signal?: AbortSignal) {
  return postTerminalJson<TerminalCancelOrderResponse>("/api/terminal/order/cancel", body, signal);
}

export function cancelAllTerminalOrdersRequest(body: TerminalCancelAllOrdersRequest, signal?: AbortSignal) {
  return postTerminalJson<TerminalCancelAllOrdersResponse>("/api/terminal/order/cancel-all", body, signal);
}
