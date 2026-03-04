"use client";

import { useEffect, useMemo, useState } from "react";
import { EventsFeed, useEventsFeed } from "@/src/widgets/events-feed";

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
    quoteVol24h?: number;

    marketCapRaw: number | null;
    marketCap?: string;

    logoUrl?: string | null;
    iconUrl?: string | null;

    mergedFrom?: Array<{ exchange: Exchange; symbol: string; score: number }>;
};

type Wall = {
    price: number;
    notional: number;
    distancePct: number;
    status: "NEW" | "HOLD" | "EATING" | "REMOVED";
};

type WallsResponse = {
    ts: number;
    data: Record<string, { bid?: Wall; ask?: Wall }>;
};

type AlertsResponse = {
    tf: string;
    ts: number;
    data: AlertRow[];
    sources?: unknown;
    error?: string;
};

const SIGNALS = ["Watch", "Whale Activity", "Big Move", "Dump", "Breakout", "Reversal"] as const;
type SignalFilter = (typeof SIGNALS)[number];

type SortBy = "score" | "change" | "change24h" | "spike";
type Mode = "table" | "events";
type AlertsPresetId = "conservative" | "balanced" | "scalp";
type SignalToggleKey = "whale" | "bigMove" | "dump" | "breakout" | "reversal" | "watch";
type SignalToggles = Record<SignalToggleKey, boolean>;
type FiltersState = {
    tf: string;
    includeCalm: boolean;
    onlyStrong: boolean;
    strongScore: number;
    minScore: number;
    keep: number;
    scoreJump: number;
    cooldownSec: number;
    signalToggles: SignalToggles;
    limit: number;
    dedupe: boolean;
    sortBy: SortBy;
};
type AlertsPreset = {
    id: AlertsPresetId;
    label: string;
    values: Partial<FiltersState>;
};

const PRESET_ID_KEY = "alerts:presetId";
const FILTERS_KEY = "alerts:filters";
const DEFAULT_PRESET_ID: AlertsPresetId = "balanced";

const ALERTS_PRESETS: AlertsPreset[] = [
    {
        id: "conservative",
        label: "Conservative",
        values: {
            tf: "1h",
            includeCalm: false,
            onlyStrong: true,
            strongScore: 6,
            minScore: 5,
            keep: 50,
            scoreJump: 2,
            cooldownSec: 180,
            signalToggles: { whale: false, bigMove: true, dump: true, breakout: true, reversal: true, watch: false },
        },
    },
    {
        id: "balanced",
        label: "Balanced",
        values: {
            tf: "15m",
            includeCalm: false,
            onlyStrong: true,
            strongScore: 4,
            minScore: 3,
            keep: 80,
            scoreJump: 1,
            cooldownSec: 90,
            signalToggles: { whale: true, bigMove: true, dump: true, breakout: true, reversal: true, watch: false },
        },
    },
    {
        id: "scalp",
        label: "Scalp",
        values: {
            tf: "5m",
            includeCalm: false,
            onlyStrong: false,
            strongScore: 4,
            minScore: 2,
            keep: 120,
            scoreJump: 0.5,
            cooldownSec: 60,
            signalToggles: { whale: true, bigMove: true, dump: false, breakout: true, reversal: true, watch: false },
        },
    },
];

function isPresetId(v: unknown): v is AlertsPresetId {
    return v === "conservative" || v === "balanced" || v === "scalp";
}

function getPresetById(id: AlertsPresetId) {
    return ALERTS_PRESETS.find((p) => p.id === id) ?? ALERTS_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!;
}

function signalFilterToToggles(signalFilter: SignalFilter[]): SignalToggles {
    const set = new Set(signalFilter);
    return {
        whale: set.has("Whale Activity"),
        bigMove: set.has("Big Move"),
        dump: set.has("Dump"),
        breakout: set.has("Breakout"),
        reversal: set.has("Reversal"),
        watch: set.has("Watch"),
    };
}

function togglesToSignalFilter(toggles: SignalToggles): SignalFilter[] {
    const out: SignalFilter[] = [];
    if (toggles.watch) out.push("Watch");
    if (toggles.whale) out.push("Whale Activity");
    if (toggles.bigMove) out.push("Big Move");
    if (toggles.dump) out.push("Dump");
    if (toggles.breakout) out.push("Breakout");
    if (toggles.reversal) out.push("Reversal");
    return out;
}

function asRecord(v: unknown): Record<string, unknown> | null {
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

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

function fmtCompact(n: number | null | undefined) {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v) || v <= 0) return "—";
    if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v.toFixed(0);
}

function errMsg(e: unknown) {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    return "Failed";
}

function BinanceMiniIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
            <path fill="currentColor" d="M12 2l3.5 3.5L12 9 8.5 5.5 12 2zm6.5 6.5L22 12l-3.5 3.5L15 12l3.5-3.5zM12 15l3.5 3.5L12 22l-3.5-3.5L12 15zM2 12l3.5-3.5L9 12l-3.5 3.5L2 12zm10-4l4 4-4 4-4-4 4-4z" />
        </svg>
    );
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
    const [selectedPresetId, setSelectedPresetId] = useState<AlertsPresetId>(DEFAULT_PRESET_ID);
    const [pendingPresetId, setPendingPresetId] = useState<AlertsPresetId>(DEFAULT_PRESET_ID);

    // events controls
    const [eventsLimit, setEventsLimit] = useState(80);
    const [scoreJump, setScoreJump] = useState(1.0);
    const [cooldownSec, setCooldownSec] = useState(90);

    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<AlertRow[]>([]);
    const [wallsMap, setWallsMap] = useState<Record<string, { bid?: Wall; ask?: Wall }>>({});
    const [sources, setSources] = useState<unknown>(null);
    const [err, setErr] = useState<string | null>(null);
    const eventsFeed = useEventsFeed({
        enabled: mode === "events",
        auto,
        tf,
        includeCalm,
        onlyStrong,
        strongScore,
        minScore,
        sortBy,
        signalFilter,
        eventsLimit,
        scoreJump,
        cooldownSec,
    });

    function applyFiltersState(values: Partial<FiltersState>) {
        if (typeof values.tf === "string") setTf(values.tf);
        if (typeof values.includeCalm === "boolean") setIncludeCalm(values.includeCalm);
        if (typeof values.onlyStrong === "boolean") setOnlyStrong(values.onlyStrong);
        if (typeof values.strongScore === "number" && Number.isFinite(values.strongScore)) setStrongScore(values.strongScore);
        if (typeof values.minScore === "number" && Number.isFinite(values.minScore)) setMinScore(values.minScore);
        if (typeof values.keep === "number" && Number.isFinite(values.keep)) setEventsLimit(values.keep);
        if (typeof values.scoreJump === "number" && Number.isFinite(values.scoreJump)) setScoreJump(values.scoreJump);
        if (typeof values.cooldownSec === "number" && Number.isFinite(values.cooldownSec)) setCooldownSec(values.cooldownSec);
        if (typeof values.limit === "number" && Number.isFinite(values.limit)) setLimit(values.limit);
        if (typeof values.dedupe === "boolean") setDedupe(values.dedupe);
        if (values.sortBy === "score" || values.sortBy === "change" || values.sortBy === "change24h" || values.sortBy === "spike") {
            setSortBy(values.sortBy);
        }
        if (values.signalToggles) {
            setSignalFilter(togglesToSignalFilter(values.signalToggles));
        }
    }

    function applyPresetById(id: AlertsPresetId) {
        const preset = getPresetById(id);
        applyFiltersState(preset.values);
        setSelectedPresetId(id);
    }

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

    async function loadTable() {
        setLoading(true);
        setErr(null);
        try {
            const r = await fetch(tableQuery, { cache: "no-store" });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const j: AlertsResponse = await r.json();
            if (j.error) setErr(j.error);
            const nextRows = Array.isArray(j.data) ? j.data : [];
            setRows(nextRows);
            setSources(j.sources ?? null);

            const symbols = Array.from(new Set(nextRows.map((x) => String(x.symbol ?? "").trim().toUpperCase()).filter(Boolean))).slice(0, 50);
            if (symbols.length === 0) {
                setWallsMap({});
            } else {
                try {
                    const wr = await fetch(`/api/walls?symbols=${encodeURIComponent(symbols.join(","))}`, { cache: "no-store" });
                    if (wr.ok) {
                        const wj = (await wr.json()) as WallsResponse;
                        const data = (typeof wj?.data === "object" && wj?.data !== null ? wj.data : {}) as Record<string, { bid?: Wall; ask?: Wall }>;
                        setWallsMap(data);
                    } else {
                        setWallsMap({});
                    }
                } catch {
                    setWallsMap({});
                }
            }
        } catch (e: unknown) {
            setErr(errMsg(e));
            setRows([]);
            setWallsMap({});
            setSources(null);
        } finally {
            setLoading(false);
        }
    }

    function refresh() {
        if (mode === "events") return eventsFeed.refresh();
        return loadTable();
    }

    function clearEvents() {
        eventsFeed.clearEvents();
    }

    useEffect(() => {
        if (typeof window === "undefined") return;

        const storedPresetRaw = window.localStorage.getItem(PRESET_ID_KEY);
        const storedPreset = isPresetId(storedPresetRaw) ? storedPresetRaw : DEFAULT_PRESET_ID;
        setSelectedPresetId(storedPreset);
        setPendingPresetId(storedPreset);

        const rawFilters = window.localStorage.getItem(FILTERS_KEY);
        if (!rawFilters) {
            applyPresetById(DEFAULT_PRESET_ID);
            setPendingPresetId(DEFAULT_PRESET_ID);
            window.localStorage.setItem(PRESET_ID_KEY, DEFAULT_PRESET_ID);
            return;
        }

        try {
            const parsed = JSON.parse(rawFilters) as unknown;
            const o = asRecord(parsed);
            if (!o) {
                applyPresetById(DEFAULT_PRESET_ID);
                setPendingPresetId(DEFAULT_PRESET_ID);
                window.localStorage.setItem(PRESET_ID_KEY, DEFAULT_PRESET_ID);
                return;
            }

            const st: Partial<FiltersState> = {};
            if (typeof o.tf === "string") st.tf = o.tf;
            if (typeof o.includeCalm === "boolean") st.includeCalm = o.includeCalm;
            if (typeof o.onlyStrong === "boolean") st.onlyStrong = o.onlyStrong;
            if (typeof o.strongScore === "number") st.strongScore = o.strongScore;
            if (typeof o.minScore === "number") st.minScore = o.minScore;
            if (typeof o.keep === "number") st.keep = o.keep;
            if (typeof o.scoreJump === "number") st.scoreJump = o.scoreJump;
            if (typeof o.cooldownSec === "number") st.cooldownSec = o.cooldownSec;
            if (typeof o.limit === "number") st.limit = o.limit;
            if (typeof o.dedupe === "boolean") st.dedupe = o.dedupe;
            if (o.sortBy === "score" || o.sortBy === "change" || o.sortBy === "change24h" || o.sortBy === "spike") {
                st.sortBy = o.sortBy;
            }
            const togglesObj = asRecord(o.signalToggles);
            if (togglesObj) {
                st.signalToggles = {
                    whale: !!togglesObj.whale,
                    bigMove: !!togglesObj.bigMove,
                    dump: !!togglesObj.dump,
                    breakout: !!togglesObj.breakout,
                    reversal: !!togglesObj.reversal,
                    watch: !!togglesObj.watch,
                };
            }

            applyFiltersState(st);
        } catch {
            applyPresetById(DEFAULT_PRESET_ID);
            setPendingPresetId(DEFAULT_PRESET_ID);
            window.localStorage.setItem(PRESET_ID_KEY, DEFAULT_PRESET_ID);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const filters: FiltersState = {
            tf,
            includeCalm,
            onlyStrong,
            strongScore,
            minScore,
            keep: eventsLimit,
            scoreJump,
            cooldownSec,
            signalToggles: signalFilterToToggles(signalFilter),
            limit,
            dedupe,
            sortBy,
        };
        window.localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    }, [tf, includeCalm, onlyStrong, strongScore, minScore, eventsLimit, scoreJump, cooldownSec, signalFilter, limit, dedupe, sortBy]);

    useEffect(() => {
        // при смене режима — делаем первичную загрузку
        if (mode === "table") loadTable();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, tableQuery]);

    useEffect(() => {
        if (!auto || mode !== "table") return;
        const id = setInterval(() => refresh(), 5000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auto, mode, tableQuery]);

    const kpi = useMemo(() => {
        const eventRows = eventsFeed.events;
        const sourceForMode = mode === "events" ? eventsFeed.sources : sources;
        const total = mode === "events" ? eventRows.length : rows.length;
        const nonCalm = (mode === "events" ? eventRows : rows).filter((r) => String(r.signal).toLowerCase() !== "calm").length;
        const src = (typeof sourceForMode === "object" && sourceForMode !== null ? sourceForMode : null) as Record<string, unknown> | null;
        const b = (typeof src?.binance === "object" && src?.binance !== null ? src.binance : null) as Record<string, unknown> | null;
        const m = (typeof src?.mexc === "object" && src?.mexc !== null ? src.mexc : null) as Record<string, unknown> | null;
        const degradedAny = !!(b?.degraded || m?.degraded);

        const wsB = b?.ws;
        const wsM = m?.ws;

        return { total, nonCalm, degradedAny, wsB, wsM };
    }, [mode, eventsFeed.events, eventsFeed.sources, rows, sources]);

    const displayErr = mode === "events" ? eventsFeed.err : err;
    const displayLoading = mode === "events" ? eventsFeed.loading : loading;

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

                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-1">
                    {ALERTS_PRESETS.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            className={[
                                "rounded-md border px-2 py-1 text-sm transition",
                                pendingPresetId === p.id
                                    ? "border-white/20 bg-white/10 text-white/90"
                                    : "border-transparent text-white/70 hover:text-white/90",
                            ].join(" ")}
                            onClick={() => setPendingPresetId(p.id)}
                        >
                            {p.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm text-white/80 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/20"
                        onClick={() => {
                            applyPresetById(pendingPresetId);
                            if (typeof window !== "undefined") {
                                window.localStorage.setItem(PRESET_ID_KEY, pendingPresetId);
                            }
                        }}
                    >
                        Apply preset
                    </button>
                </div>

                <span className="text-xs text-white/50">Preset: {getPresetById(selectedPresetId).label}</span>

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
                    disabled={displayLoading}
                >
                    {displayLoading ? "Loading..." : "Refresh"}
                </button>
                {mode === "table" ? (
                    <button
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/20"
                        onClick={() => {
                            setRows([]);
                            setWallsMap({});
                            setErr(null);
                        }}
                        type="button"
                    >
                        Clear table
                    </button>
                ) : null}

                {displayErr ? <span className="text-sm text-red-400">{displayErr}</span> : null}

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
                <EventsFeed events={eventsFeed.events} loading={displayLoading} />
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
                                    <th className="px-4 py-3">Vol 24h</th>
                                    <th className="px-4 py-3">Densities</th>
                                    <th className="px-4 py-3">Score</th>
                                    <th className="px-4 py-3">Signal</th>
                                    <th className="px-4 py-3">VolSpike</th>
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
                                        <td className="px-4 py-3">{fmtCompact(r.quoteVol24h)}</td>
                                        <td className="px-4 py-3 text-xs">
                                            {(() => {
                                                const w = wallsMap[r.symbol];
                                                const badge = (status: Wall["status"]) => {
                                                    if (status === "NEW") return "rounded border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300";
                                                    if (status === "EATING") return "rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300";
                                                    if (status === "REMOVED") return "rounded border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300";
                                                    return "rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70";
                                                };
                                                if (!w?.bid && !w?.ask) return <span className="text-white/50">—</span>;
                                                return (
                                                    <div className="relative space-y-1 pl-6">
                                                        <span
                                                            className="absolute left-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded border border-white/10 bg-white/5"
                                                            title="Order book walls from Binance"
                                                        >
                                                            <BinanceMiniIcon className="h-3 w-3 text-yellow-400/90" />
                                                        </span>
                                                        {w.bid ? (
                                                            <div className="flex items-center gap-1">
                                                                <span>BID {fmtCompact(w.bid.notional)} @ -{w.bid.distancePct.toFixed(2)}%</span>
                                                                <span className={badge(w.bid.status)}>{w.bid.status}</span>
                                                            </div>
                                                        ) : null}
                                                        {w.ask ? (
                                                            <div className="flex items-center gap-1">
                                                                <span>ASK {fmtCompact(w.ask.notional)} @ +{w.ask.distancePct.toFixed(2)}%</span>
                                                                <span className={badge(w.ask.status)}>{w.ask.status}</span>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-4 py-3">{(r.score ?? 0).toFixed(2)}</td>
                                        <td className="px-4 py-3">{r.signal}</td>
                                        <td className="px-4 py-3">{r.volSpike == null ? "—" : `${r.volSpike.toFixed(2)}x`}</td>
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
