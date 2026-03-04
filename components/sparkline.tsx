"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Exchange = "binance" | "mexc";

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

export default function Sparkline({
    symbol,
    interval,
    exchange = "binance",
    height = 26,
    width = 140,
}: {
    symbol: string;
    interval: string;
    exchange?: Exchange;
    height?: number;
    width?: number;
}) {
    const [closes, setCloses] = useState<number[] | null>(null);
    const [ok, setOk] = useState(true);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        let mounted = true;
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        (async () => {
            try {
                setOk(true);

                // Важно: interval должен быть валидным (24h -> 15m должен быть исправлен в hot-table)
                const qs = new URLSearchParams();
                qs.set("exchange", exchange);
                qs.set("symbol", symbol);
                qs.set("interval", interval);
                qs.set("limit", "60");

                const res = await fetch(`/api/klines?${qs.toString()}`, {
                    cache: "no-store",
                    signal: ac.signal,
                });

                if (!res.ok) {
                    const txt = await res.text().catch(() => "");
                    throw new Error(`klines HTTP ${res.status} ${txt.slice(0, 120)}`);
                }

                const json = await res.json();
                if (!mounted) return;

                const candles = json?.candles;
                if (!json?.ok || !Array.isArray(candles)) {
                    throw new Error(`bad payload: ok=${json?.ok} candles=${Array.isArray(candles)}`);
                }

                const arr = candles
                    .map((c: any) => Number(c?.close))
                    .filter((x: number) => Number.isFinite(x));

                setCloses(arr.length >= 2 ? arr : null);
            } catch (e: any) {
                if (e?.name === "AbortError") return;
                if (!mounted) return;
                console.debug("[sparkline] fail", { exchange, symbol, interval, err: String(e?.message ?? e) });
                setOk(false);
                setCloses(null);
            }
        })();

        return () => {
            mounted = false;
            ac.abort();
        };
    }, [symbol, interval, exchange]);

    const path = useMemo(() => {
        if (!closes || closes.length < 2) return null;

        const min = Math.min(...closes);
        const max = Math.max(...closes);
        const span = max - min || 1;

        const pts = closes.map((v, i) => {
            const x = (i / (closes.length - 1)) * width;
            const y = height - clamp((v - min) / span, 0, 1) * height;
            return [x, y] as const;
        });

        const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
        const last = pts[pts.length - 1];
        return { d, last };
    }, [closes, height, width]);

    if (!ok || !path) return <div className="text-xs text-white/25">—</div>;

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            <path d={path.d} fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400/80" />
            <circle cx={path.last[0]} cy={path.last[1]} r="2.5" className="fill-emerald-300" />
        </svg>
    );
}