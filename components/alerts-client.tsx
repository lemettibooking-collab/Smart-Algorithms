"use client";

import { useEffect, useMemo, useState } from "react";
import { EventsFeed, useEventsFeed } from "@/src/widgets/events-feed";
import { AlertsTable, useAlerts } from "@/src/widgets/alerts-table";
import { StatusStrip } from "@/src/features/status-strip";
import {
    ALERTS_PRESETS,
    DEFAULT_PRESET_ID,
    FILTERS_KEY,
    PRESET_ID_KEY,
    SIGNALS,
    getPresetById,
    isPresetId,
    signalFilterToToggles,
    togglesToSignalFilter,
    type AlertsPresetId,
    type FiltersState,
    type SignalFilter,
    type SortBy,
} from "@/src/features/alerts-presets";

type Mode = "table" | "events";

function asRecord(v: unknown): Record<string, unknown> | null {
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
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

    const alertsTable = useAlerts({
        enabled: mode === "table",
        auto,
        tf,
        includeCalm,
        onlyStrong,
        strongScore,
        minScore,
        limit,
        dedupe,
        sortBy,
        signalFilter,
    });
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

    function refresh() {
        if (mode === "events") return eventsFeed.refresh();
        return alertsTable.refresh();
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

    const kpi = useMemo(() => {
        const eventRows = eventsFeed.events;
        const sourceForMode = mode === "events" ? eventsFeed.sources : alertsTable.sources;
        const total = mode === "events" ? eventRows.length : alertsTable.rows.length;
        const nonCalm = (mode === "events" ? eventRows : alertsTable.rows).filter((r) => String(r.signal).toLowerCase() !== "calm").length;
        const src = (typeof sourceForMode === "object" && sourceForMode !== null ? sourceForMode : null) as Record<string, unknown> | null;
        const b = (typeof src?.binance === "object" && src?.binance !== null ? src.binance : null) as Record<string, unknown> | null;
        const m = (typeof src?.mexc === "object" && src?.mexc !== null ? src.mexc : null) as Record<string, unknown> | null;
        const degradedAny = !!(b?.degraded || m?.degraded);

        const wsB = b?.ws;
        const wsM = m?.ws;

        return { total, nonCalm, degradedAny, wsB, wsM };
    }, [mode, eventsFeed.events, eventsFeed.sources, alertsTable.rows, alertsTable.sources]);

    const displayErr = mode === "events" ? eventsFeed.err : alertsTable.err;
    const displayLoading = mode === "events" ? eventsFeed.loading : alertsTable.loading;

    return (
        <div className="space-y-3 text-sm text-[var(--muted)] dark:text-white/80">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--controlsBg)] p-3 shadow-[var(--shadowSm)] dark:border-white/10 dark:bg-[var(--panel)]">
                <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-1 dark:border-white/10 dark:bg-white/5">
                    <button
                        className={[
                            "rounded-md px-2 py-1 text-sm transition",
                            mode === "table"
                                ? "bg-[var(--panel2)] text-[var(--text)] dark:bg-white/10 dark:text-white/90"
                                : "text-[var(--muted)] hover:text-[var(--text)] dark:text-white/70 dark:hover:text-white/90",
                        ].join(" ")}
                        onClick={() => setMode("table")}
                        type="button"
                    >
                        Table
                    </button>
                    <button
                        className={[
                            "rounded-md px-2 py-1 text-sm transition",
                            mode === "events"
                                ? "bg-[var(--panel2)] text-[var(--text)] dark:bg-white/10 dark:text-white/90"
                                : "text-[var(--muted)] hover:text-[var(--text)] dark:text-white/70 dark:hover:text-white/90",
                        ].join(" ")}
                        onClick={() => setMode("events")}
                        type="button"
                    >
                        Events
                    </button>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-1 dark:border-white/10 dark:bg-white/5">
                    {ALERTS_PRESETS.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            className={[
                                "rounded-md border px-2 py-1 text-sm transition",
                                pendingPresetId === p.id
                                    ? "border-[var(--border)] bg-[var(--panel2)] text-[var(--text)] dark:border-white/20 dark:bg-white/10 dark:text-white/90"
                                    : "border-transparent text-[var(--muted)] hover:text-[var(--text)] dark:text-white/70 dark:hover:text-white/90",
                            ].join(" ")}
                            onClick={() => setPendingPresetId(p.id)}
                        >
                            {p.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        className="rounded-md border border-[var(--border)] bg-[var(--panel2)] px-2 py-1 text-sm text-[var(--text)] hover:bg-[var(--hover)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10 dark:focus:ring-white/20"
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

                <span className="text-xs text-[var(--muted2)] dark:text-white/50">Preset: {getPresetById(selectedPresetId).label}</span>

                <select
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)] placeholder:text-[var(--muted2)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:ring-white/20"
                    value={tf}
                    onChange={(e) => setTf(e.target.value)}
                >
                    {["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "1w", "1M"].map((x) => (
                        <option key={x} value={x}>{x}</option>
                    ))}
                </select>

                <label className="flex items-center gap-2 text-sm text-[var(--muted)] dark:text-white/80">
                    <input type="checkbox" checked={includeCalm} onChange={(e) => setIncludeCalm(e.target.checked)} />
                    include Calm
                </label>

                <label className="flex items-center gap-2 text-sm text-[var(--muted)] dark:text-white/80">
                    <input type="checkbox" checked={onlyStrong} onChange={(e) => setOnlyStrong(e.target.checked)} />
                    only strong
                </label>

                <label className="flex items-center gap-2 text-sm text-[var(--muted)] dark:text-white/80">
                    strongScore
                    <input
                        className="w-20 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)] placeholder:text-[var(--muted2)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:ring-white/20"
                        type="number"
                        step="0.1"
                        value={strongScore}
                        onChange={(e) => setStrongScore(Number(e.target.value))}
                        disabled={!onlyStrong}
                    />
                </label>

                <label className="flex items-center gap-2 text-sm text-[var(--muted)] dark:text-white/80">
                    minScore
                    <input
                        className="w-20 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)] placeholder:text-[var(--muted2)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:ring-white/20"
                        type="number"
                        step="0.1"
                        value={minScore}
                        onChange={(e) => setMinScore(Number(e.target.value))}
                        disabled={onlyStrong}
                    />
                </label>

                {mode === "table" ? (
                    <>
                        <label className="flex items-center gap-2 text-sm text-[var(--muted)] dark:text-white/80">
                            limit
                            <input
                                className="w-24 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)] placeholder:text-[var(--muted2)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:ring-white/20"
                                type="number"
                                step="10"
                                value={limit}
                                onChange={(e) => setLimit(Number(e.target.value))}
                            />
                        </label>

                        <label className="flex items-center gap-2 text-sm text-[var(--muted)] dark:text-white/80">
                            <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />
                            dedupe
                        </label>

                        <select
                            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)] placeholder:text-[var(--muted2)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:ring-white/20"
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
                        <label className="flex items-center gap-2 text-sm text-[var(--muted)] dark:text-white/80">
                            keep
                            <input
                                className="w-24 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)] placeholder:text-[var(--muted2)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:ring-white/20"
                                type="number"
                                step="5"
                                value={eventsLimit}
                                onChange={(e) => setEventsLimit(Number(e.target.value))}
                            />
                        </label>

                        <label className="flex items-center gap-2 text-sm text-[var(--muted)] dark:text-white/80">
                            scoreJump
                            <input
                                className="w-24 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)] placeholder:text-[var(--muted2)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:ring-white/20"
                                type="number"
                                step="0.1"
                                value={scoreJump}
                                onChange={(e) => setScoreJump(Number(e.target.value))}
                            />
                        </label>

                        <label className="flex items-center gap-2 text-sm text-[var(--muted)] dark:text-white/80">
                            cooldown(s)
                            <input
                                className="w-24 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)] placeholder:text-[var(--muted2)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:ring-white/20"
                                type="number"
                                step="10"
                                value={cooldownSec}
                                onChange={(e) => setCooldownSec(Number(e.target.value))}
                            />
                        </label>

                        <button
                            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-sm text-[var(--text)] hover:bg-[var(--hover)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10 dark:focus:ring-white/20"
                            onClick={clearEvents}
                            type="button"
                        >
                            Clear events
                        </button>
                    </>
                )}

                <label className="flex items-center gap-2 text-sm text-[var(--muted)] dark:text-white/80">
                    <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                    auto
                </label>

                <button
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-sm text-[var(--text)] placeholder:text-[var(--muted2)] hover:bg-[var(--hover)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/40 dark:hover:bg-white/10 dark:focus:ring-white/20"
                    onClick={refresh}
                    disabled={displayLoading}
                >
                    {displayLoading ? "Loading..." : "Refresh"}
                </button>
                {mode === "table" ? (
                    <button
                        className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-sm text-[var(--text)] hover:bg-[var(--hover)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10 dark:focus:ring-white/20"
                        onClick={() => alertsTable.clearRows()}
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
                                        ? "border-[var(--border)] bg-[var(--panel2)] text-[var(--text)] dark:border-white/20 dark:bg-white/10 dark:text-white/90"
                                        : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--text)] dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white/90",
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
                            className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--text)] dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white/90"
                            onClick={() => setSignalFilter([])}
                            title="Clear signal filters"
                        >
                            Clear signals
                        </button>
                    ) : null}
                </div>
            </div>

            {/* KPI */}
            <StatusStrip
                showHot={false}
                input={{
                    hot: {
                        connected: false,
                        lastTs: null,
                        error: null,
                        rateLimitedUntilTs: null,
                    },
                    events: {
                        connected: eventsFeed.eventsStreamLive,
                        lastTs: eventsFeed.lastEventTs,
                        error: eventsFeed.streamError,
                        rateLimitedUntilTs: eventsFeed.rateLimitedUntilTs,
                    },
                    alerts: {
                        degraded: kpi.degradedAny,
                        rateLimitedUntilTs: alertsTable.rateLimitedUntilTs,
                    },
                }}
            />

            <div className="grid gap-2 md:grid-cols-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)] dark:border-white/10 dark:bg-transparent dark:shadow-none">
                    <div className="text-xs text-[var(--muted2)] dark:opacity-70">{mode === "events" ? "Events" : "Rows"}</div>
                    <div className="text-lg font-semibold text-[var(--text)] dark:text-white/90">{kpi.total}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)] dark:border-white/10 dark:bg-transparent dark:shadow-none">
                    <div className="text-xs text-[var(--muted2)] dark:opacity-70">Signals (non-Calm)</div>
                    <div className="text-lg font-semibold text-[var(--text)] dark:text-white/90">{kpi.nonCalm}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)] dark:border-white/10 dark:bg-transparent dark:shadow-none">
                    <div className="text-xs text-[var(--muted2)] dark:opacity-70">Degraded</div>
                    <div className="text-lg font-semibold text-[var(--text)] dark:text-white/90">{kpi.degradedAny ? "YES" : "NO"}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)] dark:border-white/10 dark:bg-transparent dark:shadow-none">
                    <div className="text-xs text-[var(--muted2)] dark:opacity-70">WS Health</div>
                    <div className="text-sm text-[var(--muted)] dark:text-white/80">
                        <div>Binance: {((kpi.wsB as Record<string, unknown> | null)?.connected) ? "OK" : "—"}</div>
                        <div>MEXC: {((kpi.wsM as Record<string, unknown> | null)?.connected) ? "OK" : "—"}</div>
                    </div>
                </div>
            </div>

            {/* Body */}
            {mode === "events" ? (
                <EventsFeed events={eventsFeed.events} loading={displayLoading} />
            ) : (
                <AlertsTable rows={alertsTable.rows} wallsMap={alertsTable.wallsMap} loading={displayLoading} />
            )}
        </div>
    );
}
