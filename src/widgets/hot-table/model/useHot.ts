"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [rateLimitedUntilTs, setRateLimitedUntilTs] = useState<number | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [intervalSec, setIntervalSec] = useState(5);

  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);
  const backoffUntilRef = useRef(0);
  const rowsRef = useRef<HotRow[]>(initialRows ?? []);
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    setSpikeModeState(loadSpikeMode());
  }, []);

  const setSpikeMode = useCallback((next: SpikeMode) => {
    setSpikeModeState(next);
    saveSpikeMode(next);
  }, []);

  const buildQuery = useCallback(() => {
    const tfSafe = sanitizeTf(tf, DEFAULT_HOT_FILTERS.tf);
    const qs = new URLSearchParams();
    qs.set("tf", tfSafe);
    qs.set("limit", exchange === "mexc" ? "300" : "50");
    qs.set("exchange", exchange);
    qs.set("minVol", String(Math.max(0, Math.floor(minVol))));
    qs.set("spikeMode", spikeMode);
    return qs;
  }, [tf, exchange, minVol, spikeMode]);

  const applyHotResponse = useCallback((json: HotResponse) => {
    if (!json?.ok) return;
    if (json.tf) setTf((prev) => sanitizeTf(json.tf, prev));
    if (json.exchange) setExchange((prev) => sanitizeExchange(json.exchange, prev));
    const data = normalizeHotRows(Array.isArray(json.data) ? json.data : []);
    setRows(data);
    setLastTs(json.ts ?? Date.now());
    setRateLimitedUntilTs(null);
    setError(null);
  }, []);

  const refresh = useCallback(async (): Promise<HotRow[]> => {
    if (inFlightRef.current) return rowsRef.current;
    if (Date.now() < backoffUntilRef.current) return rowsRef.current;

    inFlightRef.current = true;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      setLoading(true);
      const qs = buildQuery();

      const res = await fetch(`/api/hot?${qs.toString()}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      if (res.status === 429) {
        const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        const retryAfterMsRaw = Number(body?.retryAfterMs);
        const retryAfterMs = Number.isFinite(retryAfterMsRaw) && retryAfterMsRaw > 0 ? retryAfterMsRaw : 5_000;
        const until = Date.now() + retryAfterMs;
        backoffUntilRef.current = until;
        setRateLimitedUntilTs(until);
        setError(null);
        return rowsRef.current;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as HotResponse;
      if (!json?.ok) throw new Error(json?.error || "API returned ok=false");
      applyHotResponse(json);
      return normalizeHotRows(Array.isArray(json.data) ? json.data : []);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return rowsRef.current;
      setError(e instanceof Error ? e.message : "Unknown error");
      return rowsRef.current;
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [applyHotResponse, buildQuery]);

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
    if (!autoRefresh || streamConnected) return;

    const schedule = () => {
      const ms = Math.max(2, intervalSec) * 1000;
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = window.setTimeout(async () => {
        await refresh();
        schedule();
      }, ms);
    };

    schedule();
    return () => {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [autoRefresh, intervalSec, refresh, streamConnected]);

  useEffect(() => {
    if (!autoRefresh || typeof window === "undefined") return;

    const qs = buildQuery();
    qs.set("pollMs", String(Math.max(2, intervalSec) * 1000));
    const es = new EventSource(`/api/stream/hot?${qs.toString()}`);
    streamRef.current = es;

    const onHot = (ev: MessageEvent) => {
      try {
        const json = JSON.parse(ev.data) as HotResponse;
        if (!json?.ok) return;
        applyHotResponse(json);
      } catch {
        // ignore bad event payload
      }
    };

    es.addEventListener("hot", onHot as EventListener);
    es.onopen = () => {
      setStreamConnected(true);
      setError(null);
    };
    es.onerror = () => {
      setStreamConnected(false);
      es.close();
      if (streamRef.current === es) streamRef.current = null;
    };

    return () => {
      setStreamConnected(false);
      es.removeEventListener("hot", onHot as EventListener);
      es.close();
      if (streamRef.current === es) streamRef.current = null;
    };
  }, [autoRefresh, intervalSec, buildQuery, applyHotResponse]);

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
    rateLimitedUntilTs,
    streamConnected,
    autoRefresh,
    setAutoRefresh,
    intervalSec,
    setIntervalSec,
    refresh,
  };
}
