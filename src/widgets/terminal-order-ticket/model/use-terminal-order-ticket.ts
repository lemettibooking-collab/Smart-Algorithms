"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  TerminalOrderDto,
  TerminalOrderDraft,
  TerminalOrderSide,
  TerminalOrderType,
  TerminalSymbolMetaDto,
} from "@/src/shared/model/terminal/contracts";
import { placeTerminalOrderRequest, testTerminalOrderRequest } from "@/src/shared/api/terminal/order";
import { validateTerminalOrderDraft } from "@/src/shared/lib/terminal/validate-order";

type UseTerminalOrderTicketArgs = {
  symbol: string;
  exchange: TerminalOrderDraft["exchange"];
  tradeMode: TerminalOrderDraft["mode"];
  symbolMeta: TerminalSymbolMetaDto | null;
  onOrderSuccess?: () => void;
};

export function useTerminalOrderTicket({
  symbol,
  exchange,
  tradeMode,
  symbolMeta,
  onOrderSuccess,
}: UseTerminalOrderTicketArgs) {
  const [side, setSide] = useState<TerminalOrderSide>("BUY");
  const [type, setType] = useState<TerminalOrderType>("LIMIT");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<TerminalOrderDto | null>(null);

  useEffect(() => {
    setSubmitState("idle");
    setSubmitMessage(null);
    setLastOrder(null);
  }, [symbol, exchange, tradeMode, side, type, quantity, price]);

  const draft = useMemo<TerminalOrderDraft>(
    () => ({
      exchange,
      symbol,
      side,
      type,
      quantity,
      price: type === "LIMIT" ? price : undefined,
      mode: tradeMode,
    }),
    [exchange, price, quantity, side, symbol, tradeMode, type],
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

  async function submitOrder() {
    if (!validation.ok) {
      setSubmitState("error");
      setSubmitMessage(validation.issues[0]?.message ?? "Order draft is not valid yet.");
      setLastOrder(null);
      return;
    }

    setSubmitState("submitting");
    setSubmitMessage(null);
    setLastOrder(null);

    try {
      const testResponse = await testTerminalOrderRequest(draft);
      if (!testResponse.ok) {
        setSubmitState("error");
        setSubmitMessage(testResponse.error.message);
        return;
      }

      const placeResponse = await placeTerminalOrderRequest(draft);
      if (!placeResponse.ok) {
        setSubmitState("error");
        setSubmitMessage(placeResponse.error.message);
        return;
      }

      setSubmitState("success");
      setLastOrder(placeResponse.order);
      setSubmitMessage(
        placeResponse.duplicated
          ? `Duplicate submit guarded. Reusing demo order ${placeResponse.order.id}.`
          : `Demo order ${placeResponse.order.id} created successfully.`,
      );
      onOrderSuccess?.();
    } catch (error: unknown) {
      setSubmitState("error");
      setSubmitMessage(error instanceof Error ? error.message : "Failed to submit terminal order.");
    }
  }

  return {
    draft,
    side,
    type,
    quantity,
    price,
    symbolMeta,
    validation,
    issuesByField,
    submitState,
    submitMessage,
    lastOrder,
    submitOrder,
    setSide,
    setType,
    setQuantity,
    setPrice,
  };
}
