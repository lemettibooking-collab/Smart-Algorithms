"use client";

import { useEffect, useMemo, useState } from "react";
import type { GlobalHealth, StreamHealth, StreamStatus } from "@/src/entities/health";

type SourceInput = {
  connected?: boolean;
  lastTs?: number | null;
  error?: string | null;
};

type UseStreamsHealthInput = {
  hot: SourceInput & { rateLimitedUntilTs?: number | null };
  events: SourceInput & { rateLimitedUntilTs?: number | null };
  alerts?: { degraded?: boolean; rateLimitedUntilTs?: number | null };
};

function streamStatus(connected: boolean, hasMessage: boolean, error?: string | null): StreamStatus {
  if (connected) return "connected";
  if (error) return "error";
  return hasMessage ? "reconnecting" : "connecting";
}

function streamHealth(connected: boolean, lastTs?: number | null, error?: string | null): StreamHealth {
  const hasMessage = typeof lastTs === "number" && lastTs > 0;
  return {
    status: streamStatus(connected, hasMessage, error),
    lastMessageTs: typeof lastTs === "number" ? lastTs : undefined,
    error: error ?? undefined,
  };
}

export function useStreamsHealth(input: UseStreamsHealthInput) {
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const health = useMemo<GlobalHealth>(() => {
    const rateLimit: NonNullable<GlobalHealth["rateLimit"]> = [];

    const withRetry = (source: "hot" | "events" | "alerts", untilTs?: number | null) => {
      if (typeof untilTs !== "number" || untilTs <= nowTs) return;
      rateLimit.push({
        source,
        untilTs,
        retryInSec: Math.max(1, Math.ceil((untilTs - nowTs) / 1000)),
      });
    };

    withRetry("hot", input.hot.rateLimitedUntilTs);
    withRetry("events", input.events.rateLimitedUntilTs);
    withRetry("alerts", input.alerts?.rateLimitedUntilTs);

    return {
      hot: streamHealth(
        !!input.hot.connected,
        input.hot.lastTs,
        input.hot.error
      ),
      events: streamHealth(
        !!input.events.connected,
        input.events.lastTs,
        input.events.error
      ),
      degraded: !!input.alerts?.degraded,
      rateLimit: rateLimit.length ? rateLimit : undefined,
    };
  }, [input.alerts?.degraded, input.alerts?.rateLimitedUntilTs, input.events.connected, input.events.error, input.events.lastTs, input.events.rateLimitedUntilTs, input.hot.connected, input.hot.error, input.hot.lastTs, input.hot.rateLimitedUntilTs, nowTs]);

  return { health, nowTs };
}

export type { UseStreamsHealthInput };
