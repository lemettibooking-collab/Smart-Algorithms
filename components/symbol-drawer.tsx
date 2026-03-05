"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { TerminalChart } from "@/src/shared/ui";

type TF = "24h" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M" | "1y";

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

type KlineCandle = {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    closeTime: number;
    quoteVolume?: number;
};

function tfToInterval(tf: TF) {
    switch (tf) {
        case "1m":
            return "1m";
        case "5m":
            return "5m";
        case "15m":
            return "15m";
        case "1h":
            return "1h";
        case "4h":
            return "4h";
        case "1d":
            return "1d";
        case "1w":
            return "1w";
        case "1M":
            return "1M";
        case "1y":
            return "1d"; // год лучше дневками
        case "24h":
            return "1h"; // тикер-режим: график на 1h
        default:
            return "15m";
    }
}

function fmtPrice(n: number) {
  const abs = Math.abs(n);
  const d = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8;
  return n.toFixed(d);
}

function lastSma(candles: KlineCandle[], period: number): number | null {
    if (!Array.isArray(candles) || candles.length < period) return null;
    let sum = 0;
    for (let i = candles.length - period; i < candles.length; i += 1) {
        const close = Number(candles[i]?.close);
        if (!Number.isFinite(close)) return null;
        sum += close;
    }
    return sum / period;
}

function signalBadge(signal: string) {
    // под твои же цвета из feedSignalBadgeClass, но чуть проще
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
    const [loading, setLoading] = useState(false);
    const [candles, setCandles] = useState<KlineCandle[]>([]);
    const [showMA50, setShowMA50] = useState(true);
    const [showMA100, setShowMA100] = useState(true);
    const [showMA200, setShowMA200] = useState(true);

    // ESC to close
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (!open || !symbol) return;

        let aborted = false;
        (async () => {
            setLoading(true);
            try {
                const interval = tfToInterval(tf);
                const limit = 160;

                const res = await fetch(
                    `/api/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`,
                    { cache: "no-store" }
                );
                const json = await res.json();
                if (aborted) return;
                if (json?.ok && Array.isArray(json?.candles)) setCandles(json.candles as KlineCandle[]);
                else setCandles([]);
            } catch {
                if (!aborted) setCandles([]);
            } finally {
                if (!aborted) setLoading(false);
            }
        })();

        return () => {
            aborted = true;
        };
    }, [open, symbol, tf]);

    const events = useMemo(() => {
        if (!symbol) return [];
        return feed
            .filter((e) => e.symbol === symbol)
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 30);
    }, [feed, symbol]);

    const ma50 = useMemo(() => lastSma(candles, 50), [candles]);
    const ma100 = useMemo(() => lastSma(candles, 100), [candles]);
    const ma200 = useMemo(() => lastSma(candles, 200), [candles]);

    return (
        <>
            {/* Backdrop */}
            <div
                className={[
                    "fixed inset-0 z-40 transition-opacity",
                    open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
                ].join(" ")}
                onClick={onClose}
            >
                <div className="absolute inset-0 bg-black/60" />
            </div>

            {/* Panel */}
            <aside
                className={[
                    "fixed right-0 top-0 z-50 h-dvh w-full sm:w-[460px] md:w-[540px]",
                    "border-l border-slate-800 bg-slate-950/80 backdrop-blur",
                    "transition-transform duration-200",
                    open ? "translate-x-0" : "translate-x-full",
                ].join(" ")}
                aria-hidden={!open}
            >
                <div className="flex h-full flex-col">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <div className="text-lg font-semibold text-slate-100">{symbol || "—"}</div>
                                {row?.signal ? (
                                    <span
                                        className={[
                                            "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-medium backdrop-blur",
                                            signalBadge(row.signal),
                                        ].join(" ")}
                                    >
                                        {row.signal}
                                    </span>
                                ) : null}
                                {row?.source === "fallback" ? (
                                    <span className="rounded-full border border-slate-700 bg-slate-950/40 px-2.5 py-1 text-[12px] text-slate-300">
                                        fallback
                                    </span>
                                ) : null}
                            </div>

                            <div className="mt-1 text-sm text-slate-400">
                                Price: <span className="text-slate-100">${row ? fmtPrice(row.price) : "—"}</span>
                                <span className="mx-2 text-slate-700">•</span>
                                TF: <span className="text-slate-100">{tf}</span>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
                            title="Close"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => window.open(`/symbol/${encodeURIComponent(symbol)}`, "_blank")}
                                className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 hover:border-slate-600"
                                disabled={!symbol}
                            >
                                Open chart
                            </button>
                            <button
                                onClick={() => (window.location.href = `/terminal?symbol=${encodeURIComponent(symbol)}`)}
                                className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 hover:border-slate-600"
                                disabled={!symbol}
                            >
                                Open terminal
                            </button>
                            <button
                                onClick={() => (window.location.href = `/bots?symbol=${encodeURIComponent(symbol)}`)}
                                className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 hover:border-slate-600"
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
                                className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 hover:border-slate-600"
                                disabled={!symbol}
                            >
                                Watch (local)
                            </button>
                        </div>

                        {/* Terminal chart */}
                        <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm font-medium text-slate-200">Terminal Chart</div>
                                <div className="flex items-center gap-2 text-xs text-slate-300">
                                    <label className="inline-flex items-center gap-1 rounded border border-sky-300/30 bg-sky-400/10 px-2 py-1">
                                        <input type="checkbox" checked={showMA50} onChange={(e) => setShowMA50(e.target.checked)} />
                                        MA50
                                    </label>
                                    <label className="inline-flex items-center gap-1 rounded border border-amber-300/30 bg-amber-400/10 px-2 py-1">
                                        <input type="checkbox" checked={showMA100} onChange={(e) => setShowMA100(e.target.checked)} />
                                        MA100
                                    </label>
                                    <label className="inline-flex items-center gap-1 rounded border border-violet-300/30 bg-violet-400/10 px-2 py-1">
                                        <input type="checkbox" checked={showMA200} onChange={(e) => setShowMA200(e.target.checked)} />
                                        MA200
                                    </label>
                                </div>
                            </div>
                            <TerminalChart
                                candles={candles}
                                loading={loading}
                                showMA50={showMA50}
                                showMA100={showMA100}
                                showMA200={showMA200}
                            />
                            <div className="mt-2 text-xs text-slate-400">
                                MA50 {ma50 == null ? "—" : fmtPrice(ma50)}{" "}
                                <span className="mx-1 text-slate-600">|</span>
                                MA100 {ma100 == null ? "—" : fmtPrice(ma100)}{" "}
                                <span className="mx-1 text-slate-600">|</span>
                                MA200 {ma200 == null ? "—" : fmtPrice(ma200)}
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                                Interval: {tfToInterval(tf)} • Candles: {candles.length}
                            </div>
                        </section>

                        {/* Events */}
                        <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                            <div className="mb-2 text-sm font-medium text-slate-200">Signals (last)</div>

                            {events.length ? (
                                <div className="max-h-[260px] overflow-y-auto pr-1 space-y-2">
                                    {events.map((e) => (
                                        <div key={e.id} className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3 text-xs">
                                            <div className="flex items-center justify-between gap-2">
                                                <span
                                                    className={[
                                                        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-medium backdrop-blur",
                                                        signalBadge(e.signal),
                                                    ].join(" ")}
                                                >
                                                    {e.signal}
                                                </span>
                                                <span className="text-slate-500">{new Date(e.ts).toLocaleTimeString()}</span>
                                            </div>
                                            <div className="mt-2 text-slate-400">
                                                Δ {e.tf}:{" "}
                                                <span
                                                    className={
                                                        e.changePercent > 0 ? "text-emerald-400" : e.changePercent < 0 ? "text-rose-400" : ""
                                                    }
                                                >
                                                    {Number.isFinite(e.changePercent) ? `${e.changePercent.toFixed(2)}%` : "—"}
                                                </span>
                                                <span className="mx-2 text-slate-700">•</span>
                                                Spike: {e.volSpike == null ? "—" : `${e.volSpike.toFixed(2)}x`}
                                                <span className="mx-2 text-slate-700">•</span>
                                                ${Number.isFinite(e.price) ? fmtPrice(e.price) : "—"}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-xs text-slate-500">Пока нет событий по {symbol}.</div>
                            )}
                        </section>
                    </div>
                </div>
            </aside>
        </>
    );
}
