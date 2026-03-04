"use client";

import { useMemo, useState } from "react";

type Point = { x: number; y: number; v: number; t: number };

function fmt(n: number, digits = 2) {
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(digits);
}

export function PriceChart({
    times,
    values,
    height = 320,
}: {
    times: number[]; // ms
    values: number[]; // close
    height?: number;
}) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    const data = useMemo(() => {
        const n = Math.min(times.length, values.length);
        const xs = times.slice(0, n);
        const ys = values.slice(0, n);

        if (n < 2) {
            return {
                points: [] as Point[],
                d: "",
                areaD: "",
                min: 0,
                max: 0,
                last: 0,
            };
        }

        const min = Math.min(...ys);
        const max = Math.max(...ys);
        const span = max - min || 1;

        const w = 1000; // виртуальная ширина, SVG растягивается по контейнеру
        const h = height;

        const points: Point[] = ys.map((v, i) => {
            const x = (i / (n - 1)) * w;
            const y = h - ((v - min) / span) * (h - 20) - 10; // отступ сверху/снизу
            return { x, y, v, t: xs[i] };
        });

        const d = points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
            .join(" ");

        const areaD =
            `${d} L ${w.toFixed(2)} ${(h - 10).toFixed(2)} L 0 ${(h - 10).toFixed(2)} Z`;

        return { points, d, areaD, min, max, last: ys[n - 1] };
    }, [times, values, height]);

    const w = 1000;
    const h = height;

    const hover = hoverIdx != null ? data.points[hoverIdx] : null;

    // для быстрого определения индекса по X
    const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!data.points.length) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * w;

        // индекс приблизительно
        const n = data.points.length;
        const idx = Math.max(0, Math.min(n - 1, Math.round((x / w) * (n - 1))));
        setHoverIdx(idx);
    };

    const onLeave = () => setHoverIdx(null);

    const gridY = [0.2, 0.4, 0.6, 0.8].map((p) => 10 + (h - 20) * p);

    return (
        <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-slate-300">
                    <span className="text-slate-500">Last:</span>{" "}
                    <span className="font-semibold">${fmt(data.last, 2)}</span>
                    <span className="mx-2 text-slate-700">|</span>
                    <span className="text-slate-500">Min:</span>{" "}
                    <span className="font-semibold">${fmt(data.min, 2)}</span>
                    <span className="mx-2 text-slate-700">|</span>
                    <span className="text-slate-500">Max:</span>{" "}
                    <span className="font-semibold">${fmt(data.max, 2)}</span>
                </div>

                {hover ? (
                    <div className="text-xs text-slate-400">
                        {new Date(hover.t).toISOString().replace("T", " ").slice(0, 16)}Z
                        <span className="mx-2 text-slate-700">|</span>
                        <span className="text-slate-500">Close:</span>{" "}
                        <span className="text-slate-200 font-semibold">${fmt(hover.v, 2)}</span>
                    </div>
                ) : (
                    <div className="text-xs text-slate-500">Hover the chart</div>
                )}
            </div>

            <svg
                viewBox={`0 0 ${w} ${h}`}
                width="100%"
                height={h}
                className="block rounded-lg border border-slate-800 bg-slate-950/40"
                onMouseMove={onMove}
                onMouseLeave={onLeave}
                role="img"
                aria-label="Price chart"
            >
                {/* grid */}
                {gridY.map((y) => (
                    <line
                        key={y}
                        x1="0"
                        x2={w}
                        y1={y}
                        y2={y}
                        stroke="currentColor"
                        opacity="0.08"
                    />
                ))}

                {/* area */}
                {data.areaD ? (
                    <path d={data.areaD} fill="currentColor" opacity="0.08" />
                ) : null}

                {/* line */}
                {data.d ? (
                    <path d={data.d} fill="none" stroke="currentColor" strokeWidth="3" />
                ) : null}

                {/* hover crosshair */}
                {hover ? (
                    <>
                        <line
                            x1={hover.x}
                            x2={hover.x}
                            y1="0"
                            y2={h}
                            stroke="currentColor"
                            opacity="0.18"
                        />
                        <circle cx={hover.x} cy={hover.y} r="6" fill="currentColor" opacity="0.9" />
                    </>
                ) : null}
            </svg>
        </div>
    );
}
