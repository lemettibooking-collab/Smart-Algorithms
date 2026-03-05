"use client";

import Link from "next/link";
import { CandlestickChart } from "@/components/candlestick-chart";
import { PriceChart } from "@/components/price-chart";
import type { SymbolCandle, SymbolMetrics } from "@/src/entities/symbol";
import { useSymbolData } from "@/src/widgets/symbol-view/model/useSymbolData";

export function SymbolView(props: {
  symbol: string;
  initialCandles: SymbolCandle[];
  initialMetrics: SymbolMetrics;
}) {
  const { symbol, initialCandles, initialMetrics } = props;
  const {
    interval,
    setInterval,
    limit,
    setLimit,
    candles,
    metrics,
    loading,
    err,
    load,
  } = useSymbolData({
    symbol,
    initialCandles,
    initialMetrics,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[rgb(var(--bg-1))] p-4">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">{symbol}</div>
          <Link href="/hot" className="text-sm text-white/60 hover:text-white/90">
            Back to Hot
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-white/10 bg-transparent px-2 py-1 text-sm"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          >
            {["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>

          <input
            className="w-24 rounded-lg border border-white/10 bg-transparent px-2 py-1 text-sm"
            type="number"
            step="10"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            title="Klines limit"
          />

          <button
            className="rounded-lg border border-white/10 px-3 py-1 text-sm hover:bg-white/5"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>

          {err ? <span className="text-sm text-red-400">{err}</span> : null}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 p-3">
          <div className="text-xs opacity-70">ATR14</div>
          <div className="text-base font-semibold">{metrics?.atr14 ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <div className="text-xs opacity-70">Change 1h</div>
          <div className="text-base font-semibold">{metrics?.change1h ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <div className="text-xs opacity-70">Change 4h</div>
          <div className="text-base font-semibold">{metrics?.change4h ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <div className="text-xs opacity-70">Change 24h</div>
          <div className="text-base font-semibold">{metrics?.change24h ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <div className="text-xs opacity-70">Volume Spike</div>
          <div className="text-base font-semibold">{metrics?.volumeSpike ?? "—"}</div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[rgb(var(--bg-1))] p-4">
          <div className="mb-2 text-sm font-medium text-white/80">Candles</div>
          <CandlestickChart candles={candles} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-[rgb(var(--bg-1))] p-4">
          <div className="mb-2 text-sm font-medium text-white/80">Price</div>
          <PriceChart
            times={candles.map((c) => c.closeTime ?? c.openTime)}
            values={candles.map((c) => Number(c.close))}
          />
        </div>
      </div>
    </div>
  );
}
