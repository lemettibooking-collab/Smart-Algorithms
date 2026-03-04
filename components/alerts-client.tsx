"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Exchange = "binance" | "mexc";

type AlertRow = {
    id?: string;
    bucketTs?: number;
    ts: number;
    tf: string;

    baseAsset: string;
    exchange: Exchange;
    symbol: string;

    price: number;
    score: number;
    signal: string;

    changePercent: number;
    change24hPercent: number;

    volSpike: number | null;

    marketCapRaw: number | null;
    marketCap?: string;

    logoUrl?: string | null;
    iconUrl?: string | null;

    mergedFrom?: Array<{ exchange: Exchange; symbol: string; score: number }>;
};

type EventRow = AlertRow & {
    eventId?: string;
    eventType: "signal_change" | "score_jump";
    prevSignal?: string | null;
    prevScore?: number | null;
};

type AlertsResponse = {
    tf: string;
    ts: number;
    data: AlertRow[];
    sources?: unknown;
    error?: string;
};

type EventsResponse = {
    tf: string;
    ts: number;
    data: EventRow[];
    sources?: unknown;
    error?: string;
};

const SIGNALS = ["Watch", "Whale Activity", "Big Move", "Dump", "Breakout", "Reversal"] as const;
type SignalFilter = (typeof SIGNALS)[number];

type SortBy = "score" | "change" | "change24h" | "spike";
type Mode = "table" | "events";

function fmtPct(x: number) {
    const n = Number(x ?? 0) || 0;
    const s = n >= 0 ? "+" : "";
    return `${s}${n.toFixed(2)}%`;
}

function fmtPrice(x: number) {
    const n = Number(x ?? 0) || 0;
    if (n === 0) return "0";
    if (n >= 1000) return n.toFixed(2);
    if (n >= 1) return n.toFixed(4);
    return n.toPrecision(4);
}

function errMsg(e: unknown) {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    return "Failed";
}

export default function AlertsClient() {
    const [mode, setMode] = useState<Mode>("table");

    const [tf, setTf] = useState("15m");

    // defaults
    const [includeCalm, setIncludeCalm] = useState(false);
    const [onlyStrong, setOnlyStrong] = useState(true);
    const [strongScore, setStrongScore] = useState(4.0);

    const [minScore, setMinScore] = useState(2.0);
    const [limit, setLimit] = useState(100);

    const [auto, setAuto] = useState(true);

    // table-only controls
    const [dedupe, setDedupe] = useState(true);
    const [sortBy, setSortBy] = useState<SortBy>("score");

    // shared filter
    const [signalFilter, setSignalFilter] = useState<SignalFilter[]>([]);

    // events controls
    const [eventsLimit, setEventsLimit] = useState(80);
    const [scoreJump, setScoreJump] = useState(1.0);
    const [cooldownSec, setCooldownSec] = useState(90);

    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<AlertRow[]>([]);
    const [events, setEvents] = useState<EventRow[]>([]);
    const [sources, setSources] = useState<unknown>(null);
    const [err, setErr] = useState<string | null>(null);

    const seenEventKeys = useRef<Set<string>>(new Set());

    function toggleSignal(s: SignalFilter) {
        setSignalFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
    }

    const tableQuery = useMemo(() => {
        const p = new URLSearchParams();
        p.set("tf", tf);
        p.set("includeCalm", includeCalm ? "1" : "0");
        p.set("minScore", String(onlyStrong ? strongScore : minScore));
        p.set("limit", String(limit));
        p.set("dedupe", dedupe ? "1" : "0");
        p.set("sort", sortBy);
        if (signalFilter.length) p.set("signals", signalFilter.join(","));
        return `/api/alerts?${p.toString()}`;
    }, [tf, includeCalm, onlyStrong, strongScore, minScore, limit, dedupe, sortBy, signalFilter]);

    const eventsQuery = useMemo(() => {
        const p = new URLSearchParams();
        p.set("tf", tf);
        p.set("includeCalm", includeCalm ? "1" : "0");
        p.set("minScore", String(onlyStrong ? strongScore : minScore));
        // events сами дедупят, но фильтры важны
        p.set("sort", sortBy);
        if (signalFilter.length) p.set("signals", signalFilter.join(","));

        p.set("limit", String(eventsLimit));
        p.set("scoreJump", String(scoreJump));
        p.set("cooldownSec", String(cooldownSec));
        // baseLimit можно поднять, чтобы не пропускать
        p.set("baseLimit", "220");

        return `/api/alerts/events?${p.toString()}`;
    }, [tf, includeCalm, onlyStrong, strongScore, minScore, sortBy, signalFilter, eventsLimit, scoreJump, cooldownSec]);

    async function loadTable() {
        setLoading(true);
        setErr(null);
        try {
            const r = await fetch(tableQuery, { cache: "no-store" });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const j: AlertsResponse = await r.json();
            if (j.error) setErr(j.error);
            setRows(Array.isArray(j.data) ? j.data : []);
            setSources(j.sources ?? null);
        } catch (e: unknown) {
            setErr(errMsg(e));
            setRows([]);
            setSources(null);
        } finally {
            setLoading(false);
        }
    }

    async function loadEvents() {
        setLoading(true);
        setErr(null);
        try {
            const r = await fetch(eventsQuery, { cache: "no-store" });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const j: EventsResponse = await r.json();
            if (j.error) setErr(j.error);
            setSources(j.sources ?? null);

            const incoming = Array.isArray(j.data) ? j.data : [];

            // мерджим в локальный буфер (до 80 строк)
            setEvents((prev) => {
                const next = [...prev];

                for (const ev of incoming) {
                    // уникальность события: ts + baseAsset + signal + eventType
                    const k = ev.eventId ?? `${ev.ts}:${ev.tf}:${ev.baseAsset}:${ev.eventType}:${ev.signal}:${ev.score.toFixed(2)}`;
                    if (seenEventKeys.current.has(k)) continue;
                    seenEventKeys.current.add(k);
                    next.unshift(ev);
                }

                // trim до eventsLimit (по умолчанию 80)
                return next.slice(0, eventsLimit);
            });
        } catch (e: unknown) {
            setErr(errMsg(e));
            setSources(null);
        } finally {
            setLoading(false);
        }
    }

    function refresh() {
        if (mode === "events") return loadEvents();
        return loadTable();
    }

    function clearEvents() {
        setEvents([]);
        seenEventKeys.current = new Set();
    }

    useEffect(() => {
        // при смене режима — делаем первичную загрузку
        if (mode === "events") loadEvents();
        else loadTable();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, tableQuery, eventsQuery]);

    useEffect(() => {
        if (!auto) return;
        const id = setInterval(() => refresh(), 5000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auto, mode, tableQuery, eventsQuery]);

    const kpi = useMemo(() => {
        const total = mode === "events" ? events.length : rows.length;
        const nonCalm = (mode === "events" ? events : rows).filter((r) => String(r.signal).toLowerCase() !== "calm").length;
        const src = (typeof sources === "object" && sources !== null ? sources : null) as Record<string, unknown> | null;
        const b = (typeof src?.binance === "object" && src?.binance !== null ? src.binance : null) as Record<string, unknown> | null;
        const m = (typeof src?.mexc === "object" && src?.mexc !== null ? src.mexc : null) as Record<string, unknown> | null;
        const degradedAny = !!(b?.degraded || m?.degraded);

        const wsB = b?.ws;
        const wsM = m?.ws;

        return { total, nonCalm, degradedAny, wsB, wsM };
    }, [mode, events, rows, sources]);

    return (
        <div className="space-y-3 text-sm text-white/80">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/40 p-3 backdrop-blur-md shadow-sm">
                <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
                    <button
                        className={[
                            "rounded-md px-2 py-1 text-sm transition",
                            mode === "table" ? "bg-white/10 text-white/90" : "text-white/70 hover:text-white/90",
                        ].join(" ")}
                        onClick={() => setMode("table")}
                        type="button"
                    >
                        Table
                    </button>
                    <button
                        className={[
                            "rounded-md px-2 py-1 text-sm transition",
                            mode === "events" ? "bg-white/10 text-white/90" : "text-white/70 hover:text-white/90",
                        ].join(" ")}
                        onClick={() => setMode("events")}
                        type="button"
                    >
                        Events
                    </button>
                </div>

                <select
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white/80 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
                    value={tf}
                    onChange={(e) => setTf(e.target.value)}
                >
                    {["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "1w", "1M"].map((x) => (
                        <option key={x} value={x}>{x}</option>
                    ))}
                </select>

                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={includeCalm} onChange={(e) => setIncludeCalm(e.target.checked)} />
                    include Calm
                </label>

                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={onlyStrong} onChange={(e) => setOnlyStrong(e.target.checked)} />
                    only strong
                </label>

                <label className="flex items-center gap-2 text-sm">
                    strongScore
                    <input
                        className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white/80 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-50"
                        type="number"
                        step="0.1"
                        value={strongScore}
                        onChange={(e) => setStrongScore(Number(e.target.value))}
                        disabled={!onlyStrong}
                    />
                </label>

                <label className="flex items-center gap-2 text-sm">
                    minScore
                    <input
                        className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white/80 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-50"
                        type="number"
                        step="0.1"
                        value={minScore}
                        onChange={(e) => setMinScore(Number(e.target.value))}
                        disabled={onlyStrong}
                    />
                </label>

                {mode === "table" ? (
                    <>
                        <label className="flex items-center gap-2 text-sm">
                            limit
                            <input
                                className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white/80 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
                                type="number"
                                step="10"
                                value={limit}
                                onChange={(e) => setLimit(Number(e.target.value))}
                            />
                        </label>

                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />
                            dedupe
                        </label>

                        <select
                            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white/80 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as SortBy)}
                        >
                            <option value="score">sort: score</option>
                            <option value="change">sort: Δ(tf)</option>
                            <option value="change24h">sort: 24h%</option>
                            <option value="spike">sort: volSpike</option>
                        </select>
                    </>
                ) : (
                    <>
                        <label className="flex items-center gap-2 text-sm">
                            keep
                            <input
                                className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white/80 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
                                type="number"
                                step="5"
                                value={eventsLimit}
                                onChange={(e) => setEventsLimit(Number(e.target.value))}
                            />
                        </label>

                        <label className="flex items-center gap-2 text-sm">
                            scoreJump
                            <input
                                className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white/80 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
                                type="number"
                                step="0.1"
                                value={scoreJump}
                                onChange={(e) => setScoreJump(Number(e.target.value))}
                            />
                        </label>

                        <label className="flex items-center gap-2 text-sm">
                            cooldown(s)
                            <input
                                className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white/80 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
                                type="number"
                                step="10"
                                value={cooldownSec}
                                onChange={(e) => setCooldownSec(Number(e.target.value))}
                            />
                        </label>

                        <button
                            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/20"
                            onClick={clearEvents}
                            type="button"
                        >
                            Clear events
                        </button>
                    </>
                )}

                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                    auto
                </label>

                <button
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80 placeholder:text-white/40 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/20"
                    onClick={refresh}
                    disabled={loading}
                >
                    {loading ? "Loading..." : "Refresh"}
                </button>

                {err ? <span className="text-sm text-red-400">{err}</span> : null}

                {/* Signal filter buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    {SIGNALS.map((s) => {
                        const on = signalFilter.includes(s);
                        return (
                            <button
                                key={s}
                                type="button"
                                className={[
                                    "rounded-lg border px-2 py-1 text-xs transition",
                                    on
                                        ? "border-white/20 bg-white/10 text-white/90"
                                        : "border-white/10 bg-transparent text-white/70 hover:bg-white/5 hover:text-white/90",
                                ].join(" ")}
                                onClick={() => toggleSignal(s)}
                                title="Filter by signal"
                            >
                                {s}
                            </button>
                        );
                    })}

                    {signalFilter.length ? (
                        <button
                            type="button"
                            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5 hover:text-white/90"
                            onClick={() => setSignalFilter([])}
                            title="Clear signal filters"
                        >
                            Clear signals
                        </button>
                    ) : null}
                </div>
            </div>

            {/* KPI */}
            <div className="grid gap-2 md:grid-cols-4">
                <div className="rounded-xl border border-white/10 p-3">
                    <div className="text-xs opacity-70">{mode === "events" ? "Events" : "Rows"}</div>
                    <div className="text-lg font-semibold">{kpi.total}</div>
                </div>
                <div className="rounded-xl border border-white/10 p-3">
                    <div className="text-xs opacity-70">Signals (non-Calm)</div>
                    <div className="text-lg font-semibold">{kpi.nonCalm}</div>
                </div>
                <div className="rounded-xl border border-white/10 p-3">
                    <div className="text-xs opacity-70">Degraded</div>
                    <div className="text-lg font-semibold">{kpi.degradedAny ? "YES" : "NO"}</div>
                </div>
                <div className="rounded-xl border border-white/10 p-3">
                    <div className="text-xs opacity-70">WS Health</div>
                    <div className="text-sm">
                        <div>Binance: {((kpi.wsB as Record<string, unknown> | null)?.connected) ? "OK" : "—"}</div>
                        <div>MEXC: {((kpi.wsM as Record<string, unknown> | null)?.connected) ? "OK" : "—"}</div>
                    </div>
                </div>
            </div>

            {/* Body */}
            {mode === "events" ? (
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-md shadow-sm">
                    <div className="max-h-[70vh] overflow-auto">
                        <table className="w-full text-sm text-white/80">
                            <thead className="sticky top-0 bg-white/5 text-sm font-medium text-white/80">
                                <tr className="text-left">
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3">Asset</th>
                                    <th className="px-4 py-3">Exch</th>
                                    <th className="px-4 py-3">Score</th>
                                    <th className="px-4 py-3">Signal</th>
                                    <th className="px-4 py-3">Δ(tf)</th>
                                    <th className="px-4 py-3">24h%</th>
                                    <th className="px-4 py-3">Price</th>
                                    <th className="px-4 py-3">Prev</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm text-white/80 leading-5">
                                {events.map((r, idx) => (
                                    <tr key={r.eventId ?? `${idx}:${r.ts}:${r.baseAsset}`} className="border-t border-white/5 hover:bg-white/5">
                                        <td className="px-4 py-3 text-xs text-white/50">
                                            {r.eventType === "signal_change" ? "Signal" : "Score"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {(r.logoUrl || r.iconUrl) ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={(r.logoUrl || r.iconUrl) as string}
                                                        alt={r.baseAsset}
                                                        className="h-5 w-5 rounded-full"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="h-5 w-5 rounded-full border border-white/10" />
                                                )}
                                                <div className="font-medium">{r.baseAsset}</div>
                                                <div className="text-xs text-white/50">{r.symbol}</div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">{r.exchange}</td>
                                        <td className="px-4 py-3">{r.score.toFixed(2)}</td>
                                        <td className="px-4 py-3">{r.signal}</td>
                                        <td className="px-4 py-3">{fmtPct(r.changePercent)}</td>
                                        <td className="px-4 py-3">{fmtPct(r.change24hPercent)}</td>
                                        <td className="px-4 py-3">{fmtPrice(r.price)}</td>
                                        <td className="px-4 py-3 text-xs text-white/50">
                                            {r.prevSignal != null || r.prevScore != null
                                                ? `${r.prevSignal ?? "—"} / ${(r.prevScore ?? 0).toFixed(2)}`
                                                : "—"}
                                        </td>
                                    </tr>
                                ))}
                                {!events.length && !loading ? (
                                    <tr>
                                        <td className="p-3 text-sm opacity-70" colSpan={9}>No events yet</td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-md shadow-sm">
                    <div className="max-h-[70vh] overflow-auto">
                        <table className="w-full text-sm text-white/80">
                            <thead className="sticky top-0 bg-white/5 text-sm font-medium text-white/80">
                                <tr className="text-left">
                                    <th className="px-4 py-3">Asset</th>
                                    <th className="px-4 py-3">Exch</th>
                                    <th className="px-4 py-3">Price</th>
                                    <th className="px-4 py-3">Δ(tf)</th>
                                    <th className="px-4 py-3">24h%</th>
                                    <th className="px-4 py-3">Score</th>
                                    <th className="px-4 py-3">Signal</th>
                                    <th className="px-4 py-3">VolSpike</th>
                                    <th className="px-4 py-3">MCap</th>
                                    <th className="px-4 py-3">Merged</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm text-white/80 leading-5">
                                {rows.map((r) => (
                                    <tr key={r.id ?? `${r.baseAsset}:${r.exchange}:${r.symbol}`} className="border-t border-white/5 hover:bg-white/5">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {(r.logoUrl || r.iconUrl) ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={(r.logoUrl || r.iconUrl) as string}
                                                        alt={r.baseAsset}
                                                        className="h-5 w-5 rounded-full"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="h-5 w-5 rounded-full border border-white/10" />
                                                )}
                                                <div className="font-medium">{r.baseAsset}</div>
                                                <div className="text-xs text-white/50">{r.symbol}</div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">{r.exchange}</td>
                                        <td className="px-4 py-3">{fmtPrice(r.price)}</td>
                                        <td className="px-4 py-3">{fmtPct(r.changePercent)}</td>
                                        <td className="px-4 py-3">{fmtPct(r.change24hPercent)}</td>
                                        <td className="px-4 py-3">{(r.score ?? 0).toFixed(2)}</td>
                                        <td className="px-4 py-3">{r.signal}</td>
                                        <td className="px-4 py-3">{r.volSpike == null ? "—" : `${r.volSpike.toFixed(2)}x`}</td>
                                        <td className="px-4 py-3">{r.marketCap ?? (r.marketCapRaw === null ? "—" : String(r.marketCapRaw))}</td>
                                        <td className="px-4 py-3 text-xs text-white/50">
                                            {r.mergedFrom?.length ? r.mergedFrom.map((x) => `${x.exchange}:${x.symbol}`).join(", ") : "—"}
                                        </td>
                                    </tr>
                                ))}
                                {!rows.length && !loading ? (
                                    <tr>
                                        <td className="p-3 text-sm opacity-70" colSpan={10}>No data</td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
