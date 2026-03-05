"use client";

import { useMemo } from "react";
import { useStreamsHealth, type UseStreamsHealthInput } from "@/src/features/status-strip/model/useStreamsHealth";

type StatusStripProps = {
  input: UseStreamsHealthInput;
  showHot?: boolean;
  showEvents?: boolean;
};

function timeLabel(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString();
}

function dotClass(status: "connected" | "connecting" | "reconnecting" | "error") {
  if (status === "connected") return "bg-emerald-400";
  if (status === "error") return "bg-rose-400";
  return "bg-amber-400";
}

function titleCase(v: string) {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export function StatusStrip({ input, showHot = true, showEvents = true }: StatusStripProps) {
  const { health } = useStreamsHealth(input);

  const rlText = useMemo(() => {
    if (!health.rateLimit?.length) return null;
    return health.rateLimit.map((x) => `${x.source} ${x.retryInSec}s`).join(" • ");
  }, [health.rateLimit]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--muted)] shadow-[var(--shadowSm)]">
      {showHot ? (
        <span className="inline-flex items-center gap-2">
          <span className={["h-2 w-2 rounded-full", dotClass(health.hot.status)].join(" ")} />
          Hot {titleCase(health.hot.status)}
        </span>
      ) : null}
      {showEvents ? (
        <span className="inline-flex items-center gap-2">
          <span className={["h-2 w-2 rounded-full", dotClass(health.events.status)].join(" ")} />
          Events {titleCase(health.events.status)}
        </span>
      ) : null}
      {health.degraded ? (
        <span className="rounded-md border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-amber-200">
          Degraded
        </span>
      ) : null}
      {rlText ? (
        <span className="rounded-md border border-rose-300/30 bg-rose-400/10 px-2 py-0.5 text-rose-200">
          RL: {rlText}
        </span>
      ) : null}
      <span className="text-[var(--muted2)]">Hot: {timeLabel(health.hot.lastMessageTs)}</span>
      <span className="text-[var(--muted2)]">Events: {timeLabel(health.events.lastMessageTs)}</span>
    </div>
  );
}
