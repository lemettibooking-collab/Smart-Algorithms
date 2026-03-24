"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTerminalScalpMarket } from "@/src/shared/api/terminal/scalp-market";
import type {
  TerminalConnectionState,
  TerminalExchange,
  TerminalMarketHealthDto,
  TerminalScalpMarketDto,
} from "@/src/shared/model/terminal/contracts";

type UseTerminalScalpMarketArgs = {
  exchange: TerminalExchange;
  symbol: string;
  enabled?: boolean;
  pollIntervalMs?: number;
};

const DEFAULT_TERMINAL_MARKET_POLL_INTERVAL_MS = 4_000;

export function useTerminalScalpMarket({
  exchange,
  symbol,
  enabled = true,
  pollIntervalMs = DEFAULT_TERMINAL_MARKET_POLL_INTERVAL_MS,
}: UseTerminalScalpMarketArgs) {
  const [market, setMarket] = useState<TerminalScalpMarketDto | null>(null);
  const [health, setHealth] = useState<TerminalMarketHealthDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [connectionState, setConnectionState] = useState<TerminalConnectionState>("idle");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [pageVisible, setPageVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
  });
  const marketRef = useRef<TerminalScalpMarketDto | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    marketRef.current = market;
  }, [market]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const handleVisibilityChange = () => {
      setPageVisible(document.visibilityState !== "hidden");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++requestIdRef.current;
      const currentMarket = marketRef.current;
      const hasCurrentMarket = Boolean(
        currentMarket && currentMarket.exchange === exchange && currentMarket.symbol === symbol,
      );

      if (hasCurrentMarket) {
        setRefreshing(true);
      } else {
        setMarket(null);
        setHealth(null);
        setLastUpdated(null);
        setLoading(true);
        setRefreshing(false);
      }

      setError(null);
      setConnectionState((current) => {
        if (hasCurrentMarket) return current;
        return current === "connected" || current === "stale" ? current : "connecting";
      });

      try {
        const response = await fetchTerminalScalpMarket({ exchange, symbol }, signal);
        if (signal?.aborted || requestId !== requestIdRef.current) return;

        if (!response.ok) {
          setMarket((current) =>
            current && current.exchange === exchange && current.symbol === symbol ? current : null,
          );
          setHealth(null);
          setError(response.error.message);
          setConnectionState("disconnected");
          return;
        }

        setMarket(response.market);
        setHealth(response.health);
        setLastUpdated(response.market.updatedAt ?? response.health.updatedAt);
        setConnectionState(response.health.connectionState);
        setError(null);
      } catch (loadError: unknown) {
        if (signal?.aborted || requestId !== requestIdRef.current) return;
        setHealth(null);
        setError(loadError instanceof Error ? loadError.message : "Failed to load terminal scalp market.");
        setConnectionState("disconnected");
      } finally {
        if (signal?.aborted || requestId !== requestIdRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [exchange, symbol],
  );

  useEffect(() => {
    if (!enabled) {
      setRefreshing(false);
      setLoading(false);
      return undefined;
    }

    if (!pageVisible) {
      setRefreshing(false);
      return undefined;
    }

    let disposed = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const runCycle = async () => {
      if (disposed) return;

      controller = new AbortController();
      await load(controller.signal);
      if (disposed) return;

      timeoutId = setTimeout(() => {
        void runCycle();
      }, pollIntervalMs);
    };

    void runCycle();

    return () => {
      disposed = true;
      if (timeoutId) clearTimeout(timeoutId);
      controller?.abort();
    };
  }, [enabled, exchange, symbol, load, pageVisible, pollIntervalMs, reloadNonce]);

  const reload = useCallback(() => {
    setReloadNonce((value) => value + 1);
  }, []);

  return {
    market,
    health,
    connectionState,
    loading,
    refreshing,
    error,
    lastUpdated,
    reload,
  };
}
