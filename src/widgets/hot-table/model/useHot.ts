"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/src/shared/api";
import { type Exchange, type HotResponse, type HotRow, type HotTf, normalizeHotRows, type SpikeMode } from "@/src/entities/hot";
import { DEFAULT_HOT_FILTERS, loadSpikeMode, sanitizeExchange, sanitizeTf, saveSpikeMode } from "@/src/features/hot-filters";

type UseHotParams = {
  initialRows: HotRow[];
  initialTf?: HotTf;
};

export function useHot(params: UseHotParams) {
  const { initialRows, initialTf } = params;

  const [rows, setRows] = useState<HotRow[]>(initialRows ?? []);
  const [tf, setTf] = useState<HotTf>(() => sanitizeTf(initialTf ?? DEFAULT_HOT_FILTERS.tf, DEFAULT_HOT_FILTERS.tf));
  const [exchange, setExchange] = useState<Exchange>(DEFAULT_HOT_FILTERS.exchange);
  const [spikeMode, setSpikeModeState] = useState<SpikeMode>(DEFAULT_HOT_FILTERS.spikeMode);
  const [minVol, setMinVol] = useState<number>(DEFAULT_HOT_FILTERS.minVol);

  const [loading, setLoading] = useState(false);
  const [lastTs, setLastTs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [intervalSec, setIntervalSec] = useState(5);

  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    setSpikeModeState(loadSpikeMode());
  }, []);

  const setSpikeMode = useCallback((next: SpikeMode) => {
    setSpikeModeState(next);
    saveSpikeMode(next);
  }, []);

  const refresh = useCallback(async (): Promise<HotRow[]> => {
    if (inFlightRef.current) return rows;

    inFlightRef.current = true;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      setLoading(true);
      setError(null);

      const tfSafe = sanitizeTf(tf, DEFAULT_HOT_FILTERS.tf);
      const qs = new URLSearchParams();
      qs.set("tf", tfSafe);
      qs.set("limit", exchange === "mexc" ? "300" : "50");
      qs.set("exchange", exchange);
      qs.set("minVol", String(Math.max(0, Math.floor(minVol))));
      qs.set("spikeMode", spikeMode);

      const json = await fetchJson<HotResponse>(`/api/hot?${qs.toString()}`, {
        cache: "no-store",
        signal: ac.signal,
      });

      if (!json?.ok) throw new Error(json?.error || "API returned ok=false");

      if (json.tf) setTf((prev) => sanitizeTf(json.tf, prev));
      if (json.exchange) setExchange((prev) => sanitizeExchange(json.exchange, prev));

      const data = normalizeHotRows(Array.isArray(json.data) ? json.data : []);
      setRows(data);
      setLastTs(json.ts ?? Date.now());
      return data;
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return rows;
      setError(e instanceof Error ? e.message : "Unknown error");
      return rows;
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [rows, tf, exchange, minVol, spikeMode]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const hasInitial = Array.isArray(initialRows) && initialRows.length > 0;
    const delayMs = hasInitial ? 600 : 0;

    const id = window.setTimeout(() => {
      void refresh();
    }, delayMs);
    return () => window.clearTimeout(id);
  }, [initialRows, refresh]);

  useEffect(() => {
    if (!mountedRef.current) return;
    void refresh();
  }, [tf, exchange, minVol, spikeMode, refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    let stopped = false;

    const loop = async () => {
      while (!stopped) {
        const ms = Math.max(2, intervalSec) * 1000;
        await new Promise((r) => setTimeout(r, ms));
        if (stopped) break;
        await refresh();
      }
    };

    void loop();
    return () => {
      stopped = true;
    };
  }, [autoRefresh, intervalSec, refresh]);

  return {
    rows,
    setRows,
    tf,
    setTf,
    exchange,
    setExchange,
    spikeMode,
    setSpikeMode,
    minVol,
    setMinVol,
    loading,
    lastTs,
    error,
    autoRefresh,
    setAutoRefresh,
    intervalSec,
    setIntervalSec,
    refresh,
  };
}
