"use client";

import { useCallback, useEffect, useState } from "react";
import { cancelAllTerminalOrdersRequest, cancelTerminalOrderRequest } from "@/src/shared/api/terminal/order";
import {
  fetchTerminalAccountValuation,
  fetchTerminalBalances,
  fetchTerminalOpenOrders,
  fetchTerminalOrderHistory,
  fetchTerminalPnl,
} from "@/src/shared/api/terminal/read";
import type {
  TerminalAccountValuationDto,
  TerminalBalanceDto,
  TerminalExchange,
  TerminalOrderDto,
  TerminalPnlSummaryDto,
  TerminalTradeMode,
} from "@/src/shared/model/terminal/contracts";

type UseTerminalBottomPanelsArgs = {
  exchange: TerminalExchange;
  symbol: string;
  tradeMode: TerminalTradeMode;
  refreshKey: number;
};

export function useTerminalBottomPanels({ exchange, symbol, tradeMode, refreshKey }: UseTerminalBottomPanelsArgs) {
  const [balances, setBalances] = useState<TerminalBalanceDto[]>([]);
  const [openOrders, setOpenOrders] = useState<TerminalOrderDto[]>([]);
  const [historyOrders, setHistoryOrders] = useState<TerminalOrderDto[]>([]);
  const [account, setAccount] = useState<TerminalAccountValuationDto | null>(null);
  const [pnl, setPnl] = useState<TerminalPnlSummaryDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<"idle" | "cancelling">("idle");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [balancesResponse, valuationResponse, pnlResponse, openOrdersResponse, historyResponse] = await Promise.all([
      fetchTerminalBalances({ exchange }),
      fetchTerminalAccountValuation({ exchange }),
      fetchTerminalPnl({ exchange }),
      fetchTerminalOpenOrders({ exchange, symbol }),
      fetchTerminalOrderHistory({ exchange, symbol, limit: 50 }),
    ]);

    if (!balancesResponse.ok) {
      throw new Error(balancesResponse.error.message);
    }
    if (!valuationResponse.ok) {
      throw new Error(valuationResponse.error.message);
    }
    if (!pnlResponse.ok) {
      throw new Error(pnlResponse.error.message);
    }
    if (!openOrdersResponse.ok) {
      throw new Error(openOrdersResponse.error.message);
    }
    if (!historyResponse.ok) {
      throw new Error(historyResponse.error.message);
    }

    setBalances(balancesResponse.balances);
    setAccount(valuationResponse.account);
    setPnl(pnlResponse.pnl);
    setOpenOrders(openOrdersResponse.orders);
    setHistoryOrders(historyResponse.orders);
  }, [exchange, symbol]);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    load()
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load terminal panel data.");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [load, refreshKey]);

  async function cancelOrder(orderId: string) {
    setActionState("cancelling");
    setActionMessage(null);
    try {
      const response = await cancelTerminalOrderRequest({
        exchange,
        symbol,
        orderId,
        mode: tradeMode,
      });
      if (!response.ok) {
        setActionMessage(response.error.message);
        return;
      }
      setActionMessage(`Order ${response.order.id} canceled.`);
      await load();
    } catch (cancelError: unknown) {
      setActionMessage(cancelError instanceof Error ? cancelError.message : "Failed to cancel terminal order.");
    } finally {
      setActionState("idle");
    }
  }

  async function cancelAll() {
    setActionState("cancelling");
    setActionMessage(null);
    try {
      const response = await cancelAllTerminalOrdersRequest({
        exchange,
        symbol,
        mode: tradeMode,
      });
      if (!response.ok) {
        setActionMessage(response.error.message);
        return;
      }
      setActionMessage(
        response.canceledCount
          ? `${response.canceledCount} open order${response.canceledCount === 1 ? "" : "s"} canceled.`
          : "No active orders to cancel.",
      );
      await load();
    } catch (cancelError: unknown) {
      setActionMessage(cancelError instanceof Error ? cancelError.message : "Failed to cancel all terminal orders.");
    } finally {
      setActionState("idle");
    }
  }

  return {
    balances,
    account,
    pnl,
    openOrders,
    historyOrders,
    isLoading,
    error,
    actionState,
    actionMessage,
    cancelOrder,
    cancelAll,
  };
}
