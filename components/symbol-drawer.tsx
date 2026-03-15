"use client";

import Image from "next/image";
import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { AdvancedChartWidget } from "@/src/shared/ui";

type TF = "24h" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M" | "1y";

const QUOTE_ASSETS = ["USDT", "USDC", "FDUSD", "BUSD", "BTC", "ETH", "BNB", "EUR", "TRY"] as const;

function toTvInterval(tf: string): string {
    const value = String(tf ?? "").trim();
    const lower = value.toLowerCase();
    if (lower === "1m") return "1";
    if (lower === "3m") return "3";
    if (lower === "5m") return "5";
    if (lower === "15m") return "15";
    if (lower === "30m") return "30";
    if (lower === "1h") return "60";
    if (lower === "2h") return "120";
    if (lower === "3h") return "180";
    if (lower === "4h") return "240";
    if (lower === "6h") return "360";
    if (lower === "12h") return "720";
    if (lower === "1d") return "D";
    if (lower === "24h" || lower === "24h (ticker)") return "D";
    if (lower === "1w") return "W";
    if (value === "1M" || lower === "1mo") return "M";
    return "240";
}

function formatSpotPairForExchange(symbol: string) {
    const clean = String(symbol ?? "").trim().toUpperCase();
    if (!clean) return null;
    for (const quote of QUOTE_ASSETS) {
        if (clean.endsWith(quote) && clean.length > quote.length) {
            return `${clean.slice(0, -quote.length)}_${quote}`;
        }
    }
    return null;
}

function buildExchangeTradeUrl(exchange: string | undefined, symbol: string) {
    const pair = formatSpotPairForExchange(symbol);
    if (!pair) return null;
    const ex = String(exchange ?? "").trim().toLowerCase();
    if (ex === "mexc") return `https://www.mexc.com/exchange/${pair}`;
    if (ex === "binance") return `https://www.binance.com/en/trade/${pair}`;
    return null;
}

function ExchangeTradeButton({ exchange, symbol }: { exchange?: string; symbol: string }) {
    const href = buildExchangeTradeUrl(exchange, symbol);
    const ex = String(exchange ?? "").trim().toLowerCase();
    if (!href || (ex !== "mexc" && ex !== "binance")) return null;

    const isMexc = ex === "mexc";

    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Open on ${isMexc ? "MEXC" : "Binance"}`}
            title={`Open on ${isMexc ? "MEXC" : "Binance"}`}
            className={[
                "group inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all duration-150",
                "bg-[var(--panel2)] shadow-[0_8px_18px_rgba(15,23,42,0.08)] hover:-translate-y-px hover:bg-[var(--hover)] active:translate-y-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel)]",
                isMexc
                    ? "border-emerald-200/80 focus-visible:ring-emerald-400 dark:border-emerald-400/25 dark:bg-[linear-gradient(180deg,rgba(8,20,22,0.96),rgba(7,17,18,0.88))] dark:hover:border-emerald-300/45 dark:hover:bg-[linear-gradient(180deg,rgba(10,30,32,0.98),rgba(8,20,22,0.92))]"
                    : "border-amber-200/80 focus-visible:ring-amber-400 dark:border-amber-400/25 dark:bg-[linear-gradient(180deg,rgba(24,20,10,0.96),rgba(18,15,8,0.88))] dark:hover:border-amber-300/45 dark:hover:bg-[linear-gradient(180deg,rgba(30,24,12,0.98),rgba(20,16,8,0.92))]",
            ].join(" ")}
        >
            <span className="flex h-4 items-center transition-transform duration-150 group-hover:scale-[1.04]">
                <Image
                    src={isMexc ? "/exchanges/mexc-mark.svg" : "/exchanges/binance-mark.svg"}
                    alt=""
                    aria-hidden="true"
                    width={16}
                    height={16}
                    className="h-4 w-4"
                />
            </span>
            <span className="sr-only">{isMexc ? "Open on MEXC" : "Open on Binance"}</span>
        </a>
    );
}

export type HotSymbol = {
    symbol: string;
    price: number;

    changePercent: number;
    change24hPercent: number;
    changeApprox?: boolean;

    volume: string;
    volumeRaw?: number;

    volSpike: number | null;
    score: number;
    signal: string;

    source?: "klines" | "fallback";
    exchange?: "binance" | "mexc" | string;

    marketCap?: string;
    marketCapRaw?: number | null;

    logoUrl?: string | null;
};

export type SignalEvent = {
    id: string;
    ts: number;
    symbol: string;
    signal: string;
    tf: TF;
    price: number;
    changePercent: number;
    changeTf?: number;
    score?: number;
    volSpike: number | null;
    source?: "klines" | "fallback";
};

function fmtPrice(n: number) {
    const abs = Math.abs(n);
    const d = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8;
    return n.toFixed(d);
}

function signalBadge(signal: string) {
    switch (signal) {
        case "Breakout":
            return "border-emerald-400/45 bg-emerald-400/14 text-emerald-200";
        case "Big Move":
            return "border-green-400/45 bg-green-400/14 text-green-200";
        case "Reversal Up":
            return "border-teal-400/45 bg-teal-400/14 text-teal-200";
        case "Reversal Down":
            return "border-fuchsia-400/45 bg-fuchsia-400/14 text-fuchsia-200";
        case "Dump":
            return "border-rose-400/45 bg-rose-400/14 text-rose-200";
        case "Whale Activity":
            return "border-amber-400/55 bg-amber-400/14 text-amber-200";
        case "Watch":
            return "border-sky-400/55 bg-sky-400/14 text-sky-200";
        case "Calm":
            return "border-white/10 bg-white/5 text-white/65";
        default:
            return "border-white/10 bg-white/5 text-white/65";
    }
}

function headerSignalBadge(signal: string) {
    switch (signal) {
        case "Breakout":
            return "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-400/45 dark:bg-emerald-400/14 dark:text-emerald-200";
        case "Big Move":
            return "border-green-300 bg-green-100 text-green-700 dark:border-green-400/45 dark:bg-green-400/14 dark:text-green-200";
        case "Reversal Up":
            return "border-teal-300 bg-teal-100 text-teal-700 dark:border-teal-400/45 dark:bg-teal-400/14 dark:text-teal-200";
        case "Reversal Down":
            return "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-700 dark:border-fuchsia-400/45 dark:bg-fuchsia-400/14 dark:text-fuchsia-200";
        case "Dump":
            return "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-400/45 dark:bg-rose-400/14 dark:text-rose-200";
        case "Whale Activity":
            return "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-400/55 dark:bg-amber-400/14 dark:text-amber-200";
        case "Watch":
            return "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-400/55 dark:bg-sky-400/14 dark:text-sky-200";
        case "Calm":
            return "border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)] dark:border-white/10 dark:bg-white/5 dark:text-white/65";
        default:
            return "border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)] dark:border-white/10 dark:bg-white/5 dark:text-white/65";
    }
}

export function SymbolDrawer({
    open,
    onClose,
    row,
    tf,
    feed,
}: {
    open: boolean;
    onClose: () => void;
    row: HotSymbol | null;
    tf: TF;
    feed: SignalEvent[];
}) {
    const symbol = row?.symbol ?? "";
    const exchange = row?.exchange ?? "binance";
    const chartInterval = toTvInterval(tf);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const events = useMemo(() => {
        if (!symbol) return [];
        return feed
            .filter((e) => e.symbol === symbol)
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 30);
    }, [feed, symbol]);

    return (
        <>
            <div
                className={[
                    "fixed inset-0 z-40 transition-opacity",
                    open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
                ].join(" ")}
                onClick={onClose}
            >
                <div className="absolute inset-0 bg-black/60" />
            </div>

            <aside
                className={[
                    "fixed right-0 top-0 z-50 h-dvh w-full sm:w-[460px] md:w-[540px]",
                    "border-l border-[var(--border)] bg-[var(--panel)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80",
                    "transition-transform duration-200",
                    open ? "translate-x-0" : "translate-x-full",
                ].join(" ")}
                aria-hidden={!open}
            >
                <div className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4 dark:border-slate-800">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <div className="text-lg font-semibold text-[var(--text)] dark:text-slate-100">{symbol || "—"}</div>
                                <ExchangeTradeButton exchange={exchange} symbol={symbol} />
                                {row?.signal ? (
                                    <span
                                        className={[
                                            "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-medium backdrop-blur",
                                            headerSignalBadge(row.signal),
                                        ].join(" ")}
                                    >
                                        {row.signal}
                                    </span>
                                ) : null}
                                {row?.source === "fallback" ? (
                                    <span className="rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2.5 py-1 text-[12px] text-[var(--muted)] dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                                        fallback
                                    </span>
                                ) : null}
                            </div>

                            <div className="mt-1 text-sm text-[var(--muted)] dark:text-slate-400">
                                Price: <span className="text-[var(--text)] dark:text-slate-100">${row ? fmtPrice(row.price) : "—"}</span>
                                <span className="mx-2 text-[var(--muted2)] dark:text-slate-700">•</span>
                                TF: <span className="text-[var(--text)] dark:text-slate-100">{tf}</span>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--hover)] dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-900/60"
                            title="Close"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => window.open(`/symbol/${encodeURIComponent(symbol)}`, "_blank")}
                                className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--hover)] dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-900/60"
                                disabled={!symbol}
                            >
                                Open chart
                            </button>
                            <button
                                onClick={() => (window.location.href = `/terminal?symbol=${encodeURIComponent(symbol)}`)}
                                className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--hover)] dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-900/60"
                                disabled={!symbol}
                            >
                                Open terminal
                            </button>
                            <button
                                onClick={() => (window.location.href = `/bots?symbol=${encodeURIComponent(symbol)}`)}
                                className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--hover)] dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-900/60"
                                disabled={!symbol}
                            >
                                Bot presets
                            </button>
                            <button
                                onClick={() => {
                                    if (!symbol) return;
                                    const key = "watchlist";
                                    const cur = new Set<string>(JSON.parse(localStorage.getItem(key) || "[]"));
                                    if (cur.has(symbol)) cur.delete(symbol);
                                    else cur.add(symbol);
                                    localStorage.setItem(key, JSON.stringify([...cur]));
                                }}
                                className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--hover)] dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-900/60"
                                disabled={!symbol}
                            >
                                Watch (local)
                            </button>
                        </div>

                        <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)] dark:border-slate-800 dark:bg-slate-950/30 dark:shadow-none">
                            <AdvancedChartWidget symbol={symbol} exchange={exchange} interval={chartInterval} locale="en" />
                            <div className="mt-2 text-xs text-[var(--muted2)] dark:text-slate-500">
                                Exchange: {exchange} • Interval: {chartInterval}
                            </div>
                        </section>

                        <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)] dark:border-slate-800 dark:bg-slate-950/30 dark:shadow-none">
                            <div className="mb-2 text-sm font-medium text-[var(--text)] dark:text-slate-200">Signals (last)</div>

                            {events.length ? (
                                <div className="max-h-[260px] overflow-y-auto pr-1 space-y-2">
                                    {events.map((e) => (
                                        <div
                                            key={e.id}
                                            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-xs dark:border-slate-800/60 dark:bg-slate-950/40"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span
                                                    className={[
                                                        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-medium backdrop-blur",
                                                        signalBadge(e.signal),
                                                    ].join(" ")}
                                                >
                                                    {e.signal}
                                                </span>
                                                <span className="text-[var(--muted2)] dark:text-slate-500">{new Date(e.ts).toLocaleTimeString()}</span>
                                            </div>
                                            <div className="mt-2 text-[var(--muted)] dark:text-slate-400">
                                                Δ {e.tf}:{" "}
                                                <span
                                                    className={
                                                        e.changePercent > 0 ? "text-emerald-400" : e.changePercent < 0 ? "text-rose-400" : ""
                                                    }
                                                >
                                                    {Number.isFinite(e.changePercent) ? `${e.changePercent.toFixed(2)}%` : "—"}
                                                </span>
                                                <span className="mx-2 text-[var(--muted2)] dark:text-slate-700">•</span>
                                                Spike: {e.volSpike == null ? "—" : `${e.volSpike.toFixed(2)}x`}
                                                <span className="mx-2 text-[var(--muted2)] dark:text-slate-700">•</span>
                                                ${Number.isFinite(e.price) ? fmtPrice(e.price) : "—"}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-xs text-[var(--muted2)] dark:text-slate-500">Пока нет событий по {symbol}.</div>
                            )}
                        </section>
                    </div>
                </div>
            </aside>
        </>
    );
}
