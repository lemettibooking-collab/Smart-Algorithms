"use client";

import * as React from "react";
import type { FeedEvent } from "./symbol-drawer";

function classForSignal(signal: string) {
    const s = signal.toLowerCase();
    if (s.includes("whale")) return "bg-emerald-950/60 text-emerald-200 border-emerald-700/50";
    if (s.includes("big")) return "bg-fuchsia-950/60 text-fuchsia-200 border-fuchsia-700/50";
    if (s.includes("break")) return "bg-sky-950/60 text-sky-200 border-sky-700/50";
    if (s.includes("hot")) return "bg-amber-950/60 text-amber-200 border-amber-700/50";
    if (s.includes("calm")) return "bg-zinc-900 text-zinc-300 border-zinc-700";
    return "bg-zinc-900 text-zinc-200 border-zinc-700";
}

export function SignalsFeed({
    events,
    onEventsChange,
}: {
    events: FeedEvent[];
    onEventsChange: (next: FeedEvent[]) => void;
}) {
    const [paused, setPaused] = React.useState(false);
    const [onlyStrong, setOnlyStrong] = React.useState(false);

    const shown = React.useMemo(() => {
        const arr = [...events].sort((a, b) => b.ts - a.ts);
        if (!onlyStrong) return arr;
        return arr.filter((e) => !e.signal.toLowerCase().includes("calm"));
    }, [events, onlyStrong]);

    return (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-100">Signals Feed</div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onEventsChange([])}
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                    >
                        Clear
                    </button>
                    <button
                        onClick={() => setPaused((v) => !v)}
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                    >
                        {paused ? "Resume" : "Pause"}
                    </button>
                    <label className="ml-1 flex items-center gap-2 text-xs text-zinc-300">
                        <input
                            type="checkbox"
                            checked={onlyStrong}
                            onChange={(e) => setOnlyStrong(e.target.checked)}
                            className="h-4 w-4 accent-zinc-200"
                        />
                        Only strong
                    </label>
                </div>
            </div>

            <div className="mt-3 max-h-[220px] overflow-y-auto pr-1">
                {shown.length ? (
                    <ul className="space-y-2">
                        {shown.map((e) => (
                            <li key={`${e.ts}-${e.symbol}-${e.signal}`} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className={["inline-flex rounded-full border px-2 py-0.5 text-xs", classForSignal(e.signal)].join(" ")}>
                                            {e.signal}
                                        </span>
                                        <span className="text-xs font-medium text-zinc-200">{e.symbol}</span>
                                    </div>
                                    <span className="text-xs text-zinc-500">{new Date(e.ts).toLocaleTimeString()}</span>
                                </div>
                                <div className="mt-2 text-xs text-zinc-400">
                                    {e.price !== undefined ? <>Price: {e.price}</> : null}
                                    {e.changeTf !== undefined ? <> · Δtf: {e.changeTf.toFixed(2)}%</> : null}
                                    {e.score !== undefined ? <> · Score: {e.score.toFixed(2)}</> : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-sm text-zinc-400">Пока пусто.</div>
                )}
            </div>
        </div>
    );
}

/**
 * Хелпер: вызывай это из HotClient, когда меняется сигнал у строки.
 * Уважает paused/filters в UI, но хранение событий — в HotClient.
 */
export function pushFeedEvent(
    prev: FeedEvent[],
    next: FeedEvent,
    cooldownMs = 30_000
) {
    // cooldown на символ + сигнал
    const now = next.ts;
    const recent = prev.find((e) => e.symbol === next.symbol && e.signal === next.signal && now - e.ts < cooldownMs);
    if (recent) return prev;
    return [next, ...prev].slice(0, 300);
}