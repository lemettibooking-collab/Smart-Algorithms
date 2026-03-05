"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeAlertRows, type AlertRow, type AlertsResponse, type Wall, type WallsResponse } from "@/src/entities/alert";
import type { SignalFilter, SortBy } from "@/src/features/alerts-presets";

type UseAlertsParams = {
  enabled: boolean;
  auto: boolean;
  tf: string;
  includeCalm: boolean;
  onlyStrong: boolean;
  strongScore: number;
  minScore: number;
  limit: number;
  dedupe: boolean;
  sortBy: SortBy;
  signalFilter: SignalFilter[];
};

function errMsg(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Failed";
}

export function useAlerts(params: UseAlertsParams) {
  const {
    enabled,
    auto,
    tf,
    includeCalm,
    onlyStrong,
    strongScore,
    minScore,
    limit,
    dedupe,
    sortBy,
    signalFilter,
  } = params;

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [wallsMap, setWallsMap] = useState<Record<string, { bid?: Wall; ask?: Wall }>>({});
  const [sources, setSources] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastTs, setLastTs] = useState<number | null>(null);
  const [rateLimitedUntilTs, setRateLimitedUntilTs] = useState<number | null>(null);

  const tableQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set("tf", tf);
    p.set("includeCalm", includeCalm ? "1" : "0");
    p.set("minScore", String(onlyStrong ? strongScore : minScore));
    p.set("limit", String(limit));
    p.set("dedupe", dedupe ? "1" : "0");
    p.set("sort", sortBy);
    if (signalFilter.length) p.set("signals", signalFilter.join(","));
    return `/api/alerts?${p.toString()}`;
  }, [tf, includeCalm, onlyStrong, strongScore, minScore, limit, dedupe, sortBy, signalFilter]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(tableQuery, { cache: "no-store" });
      if (res.status === 429) {
        const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        const retryAfterMsRaw = Number(body?.retryAfterMs);
        const retryAfterMs = Number.isFinite(retryAfterMsRaw) && retryAfterMsRaw > 0 ? retryAfterMsRaw : 5_000;
        setRateLimitedUntilTs(Date.now() + retryAfterMs);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as AlertsResponse;
      if (j.error) setErr(j.error);
      const nextRows = normalizeAlertRows(Array.isArray(j.data) ? j.data : []);
      setRows(nextRows);
      setSources(j.sources ?? null);
      setLastTs(Date.now());
      setRateLimitedUntilTs(null);

      const symbols = Array.from(new Set(nextRows.map((x) => String(x.symbol ?? "").trim().toUpperCase()).filter(Boolean))).slice(0, 10);
      if (symbols.length === 0) {
        setWallsMap({});
      } else {
        try {
          const wr = await fetch(`/api/walls?symbols=${encodeURIComponent(symbols.join(","))}`, { cache: "no-store" });
          if (!wr.ok) throw new Error(`HTTP ${wr.status}`);
          const wj = (await wr.json()) as WallsResponse;
          const data = (typeof wj?.data === "object" && wj?.data !== null ? wj.data : {}) as Record<string, { bid?: Wall; ask?: Wall }>;
          setWallsMap(data);
        } catch {
          setWallsMap({});
        }
      }
    } catch (e: unknown) {
      setErr(errMsg(e));
      setRows([]);
      setWallsMap({});
      setSources(null);
    } finally {
      setLoading(false);
    }
  }, [tableQuery]);

  const clearRows = useCallback(() => {
    setRows([]);
    setWallsMap({});
    setErr(null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !auto) return;
    const id = setInterval(() => {
      refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [enabled, auto, refresh]);

  return {
    loading,
    rows,
    wallsMap,
    sources,
    err,
    lastTs,
    rateLimitedUntilTs,
    refresh,
    clearRows,
  };
}
