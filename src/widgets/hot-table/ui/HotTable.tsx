"use client";

import { useMemo, useState } from "react";
import type { Exchange, HotRow } from "@/src/entities/hot";
import Sparkline from "@/components/sparkline";

type HotRowUi = HotRow & {
  newListing?: boolean | string;
  spikeCandles?: number;
  spikeNeed?: number;
  spikeMode?: "pulse" | "scalp";
  source?: "klines" | "fallback";
  exchange?: Exchange;
  baseAsset?: string | null;
  changeApprox?: boolean;
};

function baseAssetFromSymbol(pair: string) {
  const s = String(pair ?? "").toUpperCase();
  const quotes = ["USDT", "BUSD", "USDC", "FDUSD", "TUSD", "BTC", "ETH", "BNB", "EUR", "TRY"];
  for (const q of quotes) {
    if (s.endsWith(q) && s.length > q.length) return s.slice(0, -q.length);
  }
  return s;
}

function trimZeros(s: string) {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

function fmtPrice(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";

  let out: string;
  if (n >= 1000) out = n.toFixed(2);
  else if (n >= 1) out = n.toFixed(4);
  else if (n >= 0.01) out = n.toFixed(6);
  else if (n >= 0.0001) out = n.toFixed(8);
  else out = n.toFixed(10);

  return trimZeros(out);
}

function fmtPct(n: number) {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtSpike(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}x`;
}

function scoreBarWidth(score: number) {
  const s = Number.isFinite(score) ? score : 0;
  const pct = Math.max(0, Math.min(10, s)) / 10;
  return `${Math.round(pct * 100)}%`;
}

function scoreGlowClass(score: number) {
  const s = Number.isFinite(score) ? score : 0;
  if (s >= 8) return "bg-emerald-400/20 shadow-[0_0_16px_rgba(52,211,153,0.14)]";
  if (s >= 6) return "bg-sky-400/20 shadow-[0_0_16px_rgba(56,189,248,0.12)]";
  if (s >= 4) return "bg-amber-400/20 shadow-[0_0_16px_rgba(251,191,36,0.10)]";
  return "bg-white/10";
}

function signalBadgeClass(signal: string) {
  switch (signal) {
    case "Breakout":
      return "border-emerald-400/45 bg-emerald-400/14 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.18)]";
    case "Big Move":
      return "border-green-400/45 bg-green-400/14 text-green-200 shadow-[0_0_16px_rgba(74,222,128,0.16)]";
    case "Reversal Up":
      return "border-teal-400/45 bg-teal-400/14 text-teal-200 shadow-[0_0_16px_rgba(45,212,191,0.16)]";
    case "Reversal Down":
      return "border-fuchsia-400/45 bg-fuchsia-400/14 text-fuchsia-200 shadow-[0_0_16px_rgba(232,121,249,0.14)]";
    case "Dump":
      return "border-rose-400/45 bg-rose-400/14 text-rose-200 shadow-[0_0_16px_rgba(251,113,133,0.14)]";
    case "Whale Activity":
      return "border-amber-400/55 bg-amber-400/14 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.14)]";
    case "Watch":
      return "border-sky-400/55 bg-sky-400/14 text-sky-200 shadow-[0_0_16px_rgba(56,189,248,0.14)]";
    case "Calm":
      return "border-white/10 bg-white/5 text-white/65";
    default:
      return "border-white/10 bg-white/5 text-white/65";
  }
}

function signalBadgeClassWithSource(signal: string, source?: "klines" | "fallback") {
  const base = signalBadgeClass(signal);
  return source === "fallback" ? `${base} opacity-80` : base;
}

function rowTintClass(signal: string) {
  switch (signal) {
    case "Dump":
      return "bg-rose-400/5";
    case "Breakout":
    case "Big Move":
      return "bg-emerald-400/5";
    default:
      return "";
  }
}

function intervalFromChangeLabel(changeLabel: string) {
  const s = String(changeLabel ?? "").trim();
  if (s === "24h %") return "15m";
  if (s.startsWith("Δ ")) return s.slice(2).trim();
  return "15m";
}

function CoinLogo({
  symbol,
  logoUrl,
  iconUrl,
  baseAsset,
}: {
  symbol: string;
  logoUrl?: string | null;
  iconUrl?: string | null;
  baseAsset?: string | null;
}) {
  const base = (baseAsset ?? baseAssetFromSymbol(symbol)).toUpperCase();
  const cacheKey = `coinlogo:url:${base}`;

  const candidates = useMemo(() => {
    return [
      (typeof logoUrl === "string" && logoUrl.trim() ? logoUrl.trim() : ""),
      (typeof iconUrl === "string" && iconUrl.trim() ? iconUrl.trim() : ""),
      `https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`,
      `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/${base.toLowerCase()}.png`,
      `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${base.toLowerCase()}.png`,
    ].filter(Boolean);
  }, [logoUrl, iconUrl, base]);

  const [idx, setIdx] = useState(0);
  const sources = useMemo(() => {
    let cached = "";
    try {
      const c = localStorage.getItem(cacheKey);
      cached = c && c.startsWith("http") ? c : "";
    } catch {
      cached = "";
    }

    if (!cached) return candidates;
    return [cached, ...candidates.filter((x) => x !== cached)];
  }, [cacheKey, candidates]);
  const safeIdx = Math.max(0, Math.min(idx, Math.max(0, sources.length - 1)));
  const src = sources[safeIdx] || "";

  const onLoad = () => {
    if (!src) return;
    try {
      localStorage.setItem(cacheKey, src);
    } catch {
      // ignore
    }
  };

  const onError = () => {
    const next = safeIdx + 1;
    setIdx(next);

    const nextUrl = sources[next] || "";
    if (nextUrl) {
      return;
    }

    try {
      localStorage.removeItem(cacheKey);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white/5">
      <div className="pointer-events-none absolute -top-3 left-2 h-6 w-6 rounded-full bg-white/10 blur-md" />
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={base}
          className="relative z-10 h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={onLoad}
          onError={onError}
        />
      ) : (
        <div className="relative z-10 flex h-full w-full items-center justify-center">
          <span className="text-xs font-semibold text-white/70">{base.slice(0, 1)}</span>
        </div>
      )}
    </div>
  );
}

export function HotTable({
  rows,
  changeLabel,
  exchange = "binance",
  onRowClick,
}: {
  rows: HotRow[];
  changeLabel: string;
  exchange?: Exchange;
  onRowClick?: (row: HotRow) => void;
}) {
  const isTicker = changeLabel === "24h %";
  const trendInterval = intervalFromChangeLabel(changeLabel);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[rgb(var(--bg-1))]">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm text-white/80">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[rgb(var(--bg-1))]">
              <th className="px-3 py-3 text-left text-xs font-semibold text-white/60">Score</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-white/60">Symbol</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-white/60">Trend</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-white/60">Price</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-white/60">{changeLabel}</th>
              {!isTicker ? (
                <th className="px-3 py-3 text-right text-xs font-semibold text-white/60">24h %</th>
              ) : null}
              <th className="px-3 py-3 text-right text-xs font-semibold text-white/60">Volume (24h)</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-white/60">MCap</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-white/60">Vol spike</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-white/60">Signal</th>
            </tr>
            <tr>
              <td colSpan={isTicker ? 9 : 10} className="h-px bg-white/10" />
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const row = r as HotRowUi;
              const ch = Number(row.changePercent ?? 0);
              const ch24 = Number(row.change24hPercent ?? 0);
              const isNewListing = row.newListing === true;
              const spikeCandles = Number(row.spikeCandles ?? 0);
              const spikeNeed = Number(row.spikeNeed ?? 0);
              const spikeModeLabel = row.spikeMode === "scalp" ? "Scalp" : "Pulse";

              const rowExchange = row.exchange ?? exchange;
              const baseAsset = row.baseAsset ?? null;

              return (
                <tr
                  key={row.symbol}
                  onClick={() => onRowClick?.(r)}
                  className={[
                    "border-t border-white/5 hover:bg-white/5 transition-colors",
                    onRowClick ? "cursor-pointer" : "",
                    rowTintClass(row.signal),
                  ].join(" ")}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="relative h-7 w-16 overflow-hidden rounded-full border border-white/10 bg-white/5">
                        <div
                          className={["absolute inset-y-0 left-0", scoreGlowClass(row.score ?? 0)].join(" ")}
                          style={{ width: scoreBarWidth(row.score ?? 0) }}
                        />
                        <div className="relative z-10 flex h-full items-center justify-center text-[11px] font-semibold text-white/80 tabular-nums">
                          {Number(row.score ?? 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <CoinLogo
                        symbol={row.symbol}
                        logoUrl={row.logoUrl}
                        iconUrl={row.iconUrl}
                        baseAsset={baseAsset}
                      />
                      <div className="min-w-0">
                        <div className="relative inline-flex items-center">
                          <span className="font-medium text-white/90 leading-tight">{row.symbol}</span>
                          {isNewListing ? (
                            <span
                              className="ml-1 inline-flex rounded border border-amber-400/45 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200"
                              title={`New listing / мало свечей: ${spikeCandles}/${spikeNeed} (${spikeModeLabel})`}
                            >
                              NEW
                            </span>
                          ) : null}
                          {row.source === "fallback" ? (
                            <span
                              className="absolute -top-0.5 -right-3.5 flex h-2 w-2 items-center justify-center rounded-full bg-white/5 text-[8px] font-semibold text-white/40"
                              title="Fallback: candle data unavailable (ticker-based approximation)"
                            >
                              i
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <Sparkline symbol={row.symbol} interval={trendInterval} exchange={rowExchange} />
                  </td>

                  <td className="px-3 py-3 text-right tabular-nums text-white/90">${fmtPrice(row.price)}</td>

                  <td
                    className={[
                      "px-3 py-3 text-right tabular-nums",
                      ch > 0 ? "text-emerald-400" : ch < 0 ? "text-rose-400" : "text-white/70",
                    ].join(" ")}
                    title={row.changeApprox ? "Approximation (fallback when klines unavailable)" : "Exact (klines + live price)"}
                  >
                    {fmtPct(ch)}
                  </td>

                  {!isTicker ? (
                    <td
                      className={[
                        "px-3 py-3 text-right tabular-nums",
                        ch24 > 0 ? "text-emerald-400" : ch24 < 0 ? "text-rose-400" : "text-white/70",
                      ].join(" ")}
                    >
                      {fmtPct(ch24)}
                    </td>
                  ) : null}

                  <td className="px-3 py-3 text-right tabular-nums text-white/70">{row.volume}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-white/70">{row.marketCap ?? "—"}</td>
                  <td
                    className="px-3 py-3 text-right tabular-nums text-white/70"
                    title={
                      row.volSpike == null && isNewListing
                        ? `Not enough candles: ${spikeCandles}/${spikeNeed}`
                        : undefined
                    }
                  >
                    {fmtSpike(row.volSpike)}
                  </td>

                  <td className="px-3 py-3">
                    <span
                      className={[
                        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-medium backdrop-blur",
                        "transition-shadow hover:shadow-[0_0_22px_rgba(255,255,255,0.06)]",
                        signalBadgeClassWithSource(row.signal, row.source),
                      ].join(" ")}
                      title={row.source === "fallback" ? "Fallback (no candle data)" : undefined}
                    >
                      {row.signal}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pointer-events-none h-6 bg-gradient-to-b from-transparent to-black/10" />
    </div>
  );
}
