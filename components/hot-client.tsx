"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TopbarControlsSlot from "@/components/shell/topbar-controls-slot";
import { Search, SlidersHorizontal, ArrowUpDown, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SymbolDrawer } from "@/components/symbol-drawer";
import { HotTable, useHot } from "@/src/widgets/hot-table";
import type { HotRow as HotSymbol, HotTf as TF } from "@/src/entities/hot";
import { sanitizeExchange, sanitizeSpikeMode, sanitizeTf, tfLabel } from "@/src/features/hot-filters";
import { StatusStrip } from "@/src/features/status-strip";

type SortKey = "score" | "symbol" | "price" | "changePercent" | "volume" | "volSpike" | "signal";
type SortDir = "asc" | "desc";

type SignalEvent = {
  id: string;
  ts: number;
  symbol: string;
  signal: string;
  tf: TF;
  price: number;
  changePercent: number;
  volSpike: number | null;
  source?: "klines" | "fallback";
};

function parseVolume(v: unknown) {
  const s = String(v ?? "").trim().toUpperCase();
  const num = Number(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num)) return 0;
  if (s.endsWith("B")) return num * 1_000_000_000;
  if (s.endsWith("M")) return num * 1_000_000;
  if (s.endsWith("K")) return num * 1_000;
  return num;
}

function getSortValue(row: HotSymbol, key: SortKey): string | number {
  switch (key) {
    case "symbol":
      return (row.symbol ?? "").toUpperCase();
    case "signal":
      return (row.signal ?? "").toUpperCase();
    case "price":
      return Number(row.price ?? 0);
    case "changePercent":
      return Number(row.changePercent ?? 0);
    case "volume":
      return parseVolume(row.volume ?? "");
    case "volSpike":
      return row.volSpike == null ? 0 : Number(row.volSpike);
    case "score":
      return Number(row.score ?? 0);
    default:
      return "";
  }
}

function fmtVol(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

function parseVolInput(text: string): number | null {
  const s = String(text ?? "").trim().toLowerCase();
  if (!s) return 0;

  const m = s.match(/^([0-9]*\.?[0-9]+)\s*([kmb])?$/i);
  if (!m) return null;

  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;

  const suf = (m[2] || "").toLowerCase();
  if (suf === "b") return Math.round(v * 1_000_000_000);
  if (suf === "m") return Math.round(v * 1_000_000);
  if (suf === "k") return Math.round(v * 1_000);

  return Math.round(v);
}

function ageLabel(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function isStrongSignal(sig: string) {
  return sig === "Whale Activity" || sig === "Big Move" || sig === "Dump" || sig === "Breakout";
}

function feedSignalBadgeClass(signal: string) {
  switch (signal) {
    case "Breakout":
      return "border-emerald-400/45 bg-emerald-400/14 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.18)]";
    case "Big Move":
      return "border-green-400/45 bg-green-400/14 text-green-200 shadow-[0_0_16px_rgba(74,222,128,0.16)]";
    case "Reversal Up":
      return "border-teal-400/45 bg-teal-400/14 text-teal-200 shadow-[0_0_16px_rgba(45,212,191,0.16)]";
    case "Reversal Down":
      return "border-fuchsia-400/45 bg-fuchsia-400/14 text-fuchsia-200 shadow-[0_0_16px_rgba(232,121,249,0.14)]";
    case "Dump":
      return "border-rose-400/45 bg-rose-400/14 text-rose-200 shadow-[0_0_16px_rgba(251,113,133,0.14)]";
    case "Whale Activity":
      return "border-amber-400/55 bg-amber-400/14 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.14)]";
    case "Watch":
      return "border-sky-400/55 bg-sky-400/14 text-sky-200 shadow-[0_0_16px_rgba(56,189,248,0.14)]";
    case "Calm":
      return "border-white/10 bg-white/5 text-white/65";
    default:
      return "border-white/10 bg-white/5 text-white/65";
  }
}

export function HotClient({
  initialRows,
  initialTf,
}: {
  initialRows: HotSymbol[];
  initialTf?: TF;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [minMcapB, setMinMcapB] = useState<number>(0);
  const [topVolSpike, setTopVolSpike] = useState<boolean>(false);
  const [minVolText, setMinVolText] = useState<string>("0");

  const [feed, setFeed] = useState<SignalEvent[]>([]);
  const [feedPaused, setFeedPaused] = useState(false);
  const [onlyStrong, setOnlyStrong] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const prevSignalRef = useRef<Map<string, string>>(new Map());
  const lastEventTsRef = useRef<Map<string, number>>(new Map());
  const FEED_MAX = 120;
  const COOLDOWN_MS = 120_000;
  const feedScrollRef = useRef<HTMLDivElement | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<HotSymbol | null>(null);

  const {
    rows,
    tf,
    setTf,
    exchange,
    setExchange,
    spikeMode,
    setSpikeMode,
    minVol,
    setMinVol,
    loading,
    lastTs,
    error,
    streamError,
    rateLimitedUntilTs,
    streamConnected,
    degraded,
    autoRefresh,
    setAutoRefresh,
    intervalSec,
    setIntervalSec,
    refresh,
  } = useHot({ initialRows, initialTf });

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const el = feedScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [feed.length]);

  useEffect(() => {
    setMinVolText(String(minVol));
  }, [minVol]);

  const pushFeedEvents = useCallback(
    (tfSafe: TF, data: HotSymbol[]) => {
      if (feedPaused) return;

      const prev = prevSignalRef.current;
      const lastEv = lastEventTsRef.current;
      const tsNow = Date.now();

      const newEvents: SignalEvent[] = [];

      for (const r of data) {
        const sym = String(r.symbol);
        const sig = String(r.signal ?? "Calm");

        if (!sig || sig === "Calm" || sig === "—") {
          prev.set(sym, sig);
          continue;
        }

        const prevSig = prev.get(sym);
        const changed = prevSig !== sig;

        const lastEventTs = lastEv.get(sym) ?? 0;
        const inCooldown = tsNow - lastEventTs < COOLDOWN_MS;

        if (changed && !inCooldown) {
          lastEv.set(sym, tsNow);
          newEvents.push({
            id: `${tsNow}:${sym}:${sig}`,
            ts: tsNow,
            symbol: sym,
            signal: sig,
            tf: tfSafe,
            price: Number(r.price ?? 0),
            changePercent: Number(r.changePercent ?? 0),
            volSpike: r.volSpike ?? null,
            source: r.source,
          });
        }

        prev.set(sym, sig);
      }

      if (newEvents.length) {
        setFeed((old) => {
          const merged = [...newEvents.reverse(), ...old];
          return merged.slice(0, FEED_MAX);
        });
      }
    },
    [feedPaused]
  );

  useEffect(() => {
    pushFeedEvents(tf, rows);
  }, [rows, tf, pushFeedEvents]);

  useEffect(() => {
    if (!drawerOpen || !selectedRow?.symbol) return;
    const updated = rows.find((x) => x.symbol === selectedRow.symbol);
    if (updated) setSelectedRow(updated);
  }, [rows, drawerOpen, selectedRow]);

  const { filteredSorted, missingMcapCount } = useMemo(() => {
    const needle = q.trim().toUpperCase();

    const filteredByText = needle
      ? rows.filter((r) => {
        const sym = (r.symbol ?? "").toUpperCase();
        const sig = (r.signal ?? "").toUpperCase();
        return sym.includes(needle) || sig.includes(needle);
      })
      : rows;

    const minMcapRaw = Math.max(0, Number(minMcapB) || 0) * 1_000_000_000;
    let missing = 0;

    const filtered =
      minMcapRaw > 0
        ? filteredByText.filter((r) => {
          const m = Number(r.marketCapRaw);
          if (!Number.isFinite(m)) {
            missing++;
            return true;
          }
          return m >= minMcapRaw;
        })
        : filteredByText;

    const effectiveKey: SortKey = topVolSpike ? "volSpike" : sortKey;
    const effectiveDir: SortDir = topVolSpike ? "desc" : sortDir;
    const dir = effectiveDir === "asc" ? 1 : -1;

    const sorted = [...filtered].sort((a, b) => {
      const av = getSortValue(a, effectiveKey);
      const bv = getSortValue(b, effectiveKey);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });

    if (minMcapRaw === 0) {
      missing = filteredByText.reduce((acc, r) => {
        const m = Number(r.marketCapRaw);
        return acc + (Number.isFinite(m) ? 0 : 1);
      }, 0);
    }

    return { filteredSorted: sorted, missingMcapCount: missing };
  }, [rows, q, minMcapB, topVolSpike, sortKey, sortDir]);

  const filteredFeed = useMemo(() => {
    const list = onlyStrong ? feed.filter((e) => isStrongSignal(e.signal)) : feed;
    return list.slice(0, 60);
  }, [feed, onlyStrong]);

  const clearFilters = useCallback(() => {
    setQ("");
    setMinMcapB(0);
    setTopVolSpike(false);
    setSortKey("score");
    setSortDir("desc");
    setMinVol(0);
  }, [setMinVol]);

  const clearFeed = useCallback(() => {
    setFeed([]);
    prevSignalRef.current = new Map();
    lastEventTsRef.current = new Map();
  }, []);

  const Controls = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-[320px] max-w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol or signal…" className="pl-9" />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-white/50">Exchange</span>
        <select
          value={exchange}
          onChange={(e) => setExchange(sanitizeExchange(e.target.value, "binance"))}
          className="rounded-xl border border-white/10 bg-[rgb(var(--bg-2))] px-3 py-2 text-sm text-white/80 outline-none focus:border-[rgba(var(--accent),0.35)]"
        >
          <option value="binance">binance</option>
          <option value="mexc">mexc</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-white/50">Period</span>
        <select
          value={tf}
          onChange={(e) => setTf(sanitizeTf(e.target.value, "24h"))}
          className="rounded-xl border border-white/10 bg-[rgb(var(--bg-2))] px-3 py-2 text-sm text-white/80 outline-none focus:border-[rgba(var(--accent),0.35)]"
        >
          <option value="1m">1m</option>
          <option value="5m">5m</option>
          <option value="15m">15m</option>
          <option value="1h">1h</option>
          <option value="4h">4h</option>
          <option value="1d">1d</option>
          <option value="1w">1w</option>
          <option value="1M">1M</option>
          <option value="1y">1y</option>
          <option value="24h">24h (ticker)</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-white/50">VolSpike mode</span>
        <select
          value={spikeMode}
          onChange={(e) => setSpikeMode(sanitizeSpikeMode(e.target.value, "pulse"))}
          className="rounded-xl border border-white/10 bg-[rgb(var(--bg-2))] px-3 py-2 text-sm text-white/80 outline-none focus:border-[rgba(var(--accent),0.35)]"
        >
          <option value="pulse">Pulse</option>
          <option value="scalp">Scalp</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/50">Min Vol (24h)</span>

        <input
          type="range"
          min={0}
          max={200_000_000}
          step={100_000}
          value={minVol}
          onChange={(e) => setMinVol(Number(e.target.value) || 0)}
          className="w-[200px]"
          title="Min quote volume (24h) in USDT"
        />

        <div className="flex items-center gap-2">
          <Input
            value={minVolText}
            onChange={(e) => setMinVolText(e.target.value)}
            onBlur={() => {
              const parsed = parseVolInput(minVolText);
              if (parsed == null) {
                setMinVolText(String(minVol));
                return;
              }
              const v = Math.max(0, Math.min(200_000_000, parsed));
              setMinVol(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="w-[120px]"
            placeholder="e.g. 100k"
          />
          <span className="text-xs text-white/60 tabular-nums">{fmtVol(minVol)}</span>
        </div>

        <Button variant="ghost" onClick={() => setMinVol(0)} title="Reset min volume">
          <X className="h-4 w-4" />
          Reset
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-white/50">Min MCap (B)</span>
        <Input
          type="number"
          min={0}
          step={1}
          value={minMcapB}
          onChange={(e) => setMinMcapB(Number(e.target.value) || 0)}
          className="w-[110px]"
        />
        <Button variant="ghost" onClick={() => setMinMcapB(0)}>
          <X className="h-4 w-4" />
          Reset
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-4 w-4 text-white/40" />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-xl border border-white/10 bg-[rgb(var(--bg-2))] px-3 py-2 text-sm text-white/80 outline-none focus:border-[rgba(var(--accent),0.35)]"
          disabled={topVolSpike}
        >
          <option value="score">score</option>
          <option value="changePercent">% change</option>
          <option value="volSpike">vol spike</option>
          <option value="volume">volume</option>
          <option value="price">price</option>
          <option value="symbol">symbol</option>
          <option value="signal">signal</option>
        </select>

        <Button
          variant="secondary"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          disabled={topVolSpike}
          title="Toggle sort direction"
        >
          {sortDir === "asc" ? "↑" : "↓"}
        </Button>
      </div>

      <Button
        variant={topVolSpike ? "primary" : "secondary"}
        onClick={() => setTopVolSpike((v) => !v)}
        title="Sort by volume spike"
      >
        <Sparkles className="h-4 w-4" />
        Top by Vol Spike
      </Button>

      <Button variant="ghost" onClick={clearFilters} title="Clear all filters">
        <SlidersHorizontal className="h-4 w-4" />
        Clear
      </Button>

      <div className="ml-auto flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="h-4 w-4" />
          Auto
        </label>

        <select
          value={intervalSec}
          onChange={(e) => setIntervalSec(Number(e.target.value))}
          className="rounded-xl border border-white/10 bg-[rgb(var(--bg-2))] px-3 py-2 text-sm text-white/80 outline-none"
          disabled={!autoRefresh}
        >
          <option value={3}>3s</option>
          <option value={5}>5s</option>
          <option value={10}>10s</option>
          <option value={30}>30s</option>
        </select>

        <Button variant="secondary" onClick={() => void refresh()} title="Refresh now">
          <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
          {loading ? "Refreshing" : "Refresh"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <TopbarControlsSlot>
        <div className="hidden lg:block rounded-2xl border border-white/10 bg-[rgb(var(--bg-1))] px-5 py-4">{Controls}</div>
      </TopbarControlsSlot>

      <StatusStrip
        showEvents={false}
        input={{
          hot: {
            connected: streamConnected,
            lastTs,
            error: streamError,
            rateLimitedUntilTs,
          },
          events: {
            connected: false,
            lastTs: null,
            error: null,
            rateLimitedUntilTs: null,
          },
          alerts: {
            degraded,
          },
        }}
      />

      <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="font-medium text-slate-200">Signals Feed</div>

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={onlyStrong} onChange={(e) => setOnlyStrong(e.target.checked)} className="h-4 w-4" />
            Only strong
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={feedPaused} onChange={(e) => setFeedPaused(e.target.checked)} className="h-4 w-4" />
            Pause feed
          </label>

          <button
            type="button"
            onClick={clearFeed}
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs hover:border-slate-600"
          >
            Clear
          </button>

          <div className="ml-auto text-xs text-slate-500">
            {feed.length ? `Events: ${feed.length}` : "No events yet"} • Exchange:{" "}
            <span className="text-slate-300">{exchange}</span>
          </div>
        </div>

        {filteredFeed.length ? (
          <div ref={feedScrollRef} className="mt-3 grid gap-2 overflow-y-auto pr-1" style={{ maxHeight: "176px", scrollbarWidth: "thin" }}>
            {filteredFeed.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs"
                title={e.source === "fallback" ? "Fallback row" : undefined}
              >
                <div className="min-w-[90px] font-semibold text-slate-100">{e.symbol}</div>

                <span
                  className={[
                    "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-medium backdrop-blur",
                    "transition-shadow hover:shadow-[0_0_22px_rgba(255,255,255,0.06)]",
                    feedSignalBadgeClass(e.signal),
                  ].join(" ")}
                >
                  {e.signal}
                </span>

                <div className="text-slate-500">{ageLabel(nowTick - e.ts)} ago</div>

                <div className="text-slate-400">
                  Δ {e.tf}:{" "}
                  <span className={e.changePercent > 0 ? "text-emerald-400" : e.changePercent < 0 ? "text-rose-400" : ""}>
                    {Number.isFinite(e.changePercent) ? `${e.changePercent.toFixed(2)}%` : "—"}
                  </span>
                </div>

                <div className="text-slate-400">Spike: {e.volSpike == null ? "—" : `${e.volSpike.toFixed(2)}x`}</div>

                <div className="ml-auto text-slate-500">${Number.isFinite(e.price) ? e.price.toFixed(e.price >= 1 ? 4 : 8) : "—"}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-xs text-slate-500">
            Waiting for signals (anything except <span className="text-slate-300">Calm</span>). Cooldown per symbol:{" "}
            {Math.round(COOLDOWN_MS / 1000)}s.
          </div>
        )}
      </div>

      <div className="lg:hidden">{Controls}</div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>Rows: {filteredSorted.length}</span>
        {lastTs ? <span>Last update: {new Date(lastTs).toLocaleTimeString()}</span> : null}
        {minMcapB > 0 ? <span>Min MCap: {minMcapB}B</span> : null}
        {minVol > 0 ? <span>Min Vol: {fmtVol(minVol)}</span> : <span>Min Vol: off</span>}
        <span>Missing MCap: {missingMcapCount}</span>
        {topVolSpike ? <span>Sorting: volSpike desc</span> : null}
        {rateLimitedUntilTs && rateLimitedUntilTs > nowTick ? (
          <span className="text-amber-300">
            Rate limited - retry in {Math.ceil((rateLimitedUntilTs - nowTick) / 1000)}s
          </span>
        ) : null}
        {error ? <span className="text-rose-400">Error: {error}</span> : null}
      </div>

      <HotTable
        rows={filteredSorted}
        changeLabel={tfLabel(tf)}
        onRowClick={(row) => {
          setSelectedRow(row);
          setDrawerOpen(true);
        }}
      />

      <SymbolDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        row={selectedRow}
        tf={tf}
        feed={feed}
      />
    </div>
  );
}
