"use client";

import { useMemo } from "react";
import type { AlertRow, Wall } from "@/src/entities/alert";

function fmtPct(x: number) {
  const n = Number(x ?? 0) || 0;
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(2)}%`;
}

function fmtPrice(x: number) {
  const n = Number(x ?? 0) || 0;
  if (n === 0) return "0";
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toPrecision(4);
}

function fmtCompact(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function BinanceMiniIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d="M12 2l3.5 3.5L12 9 8.5 5.5 12 2zm6.5 6.5L22 12l-3.5 3.5L15 12l3.5-3.5zM12 15l3.5 3.5L12 22l-3.5-3.5L12 15zM2 12l3.5-3.5L9 12l-3.5 3.5L2 12zm10-4l4 4-4 4-4-4 4-4z" />
    </svg>
  );
}

export function AlertsTable({
  rows,
  wallsMap,
  loading,
}: {
  rows: AlertRow[];
  wallsMap: Record<string, { bid?: Wall; ask?: Wall }>;
  loading: boolean;
}) {
  const renderedRows = useMemo(() => rows, [rows]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-md shadow-sm">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-sm text-white/80">
          <thead className="sticky top-0 bg-white/5 text-sm font-medium text-white/80">
            <tr className="text-left">
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Exch</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Δ(tf)</th>
              <th className="px-4 py-3">24h%</th>
              <th className="px-4 py-3">Vol 24h</th>
              <th className="px-4 py-3">Densities</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Signal</th>
              <th className="px-4 py-3">VolSpike</th>
            </tr>
          </thead>
          <tbody className="text-sm text-white/80 leading-5">
            {renderedRows.map((r) => (
              <tr key={r.id ?? `${r.baseAsset}:${r.exchange}:${r.symbol}`} className="border-t border-white/5 hover:bg-white/5">
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
                <td className="px-4 py-3">{fmtPrice(r.price)}</td>
                <td className="px-4 py-3">{fmtPct(r.changePercent)}</td>
                <td className="px-4 py-3">{fmtPct(r.change24hPercent)}</td>
                <td className="px-4 py-3">{fmtCompact(r.quoteVol24h)}</td>
                <td className="px-4 py-3 text-xs">
                  {(() => {
                    const w = wallsMap[r.symbol];
                    const badge = (status: Wall["status"]) => {
                      if (status === "NEW") return "rounded border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300";
                      if (status === "EATING") return "rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300";
                      if (status === "REMOVED") return "rounded border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300";
                      return "rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70";
                    };
                    if (!w?.bid && !w?.ask) return <span className="text-white/50">—</span>;
                    return (
                      <div className="relative space-y-1 pl-6">
                        <span
                          className="absolute left-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded border border-white/10 bg-white/5"
                          title="Order book walls from Binance"
                        >
                          <BinanceMiniIcon className="h-3 w-3 text-yellow-400/90" />
                        </span>
                        {w.bid ? (
                          <div className="flex items-center gap-1">
                            <span>BID {fmtCompact(w.bid.notional)} @ -{w.bid.distancePct.toFixed(2)}%</span>
                            <span className={badge(w.bid.status)}>{w.bid.status}</span>
                          </div>
                        ) : null}
                        {w.ask ? (
                          <div className="flex items-center gap-1">
                            <span>ASK {fmtCompact(w.ask.notional)} @ +{w.ask.distancePct.toFixed(2)}%</span>
                            <span className={badge(w.ask.status)}>{w.ask.status}</span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">{(r.score ?? 0).toFixed(2)}</td>
                <td className="px-4 py-3">{r.signal}</td>
                <td className="px-4 py-3">{r.volSpike == null ? "—" : `${r.volSpike.toFixed(2)}x`}</td>
              </tr>
            ))}
            {!renderedRows.length && !loading ? (
              <tr>
                <td className="p-3 text-sm opacity-70" colSpan={10}>No data</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
