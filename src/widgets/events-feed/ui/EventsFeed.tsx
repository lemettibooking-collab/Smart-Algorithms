"use client";

import type { EventRow } from "@/src/entities/event";

function fmtPct(x: number) {
  const n = Number(x ?? 0) || 0;
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(2)}%`;
}

export function EventsFeed({ events, loading }: { events: EventRow[]; loading: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-md shadow-sm">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-sm text-white/80">
          <thead className="sticky top-0 bg-white/5 text-sm font-medium text-white/80">
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
          <tbody className="text-sm text-white/80 leading-5">
            {events.map((r, idx) => (
              <tr key={r.eventId ?? `${idx}:${r.ts}:${r.baseAsset}`} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-4 py-3 text-xs text-white/50">
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
                      <div className="h-5 w-5 rounded-full border border-white/10" />
                    )}
                    <div className="font-medium">{r.baseAsset}</div>
                    <div className="text-xs text-white/50">{r.symbol}</div>
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
