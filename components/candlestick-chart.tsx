"use client";

import { useMemo, useState } from "react";
import type { Candle } from "@/lib/binance";

function fmt(n: number, digits = 2) {
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(digits);
}

function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
}

export function CandlestickChart({
    candles,
    height = 360,
    showVolume = true,
}: {
    candles: Candle[];
    height?: number;
    showVolume?: boolean;
}) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    const model = useMemo(() => {
        const n = candles?.length ?? 0;
        if (n < 2) {
            return {
                n,
                w: 1000,
                h: height,
                priceTop: 10,
                priceBottom: height - 10,
                volTop: height - 10,
                volBottom: height - 10,
                minP: 0,
                maxP: 0,
                maxV: 0,
            };
        }

        const w = 1000;
        const h = height;

        // делим высоту: сверху price, снизу volume (если включено)
        const padTop = 10;
        const padBottom = 10;
        const volH = showVolume ? Math.round(h * 0.22) : 0;
        const gap = showVolume ? 10 : 0;

        const priceTop = padTop;
        const priceBottom = h - padBottom - volH - gap;

        const volTop = priceBottom + gap;
        const volBottom = h - padBottom;

        let minP = Number.POSITIVE_INFINITY;
        let maxP = Number.NEGATIVE_INFINITY;
        let maxV = 0;

        for (const c of candles) {
            minP = Math.min(minP, c.low);
            maxP = Math.max(maxP, c.high);
            maxV = Math.max(maxV, c.volume);
        }

        if (!Number.isFinite(minP) || !Number.isFinite(maxP) || minP === maxP) {
            minP = 0;
            maxP = 1;
        }

        return {
            n,
            w,
            h,
            priceTop,
            priceBottom,
            volTop,
            volBottom,
            minP,
            maxP,
            maxV: maxV || 1,
        };
    }, [candles, height, showVolume]);

    const priceY = (p: number) => {
        const span = model.maxP - model.minP || 1;
        const t = (p - model.minP) / span;
        return model.priceBottom - t * (model.priceBottom - model.priceTop);
    };

    const volY = (v: number) => {
        const t = v / (model.maxV || 1);
        return model.volBottom - t * (model.volBottom - model.volTop);
    };

    const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (model.n < 2) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * model.w;

        const n = model.n;
        const step = model.w / n;
        const idx = clamp(Math.floor(x / step), 0, n - 1);
        setHoverIdx(idx);
    };

    const onLeave = () => setHoverIdx(null);

    const hover = hoverIdx != null ? candles[hoverIdx] : null;

    // свечной шаг и размеры
    const n = model.n;
    const step = n ? model.w / n : model.w;
    const bodyW = Math.max(2, step * 0.58); // ширина тела свечи
    const wickW = Math.max(1, step * 0.12); // ширина “фитиля”
    const volW = Math.max(2, step * 0.58);

    // сетка по Y (price)
    const gridYs = [0.2, 0.4, 0.6, 0.8].map(
        (p) => model.priceTop + (model.priceBottom - model.priceTop) * p
    );

    const last = candles?.length ? candles[candles.length - 1] : null;

    return (
        <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-slate-300">
                    {last ? (
                        <>
                            <span className="text-slate-500">Last close:</span>{" "}
                            <span className="font-semibold">${fmt(last.close, 2)}</span>
                            <span className="mx-2 text-slate-700">|</span>
                            <span className="text-slate-500">Range:</span>{" "}
                            <span className="font-semibold">
                                ${fmt(model.minP, 2)} – ${fmt(model.maxP, 2)}
                            </span>
                        </>
                    ) : (
                        "—"
                    )}
                </div>

                {hover ? (
                    <div className="text-xs text-slate-400">
                        {new Date(hover.openTime).toISOString().replace("T", " ").slice(0, 16)}Z
                        <span className="mx-2 text-slate-700">|</span>
                        <span className="text-slate-500">O:</span>{" "}
                        <span className="text-slate-200 font-semibold">${fmt(hover.open, 2)}</span>{" "}
                        <span className="text-slate-500">H:</span>{" "}
                        <span className="text-slate-200 font-semibold">${fmt(hover.high, 2)}</span>{" "}
                        <span className="text-slate-500">L:</span>{" "}
                        <span className="text-slate-200 font-semibold">${fmt(hover.low, 2)}</span>{" "}
                        <span className="text-slate-500">C:</span>{" "}
                        <span className="text-slate-200 font-semibold">${fmt(hover.close, 2)}</span>
                        {showVolume ? (
                            <>
                                <span className="mx-2 text-slate-700">|</span>
                                <span className="text-slate-500">V:</span>{" "}
                                <span className="text-slate-200 font-semibold">{fmt(hover.volume, 2)}</span>
                            </>
                        ) : null}
                    </div>
                ) : (
                    <div className="text-xs text-slate-500">Hover the chart</div>
                )}
            </div>

            <svg
                viewBox={`0 0 ${model.w} ${model.h}`}
                width="100%"
                height={model.h}
                className="block rounded-lg border border-slate-800 bg-slate-950/40"
                onMouseMove={onMove}
                onMouseLeave={onLeave}
                role="img"
                aria-label="Candlestick chart"
            >
                {/* price grid */}
                {gridYs.map((y) => (
                    <line
                        key={y}
                        x1="0"
                        x2={model.w}
                        y1={y}
                        y2={y}
                        stroke="currentColor"
                        opacity="0.08"
                    />
                ))}

                {/* candles */}
                {candles.map((c, i) => {
                    const xCenter = (i + 0.5) * step;
                    const up = c.close >= c.open;

                    const yOpen = priceY(c.open);
                    const yClose = priceY(c.close);
                    const yHigh = priceY(c.high);
                    const yLow = priceY(c.low);

                    const bodyTop = Math.min(yOpen, yClose);
                    const bodyBottom = Math.max(yOpen, yClose);
                    const bodyH = Math.max(1, bodyBottom - bodyTop);

                    const xBody = xCenter - bodyW / 2;
                    const xWick = xCenter - wickW / 2;

                    const isHover = hoverIdx === i;

                    // без явных цветов: используем разные opacity + strokeWidth
                    // “up” -> более яркое тело, “down” -> более тусклое
                    const bodyOpacity = up ? 0.55 : 0.25;
                    const wickOpacity = up ? 0.7 : 0.45;

                    return (
                        <g key={c.openTime} opacity={isHover ? 1 : 0.95}>
                            {/* wick */}
                            <rect
                                x={xWick}
                                y={Math.min(yHigh, yLow)}
                                width={wickW}
                                height={Math.max(1, Math.abs(yLow - yHigh))}
                                fill="currentColor"
                                opacity={wickOpacity}
                            />
                            {/* body */}
                            <rect
                                x={xBody}
                                y={bodyTop}
                                width={bodyW}
                                height={bodyH}
                                fill="currentColor"
                                opacity={bodyOpacity}
                                stroke="currentColor"
                                strokeWidth={isHover ? 2 : 1}
                            />
                        </g>
                    );
                })}

                {/* volume bars */}
                {showVolume
                    ? candles.map((c, i) => {
                        const xCenter = (i + 0.5) * step;
                        const up = c.close >= c.open;
                        const y = volY(c.volume);
                        const x = xCenter - volW / 2;
                        const h = Math.max(1, model.volBottom - y);
                        const opacity = up ? 0.35 : 0.2;

                        return (
                            <rect
                                key={`v-${c.openTime}`}
                                x={x}
                                y={y}
                                width={volW}
                                height={h}
                                fill="currentColor"
                                opacity={opacity}
                            />
                        );
                    })
                    : null}

                {/* hover crosshair */}
                {hover && hoverIdx != null ? (
                    <>
                        <line
                            x1={(hoverIdx + 0.5) * step}
                            x2={(hoverIdx + 0.5) * step}
                            y1="0"
                            y2={model.h}
                            stroke="currentColor"
                            opacity="0.18"
                        />
                    </>
                ) : null}
            </svg>
        </div>
    );
}
