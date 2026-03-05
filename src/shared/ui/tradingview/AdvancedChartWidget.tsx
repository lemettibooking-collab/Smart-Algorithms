"use client";

import { useEffect, useMemo, useRef } from "react";

type TvExchange = "binance" | "mexc" | string;

function mapTvSymbol(symbol: string, exchange?: TvExchange) {
  const clean = String(symbol ?? "").trim().toUpperCase();
  if (!clean) return "BINANCE:BTCUSDT";
  const ex = String(exchange ?? "binance").trim().toLowerCase();
  if (ex === "binance") return `BINANCE:${clean}`;
  return `BINANCE:${clean}`;
}

export function AdvancedChartWidget({
  symbol,
  exchange = "binance",
  interval = "240",
  locale = "en",
}: {
  symbol: string;
  exchange?: TvExchange;
  interval?: string;
  locale?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tvSymbol = useMemo(() => mapTvSymbol(symbol, exchange), [exchange, symbol]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";

    const widgetHost = document.createElement("div");
    widgetHost.className = "tradingview-widget-container__widget h-full w-full";
    el.appendChild(widgetHost);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval,
      timezone: "exchange",
      theme: "dark",
      style: "3",
      locale,
      allow_symbol_change: false,
      withdateranges: true,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      save_image: false,
      calendar: false,
      backgroundColor: "rgba(2, 6, 23, 0)",
      details: false,
      hotlist: false,
      studies: [],
      support_host: "https://www.tradingview.com",
    });
    el.appendChild(script);

    return () => {
      el.innerHTML = "";
    };
  }, [interval, locale, tvSymbol]);

  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
      <div ref={containerRef} className="tradingview-widget-container h-full w-full" />
    </div>
  );
}
