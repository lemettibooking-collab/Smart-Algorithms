"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cancelAllTerminalOrdersRequest,
  placeTerminalOrderRequest,
  testTerminalOrderRequest,
} from "@/src/shared/api/terminal/order";
import { validateTerminalOrderDraft } from "@/src/shared/lib/terminal/validate-order";
import type {
  TerminalOrderDraft,
  TerminalOrderDto,
  TerminalOrderSide,
  TerminalOrderType,
  TerminalSymbolMetaDto,
  TerminalTradeMode,
} from "@/src/shared/model/terminal/contracts";
import type { ScalpOrderIntent } from "@/src/widgets/terminal-scalp-workspace/model/types";

type UseScalpQuickActionsArgs = {
  symbol: string;
  exchange: TerminalOrderDraft["exchange"];
  tradeMode: TerminalTradeMode;
  symbolMeta: TerminalSymbolMetaDto | null;
  intent: ScalpOrderIntent;
};

function decimalPlaces(value?: string) {
  if (!value || !value.includes(".")) return 0;
  return value.split(".")[1]?.length ?? 0;
}

function buildPresetQuantities(symbolMeta: TerminalSymbolMetaDto | null) {
  const minQty = Number(symbolMeta?.filters.minQty ?? "0.1");
  const decimals = decimalPlaces(symbolMeta?.filters.stepSize ?? symbolMeta?.filters.minQty ?? "0.1");
  const multipliers = [1, 2, 5, 10];

  return multipliers.map((multiplier) => {
    const value = Number.isFinite(minQty) && minQty > 0 ? (minQty * multiplier).toFixed(decimals) : "0.1";
    return {
      label: multiplier === 1 ? "Min" : `${multiplier}x`,
      value,
    };
  });
}

export function useScalpQuickActions({
  symbol,
  exchange,
  tradeMode,
  symbolMeta,
  intent,
}: UseScalpQuickActionsArgs) {
  const [actionState, setActionState] = useState<"idle" | "submitting" | "cancelling" | "success" | "error">("idle");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<TerminalOrderDto | null>(null);

  useEffect(() => {
    setActionState("idle");
    setActionMessage(null);
    setLastOrder(null);
  }, [
    exchange,
    intent.actionMode,
    intent.price,
    intent.quantity,
    intent.side,
    intent.slPrice,
    intent.source,
    intent.tpPrice,
    intent.type,
    symbol,
    tradeMode,
  ]);

  const presets = useMemo(() => buildPresetQuantities(symbolMeta), [symbolMeta]);

  const draft = useMemo<TerminalOrderDraft>(
    () => ({
      exchange,
      symbol,
      side: intent.side,
      type: intent.type,
      quantity: intent.quantity,
      price: intent.type === "LIMIT" ? intent.price : undefined,
      mode: tradeMode,
    }),
    [exchange, intent.price, intent.quantity, intent.side, intent.type, symbol, tradeMode],
  );

  const validation = useMemo(() => validateTerminalOrderDraft(draft, symbolMeta), [draft, symbolMeta]);

  const issuesByField = useMemo(() => {
    return validation.issues.reduce<Record<string, string[]>>((acc, issue) => {
      const key = issue.field ?? "general";
      acc[key] ??= [];
      acc[key].push(issue.message);
      return acc;
    }, {});
  }, [validation.issues]);

  async function submitIntent(side: TerminalOrderSide, type: TerminalOrderType) {
    const request: TerminalOrderDraft = {
      ...draft,
      side,
      type,
      price: type === "LIMIT" ? intent.price : undefined,
    };
    const requestValidation = validateTerminalOrderDraft(request, symbolMeta);

    if (!requestValidation.ok) {
      setActionState("error");
      setActionMessage(requestValidation.issues[0]?.message ?? "Scalp order draft is not valid yet.");
      setLastOrder(null);
      return;
    }

    setActionState("submitting");
    setActionMessage(null);
    setLastOrder(null);

    try {
      const testResponse = await testTerminalOrderRequest(request);
      if (!testResponse.ok) {
        setActionState("error");
        setActionMessage(testResponse.error.message);
        return;
      }

      const placeResponse = await placeTerminalOrderRequest(request);
      if (!placeResponse.ok) {
        setActionState("error");
        setActionMessage(placeResponse.error.message);
        return;
      }

      setActionState("success");
      setLastOrder(placeResponse.order);
      setActionMessage(
        placeResponse.duplicated
          ? `Duplicate scalp submit guarded. Reusing demo order ${placeResponse.order.id}.`
          : `${side} ${type.toLowerCase()} demo order ${placeResponse.order.id} created successfully.`,
      );
    } catch (error: unknown) {
      setActionState("error");
      setActionMessage(error instanceof Error ? error.message : "Failed to submit scalp order.");
    }
  }

  async function cancelAll() {
    setActionState("cancelling");
    setActionMessage(null);
    setLastOrder(null);

    try {
      const response = await cancelAllTerminalOrdersRequest({
        exchange,
        symbol,
        mode: tradeMode,
      });

      if (!response.ok) {
        setActionState("error");
        setActionMessage(response.error.message);
        return;
      }

      setActionState("success");
      setLastOrder(null);
      setActionMessage(
        response.canceledCount
          ? `${response.canceledCount} scalp order${response.canceledCount === 1 ? "" : "s"} canceled for ${symbol}.`
          : `No active orders to cancel for ${symbol}.`,
      );
    } catch (error: unknown) {
      setActionState("error");
      setActionMessage(error instanceof Error ? error.message : "Failed to cancel scalp orders.");
    }
  }

  return {
    presets,
    draft,
    validation,
    issuesByField,
    actionState,
    actionMessage,
    lastOrder,
    submitIntent,
    cancelAll,
  };
}
