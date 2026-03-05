"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  type CandlestickData,
  type HistogramData,
  type LineData,
  type UTCTimestamp,
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
} from "lightweight-charts";

export type TerminalChartCandle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

function toEpochSec(msOrSec: number) {
  const n = Number(msOrSec);
  if (!Number.isFinite(n) || n <= 0) return 0 as UTCTimestamp;
  return (n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)) as UTCTimestamp;
}

function isValidCandle(c: TerminalChartCandle) {
  return Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close);
}

function computeSMA(rows: TerminalChartCandle[], period: number): LineData[] {
  if (!rows.length || period <= 1) return [];
  const out: LineData[] = [];
  let sum = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const close = Number(rows[i]?.close);
    if (!Number.isFinite(close)) continue;
    sum += close;
    if (i >= period) {
      const prev = Number(rows[i - period]?.close);
      if (Number.isFinite(prev)) sum -= prev;
    }
    if (i >= period - 1) {
      out.push({
        time: toEpochSec(rows[i].openTime),
        value: sum / period,
      });
    }
  }
  return out;
}

export function TerminalChart({
  candles,
  loading,
  showMA50 = true,
  showMA100 = true,
  showMA200 = true,
}: {
  candles: TerminalChartCandle[];
  loading?: boolean;
  showMA50?: boolean;
  showMA100?: boolean;
  showMA200?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const series = useMemo(() => {
    const rows = (candles ?? []).filter(isValidCandle);
    const candleData: CandlestickData[] = rows.map((c) => ({
      time: toEpochSec(c.openTime),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }));
    const volumeData: HistogramData[] = rows.map((c) => ({
      time: toEpochSec(c.openTime),
      value: Number.isFinite(c.volume) ? Number(c.volume) : 0,
      color: c.close >= c.open ? "rgba(16, 185, 129, 0.45)" : "rgba(244, 63, 94, 0.45)",
    }));
    const ma50Data = computeSMA(rows, 50);
    const ma100Data = computeSMA(rows, 100);
    const ma200Data = computeSMA(rows, 200);
    return { candleData, volumeData, ma50Data, ma100Data, ma200Data };
  }, [candles]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "rgba(2, 6, 23, 0)" },
        textColor: "rgba(226, 232, 240, 0.75)",
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.08)" },
        horzLines: { color: "rgba(148, 163, 184, 0.08)" },
      },
      crosshair: {
        vertLine: { color: "rgba(148, 163, 184, 0.5)" },
        horzLine: { color: "rgba(148, 163, 184, 0.5)" },
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.2)",
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.2)",
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });
    candleSeries.setData(series.candleData);

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.78,
        bottom: 0,
      },
    });
    volumeSeries.setData(series.volumeData);

    const ma50Series = chart.addSeries(LineSeries, {
      color: "rgba(56, 189, 248, 0.9)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ma50Series.setData(showMA50 ? series.ma50Data : []);

    const ma100Series = chart.addSeries(LineSeries, {
      color: "rgba(251, 191, 36, 0.9)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ma100Series.setData(showMA100 ? series.ma100Data : []);

    const ma200Series = chart.addSeries(LineSeries, {
      color: "rgba(167, 139, 250, 0.9)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ma200Series.setData(showMA200 ? series.ma200Data : []);

    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [series.candleData, series.ma100Data, series.ma200Data, series.ma50Data, series.volumeData, showMA100, showMA200, showMA50]);

  return (
    <div className="relative h-[320px] w-full overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
      {loading ? <div className="absolute inset-0 animate-pulse bg-slate-900/25" /> : null}
      <div ref={rootRef} className="h-full w-full" />
    </div>
  );
}
