"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/src/shared/api";
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
      const j = await fetchJson<AlertsResponse>(tableQuery, { cache: "no-store" });
      if (j.error) setErr(j.error);
      const nextRows = normalizeAlertRows(Array.isArray(j.data) ? j.data : []);
      setRows(nextRows);
      setSources(j.sources ?? null);

      const symbols = Array.from(new Set(nextRows.map((x) => String(x.symbol ?? "").trim().toUpperCase()).filter(Boolean))).slice(0, 50);
      if (symbols.length === 0) {
        setWallsMap({});
      } else {
        try {
          const wj = await fetchJson<WallsResponse>(`/api/walls?symbols=${encodeURIComponent(symbols.join(","))}`, { cache: "no-store" });
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
    refresh,
    clearRows,
  };
}
