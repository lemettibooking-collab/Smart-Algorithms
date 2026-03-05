"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/src/shared/api";
import { normalizeKlines, type KlinesResponse, type SymbolCandle, type SymbolMetrics, type SymbolPeriods } from "@/src/entities/symbol";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

type UseSymbolDataParams = {
  symbol: string;
  initialCandles: SymbolCandle[];
  initialMetrics: SymbolMetrics;
};

export function useSymbolData(params: UseSymbolDataParams) {
  const { symbol, initialCandles, initialMetrics } = params;

  const [interval, setInterval] = useState<string>("1h");
  const [limit, setLimit] = useState<number>(120);

  const [candles, setCandles] = useState<SymbolCandle[]>(initialCandles ?? []);
  const [metrics, setMetrics] = useState<SymbolMetrics>(initialMetrics);
  const [, setPeriods] = useState<SymbolPeriods | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams();
    p.set("symbol", symbol);
    p.set("interval", interval);
    p.set("limit", String(limit));
    return `/api/klines?${p.toString()}`;
  }, [symbol, interval, limit]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const j = await fetchJson<unknown>(apiUrl, { cache: "no-store" });
      const rec = asRecord(j);

      if (rec?.ok === true) {
        const resp = j as KlinesResponse;
        setCandles(normalizeKlines(Array.isArray(resp.candles) ? resp.candles : []));
        setMetrics(resp.metrics ?? initialMetrics);
        setPeriods(resp.periods ?? null);
        return;
      }

      if (rec && Array.isArray(rec.candles)) {
        setCandles(normalizeKlines(rec.candles));
        return;
      }

      if (Array.isArray(j)) {
        setCandles(normalizeKlines(j));
        return;
      }

      setErr(String(rec?.error ?? "Bad response"));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, initialMetrics]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    interval,
    setInterval,
    limit,
    setLimit,
    candles,
    metrics,
    loading,
    err,
    load,
  };
}
