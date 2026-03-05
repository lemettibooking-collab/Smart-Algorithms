"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/src/shared/api";
import { safeJsonParse } from "@/src/shared/lib";
import { getEventStableKey, getEventTs, isEventRow, type EventRow, type EventsResponse } from "@/src/entities/event";

const LS_EVENTS_KEY = "alerts:eventsCache:v1";
const LS_EVENTS_META_KEY = "alerts:eventsCacheMeta:v1";

export type UseEventsFeedParams = {
  enabled: boolean;
  auto: boolean;
  tf: string;
  includeCalm: boolean;
  onlyStrong: boolean;
  strongScore: number;
  minScore: number;
  sortBy: "score" | "change" | "change24h" | "spike";
  signalFilter: string[];
  eventsLimit: number;
  scoreJump: number;
  cooldownSec: number;
};

function eventsStorageKeys(tf: string) {
  return {
    eventsKey: `${LS_EVENTS_KEY}:${tf}`,
    metaKey: `${LS_EVENTS_META_KEY}:${tf}`,
  };
}

function errMsg(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Failed";
}

export function useEventsFeed(params: UseEventsFeedParams) {
  const {
    enabled,
    auto,
    tf,
    includeCalm,
    onlyStrong,
    strongScore,
    minScore,
    sortBy,
    signalFilter,
    eventsLimit,
    scoreJump,
    cooldownSec,
  } = params;

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sources, setSources] = useState<unknown>(null);
  const [eventsStreamLive, setEventsStreamLive] = useState(false);

  const eventsRef = useRef<EventRow[]>([]);
  const seenEventKeysRef = useRef<Set<string>>(new Set());

  const eventsQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set("tf", tf);
    p.set("includeCalm", includeCalm ? "1" : "0");
    p.set("minScore", String(onlyStrong ? strongScore : minScore));
    p.set("sort", sortBy);
    if (signalFilter.length) p.set("signals", signalFilter.join(","));

    p.set("limit", String(eventsLimit));
    p.set("scoreJump", String(scoreJump));
    p.set("cooldownSec", String(cooldownSec));
    p.set("baseLimit", "220");

    return `/api/alerts/events?${p.toString()}`;
  }, [tf, includeCalm, onlyStrong, strongScore, minScore, sortBy, signalFilter, eventsLimit, scoreJump, cooldownSec]);

  const eventsStreamBaseQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set("tf", tf);
    p.set("includeCalm", includeCalm ? "1" : "0");
    p.set("minScore", String(onlyStrong ? strongScore : minScore));
    if (signalFilter.length) p.set("signals", signalFilter.join(","));
    p.set("limit", String(eventsLimit));
    p.set("pollMs", "2000");
    return p;
  }, [tf, includeCalm, onlyStrong, strongScore, minScore, signalFilter, eventsLimit]);

  const rememberEventKeys = useCallback((rows: EventRow[]) => {
    const nextSet = new Set<string>();
    for (const ev of rows) {
      const k = getEventStableKey(ev);
      if (nextSet.has(k)) continue;
      nextSet.add(k);
      if (nextSet.size >= 500) break;
    }
    seenEventKeysRef.current = nextSet;
  }, []);

  const mergeIncomingEvents = useCallback((incomingRows: EventRow[]) => {
    setEvents((prev) => {
      const byKey = new Map<string, EventRow>();
      const out: EventRow[] = [];
      for (const ev of incomingRows) {
        if (!isEventRow(ev)) continue;
        const k = getEventStableKey(ev);
        if (byKey.has(k)) continue;
        byKey.set(k, ev);
        out.push(ev);
      }
      for (const ev of prev) {
        const k = getEventStableKey(ev);
        if (byKey.has(k)) continue;
        byKey.set(k, ev);
        out.push(ev);
      }
      const trimmed = out.slice(0, eventsLimit);
      rememberEventKeys(trimmed);

      if (typeof window !== "undefined") {
        try {
          const { eventsKey, metaKey } = eventsStorageKeys(tf);
          window.localStorage.setItem(eventsKey, JSON.stringify(trimmed));
          window.localStorage.setItem(metaKey, JSON.stringify({ tf, updatedAt: Date.now() }));
        } catch {
          // ignore
        }
      }

      return trimmed;
    });
  }, [eventsLimit, rememberEventKeys, tf]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const j = await fetchJson<EventsResponse>(eventsQuery, { cache: "no-store" });
      if (j.error) setErr(j.error);
      setSources(j.sources ?? null);

      const incoming = Array.isArray(j.data) ? j.data : [];
      mergeIncomingEvents(incoming);
    } catch (e: unknown) {
      setErr(errMsg(e));
      setSources(null);
    } finally {
      setLoading(false);
    }
  }, [eventsQuery, mergeIncomingEvents]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    seenEventKeysRef.current = new Set();
    if (typeof window !== "undefined") {
      const { eventsKey, metaKey } = eventsStorageKeys(tf);
      window.localStorage.removeItem(eventsKey);
      window.localStorage.removeItem(metaKey);
    }
  }, [tf]);

  useEffect(() => {
    if (!enabled) {
      setEventsStreamLive(false);
      return;
    }
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      setEventsStreamLive(false);
      return;
    }

    const latestTs = eventsRef.current.reduce((max, ev) => Math.max(max, getEventTs(ev)), 0);
    const query = new URLSearchParams(eventsStreamBaseQuery);
    query.set("since", String(latestTs || Date.now()));

    const es = new EventSource(`/api/stream/events?${query.toString()}`);
    let stopped = false;

    es.onopen = () => {
      if (!stopped) setEventsStreamLive(true);
    };

    const onEvent = (e: MessageEvent) => {
      if (stopped) return;
      try {
        const parsed: unknown = JSON.parse(e.data);
        if (!isEventRow(parsed)) return;
        const key = getEventStableKey(parsed);
        if (seenEventKeysRef.current.has(key)) return;
        mergeIncomingEvents([parsed]);
      } catch {
        // ignore
      }
    };
    es.addEventListener("event", onEvent as EventListener);

    es.onerror = () => {
      if (stopped) return;
      setEventsStreamLive(false);
      es.close();
    };

    return () => {
      stopped = true;
      setEventsStreamLive(false);
      es.removeEventListener("event", onEvent as EventListener);
      es.close();
    };
  }, [enabled, eventsStreamBaseQuery, mergeIncomingEvents]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window !== "undefined") {
      const { eventsKey, metaKey } = eventsStorageKeys(tf);
      const raw = window.localStorage.getItem(eventsKey);
      if (raw) {
        try {
          const parsed = safeJsonParse<unknown>(raw, null);
          if (Array.isArray(parsed)) {
            const valid = parsed.filter(isEventRow).slice(0, eventsLimit);
            if (valid.length > 0) {
              setEvents(valid);
            } else {
              window.localStorage.removeItem(eventsKey);
              window.localStorage.removeItem(metaKey);
            }
          } else {
            window.localStorage.removeItem(eventsKey);
            window.localStorage.removeItem(metaKey);
          }
        } catch {
          window.localStorage.removeItem(eventsKey);
          window.localStorage.removeItem(metaKey);
        }
      }
    }
    loadEvents();
  }, [enabled, eventsLimit, loadEvents, tf]);

  useEffect(() => {
    if (!enabled || !auto) return;
    if (eventsStreamLive) return;
    const id = setInterval(() => {
      loadEvents();
    }, 5000);
    return () => clearInterval(id);
  }, [auto, enabled, eventsStreamLive, loadEvents]);

  useEffect(() => {
    eventsRef.current = events;
    rememberEventKeys(events);
  }, [events, rememberEventKeys]);

  return {
    events,
    loading,
    err,
    sources,
    refresh: loadEvents,
    clearEvents,
  };
}
