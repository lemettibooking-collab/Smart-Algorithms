"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchTerminalSymbolMeta } from "@/src/shared/api/terminal/get-terminal-symbol-meta";
import type { TerminalExchange, TerminalSymbolMetaDto } from "@/src/shared/model/terminal/contracts";

type UseTerminalSymbolMetaArgs = {
  exchange: TerminalExchange;
  symbol: string;
  initialSymbolMeta?: TerminalSymbolMetaDto;
};

function matchesSymbolMeta(meta: TerminalSymbolMetaDto | null | undefined, exchange: TerminalExchange, symbol: string) {
  return Boolean(meta && meta.exchange === exchange && meta.symbol === symbol);
}

export function useTerminalSymbolMeta({ exchange, symbol, initialSymbolMeta }: UseTerminalSymbolMetaArgs) {
  const [symbolMeta, setSymbolMeta] = useState<TerminalSymbolMetaDto | null>(
    matchesSymbolMeta(initialSymbolMeta, exchange, symbol) ? initialSymbolMeta ?? null : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);

      const response = await fetchTerminalSymbolMeta({ exchange, symbol }, signal);
      if (!response.ok) {
        setSymbolMeta((current) =>
          current && current.exchange === exchange && current.symbol === symbol ? current : null,
        );
        setError(response.error.message);
        setLoading(false);
        return;
      }

      setSymbolMeta(response.symbol);
      setError(null);
      setLoading(false);
    },
    [exchange, symbol],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      void load(controller.signal).catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load terminal symbol meta.");
        setLoading(false);
      });
    });

    return () => {
      controller.abort();
    };
  }, [exchange, symbol, initialSymbolMeta, load]);

  const reload = useCallback(async () => {
    await load();
  }, [load]);

  const effectiveSymbolMeta = matchesSymbolMeta(symbolMeta, exchange, symbol)
    ? symbolMeta
    : matchesSymbolMeta(initialSymbolMeta, exchange, symbol)
      ? (initialSymbolMeta ?? null)
      : null;

  return {
    symbolMeta: effectiveSymbolMeta,
    loading,
    error,
    reload,
  };
}
