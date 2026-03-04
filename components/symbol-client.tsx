"use client";

import { useEffect, useMemo, useState } from "react";
import type { Candle } from "@/lib/binance";
import type { SymbolMetrics } from "@/lib/metrics";
import Link from "next/link";
import { CandlestickChart } from "@/components/candlestick-chart";
import { PriceChart } from "@/components/price-chart";

type Periods = {
  "1m": { pct: number | null; from?: number | null; to?: number | null };
  "5m": { pct: number | null; from?: number | null; to?: number | null };
  "15m": { pct: number | null; from?: number | null; to?: number | null };
  "1h": { pct: number | null; from?: number | null; to?: number | null };
  "4h": { pct: number | null; from?: number | null; to?: number | null };
  "1d": { pct: number | null; from?: number | null; to?: number | null };
  "1w": { pct: number | null; from?: number | null; to?: number | null };
  "1M": { pct: number | null; from?: number | null; to?: number | null };
  "1y": { pct: number | null; from?: number | null; to?: number | null };
};

type ApiOk = {
  ok: true;
  symbol: string;
  interval: string; // <- убрали KlineInterval
  limit: number;
  candles: Candle[];
  metrics: SymbolMetrics;
  periods?: Periods;
  ts: number;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

export default function SymbolClient(props: {
  symbol: string;
  initialCandles: Candle[];
  initialMetrics: SymbolMetrics;
}) {
  const { symbol, initialCandles, initialMetrics } = props;

  const [interval, setInterval] = useState<string>("1h"); // <- string
  const [limit, setLimit] = useState<number>(120);

  const [candles, setCandles] = useState<Candle[]>(initialCandles ?? []);
  const [metrics, setMetrics] = useState<SymbolMetrics>(initialMetrics);
  const [, setPeriods] = useState<Periods | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams();
    p.set("symbol", symbol);
    p.set("interval", interval);
    p.set("limit", String(limit));
    return `/api/klines?${p.toString()}`;
  }, [symbol, interval, limit]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(apiUrl, { cache: "no-store" });
      const j = (await r.json()) as unknown;
      const rec = asRecord(j);

      // У тебя /api/klines может возвращать просто candles, без ок:true — поэтому максимально терпимо
      // 1) если форма { ok: true, candles, metrics, ... }
      if (rec?.ok === true) {
        const resp = j as ApiOk;
        setCandles(Array.isArray(resp.candles) ? resp.candles : []);
        setMetrics(resp.metrics ?? metrics);
        setPeriods(resp.periods ?? null);
        return;
      }

      // 2) если форма { candles: [...] }
      if (rec && Array.isArray(rec.candles)) {
        setCandles(rec.candles as Candle[]);
        return;
      }

      // 3) если форма — массив свечей
      if (Array.isArray(j)) {
        setCandles(j);
        return;
      }

      // 4) иначе ошибка
      const msg = String(rec?.error ?? `Bad response (${r.status})`);
      setErr(msg);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // подгружаем после маунта, чтобы данные актуализировались
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

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
            onClick={load}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>

          {err ? <span className="text-sm text-red-400">{err}</span> : null}
        </div>
      </div>

      {/* metrics */}
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

      {/* charts */}
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
