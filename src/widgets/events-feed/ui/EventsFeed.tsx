"use client";

import type { EventRow } from "@/src/entities/event";

function fmtPct(x: number) {
  const n = Number(x ?? 0) || 0;
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(2)}%`;
}

export function EventsFeed({ events, loading }: { events: EventRow[]; loading: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadowSm)]">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-sm text-[var(--muted)]">
          <thead className="sticky top-0 bg-[var(--panel2)] text-sm font-medium text-[var(--muted)]">
            <tr className="text-left">
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Exch</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Signal</th>
              <th className="px-4 py-3">Δ(tf)</th>
              <th className="px-4 py-3">24h%</th>
            </tr>
          </thead>
          <tbody className="text-sm text-[var(--muted)] leading-5">
            {events.map((r, idx) => (
              <tr key={r.eventId ?? `${idx}:${r.ts}:${r.baseAsset}`} className="border-t border-[var(--border)] bg-[var(--panel2)] even:bg-[var(--zebra)] hover:bg-[var(--hover)]">
                <td className="px-4 py-3 text-xs text-[var(--muted2)]">
                  {r.eventType === "signal_change" ? "Signal" : "Score"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {(r.logoUrl || r.iconUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={(r.logoUrl || r.iconUrl) as string}
                        alt={r.baseAsset}
                        className="h-5 w-5 rounded-full"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-5 w-5 rounded-full border border-[var(--border)]" />
                    )}
                    <div className="font-medium text-[var(--text)]">{r.baseAsset}</div>
                    <div className="text-xs text-[var(--muted2)]">{r.symbol}</div>
                  </div>
                </td>
                <td className="px-4 py-3">{r.exchange}</td>
                <td className="px-4 py-3">{r.score.toFixed(2)}</td>
                <td className="px-4 py-3">{r.signal}</td>
                <td className="px-4 py-3">{fmtPct(r.changePercent)}</td>
                <td className="px-4 py-3">{fmtPct(r.change24hPercent)}</td>
              </tr>
            ))}
            {!events.length && !loading ? (
              <tr>
                <td className="p-3 text-sm opacity-70" colSpan={7}>No events yet</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
