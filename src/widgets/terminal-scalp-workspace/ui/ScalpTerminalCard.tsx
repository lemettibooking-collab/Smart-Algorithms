"use client";

import { useMemo } from "react";
import { useTerminalSymbolMeta } from "@/src/shared/lib/terminal/use-terminal-symbol-meta";
import { useTerminalScalpMarket } from "@/src/shared/lib/terminal/use-terminal-scalp-market";
import type {
  TerminalBootstrapResponse,
  TerminalOrderSide,
} from "@/src/shared/model/terminal/contracts";
import { DomLadder } from "@/src/widgets/dom-ladder";
import { ScalpQuickActions } from "@/src/widgets/scalp-quick-actions";
import { TapePanel } from "@/src/widgets/tape-panel";
import type { ScalpOrderIntent, ScalpTerminalInstance } from "@/src/widgets/terminal-scalp-workspace/model/types";

function hashString(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 1_000_003;
  }
  return hash;
}

function ScalpMiniChart({
  symbol,
  midPrice,
  entryPrice,
  slPrice,
  tpPrice,
}: {
  symbol: string;
  midPrice?: string;
  entryPrice?: string;
  slPrice?: string;
  tpPrice?: string;
}) {
  const numericMid = Number(midPrice);
  const numericEntry = Number(entryPrice);
  const numericSl = Number(slPrice);
  const numericTp = Number(tpPrice);
  const seriesPath = useMemo(() => {
    const hash = hashString(symbol);
    const points = Array.from({ length: 28 }, (_, index) => {
      const x = (index / 27) * 1000;
      const wave = Math.sin((index + hash % 7) / 3.5) * 36;
      const drift = ((hash % 17) - 8) * 1.2 + index * 0.9;
      const y = 120 - wave - drift;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return points.join(" ");
  }, [symbol]);

  const markerLevels = useMemo(() => {
    const values = [numericMid, numericEntry, numericSl, numericTp].filter((value) => Number.isFinite(value));
    if (!values.length) return [] as Array<{ label: string; value: string; top: number; tone: "entry" | "sl" | "tp" }>;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, Math.max(Math.abs(numericMid || 0) * 0.004, 1));
    const lower = min - range * 0.35;
    const upper = max + range * 0.35;

    function toTop(value: number) {
      const normalized = (value - lower) / Math.max(upper - lower, 0.0001);
      return 1 - Math.max(0, Math.min(1, normalized));
    }

    const markers: Array<{ label: string; value: string; top: number; tone: "entry" | "sl" | "tp" }> = [];
    if (entryPrice && Number.isFinite(numericEntry)) markers.push({ label: "ENTRY", value: entryPrice, top: toTop(numericEntry), tone: "entry" });
    if (slPrice && Number.isFinite(numericSl)) markers.push({ label: "SL", value: slPrice, top: toTop(numericSl), tone: "sl" });
    if (tpPrice && Number.isFinite(numericTp)) markers.push({ label: "TP", value: tpPrice, top: toTop(numericTp), tone: "tp" });
    return markers;
  }, [entryPrice, numericEntry, numericMid, numericSl, numericTp, slPrice, tpPrice]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[9px] uppercase tracking-[0.12em] text-[var(--muted2)]">Chart</div>
        <div className="flex flex-wrap gap-1 text-[9px] text-[var(--muted)]">
          {entryPrice ? <span className="rounded-full border border-sky-400/35 bg-sky-500/10 px-1.5 py-0.5 text-sky-200">Entry {entryPrice}</span> : null}
          {slPrice ? <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-1.5 py-0.5 text-amber-200">SL {slPrice}</span> : null}
          {tpPrice ? <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-200">TP {tpPrice}</span> : null}
        </div>
      </div>

      <div className="mt-1 overflow-hidden rounded-xl border border-[var(--border)]/50 bg-[var(--panel2)] p-1">
        <div className="relative h-[92px] overflow-hidden rounded-lg border border-[var(--border)]/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:38px_24px]" />
          <svg viewBox="0 0 1000 180" className="absolute inset-0 h-full w-full">
            <path d={seriesPath} fill="none" stroke="rgba(56,189,248,0.9)" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {markerLevels.map((marker) => (
            <div
              key={`${marker.label}-${marker.value}`}
              className="pointer-events-none absolute inset-x-2"
              style={{ top: `${Math.max(8, Math.min(92, marker.top * 100))}%` }}
            >
              <div
                className={[
                  "flex items-center justify-between gap-1 border-t border-dashed pt-0.5",
                  marker.tone === "entry"
                    ? "border-sky-400/45 text-sky-200"
                    : marker.tone === "sl"
                      ? "border-amber-400/45 text-amber-200"
                      : "border-emerald-400/45 text-emerald-200",
                ].join(" ")}
              >
                <span className="rounded-full border px-1 py-0.5 text-[8px] font-medium">{marker.label}</span>
                <span className="text-[8px] font-medium">{marker.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type ScalpTerminalCardProps = {
  terminal: ScalpTerminalInstance;
  bootstrap: TerminalBootstrapResponse;
  onUpdateIntent: (id: string, patch: Partial<ScalpOrderIntent>) => void;
  onClose: (id: string) => void;
};

export function ScalpTerminalCard({
  terminal,
  bootstrap,
  onUpdateIntent,
  onClose,
}: ScalpTerminalCardProps) {
  const { market, loading, error } = useTerminalScalpMarket({
    exchange: terminal.exchange,
    symbol: terminal.symbol,
  });
  const { symbolMeta } = useTerminalSymbolMeta({
    exchange: terminal.exchange,
    symbol: terminal.symbol,
    initialSymbolMeta: bootstrap.symbol,
  });

  function handleSelectLevel({ price, side }: { price: string; side: TerminalOrderSide }) {
    if (terminal.intent.actionMode === "SL") {
      onUpdateIntent(terminal.id, { slPrice: price, source: "dom" });
      return;
    }

    if (terminal.intent.actionMode === "TP") {
      onUpdateIntent(terminal.id, { tpPrice: price, source: "dom" });
      return;
    }

    onUpdateIntent(terminal.id, {
      side,
      type: "LIMIT",
      price,
      source: "dom",
    });
  }

  return (
    <article className="relative flex h-[646px] w-[392px] min-w-[392px] max-w-[392px] shrink-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-[var(--shadowSm)]">
      <button
        type="button"
        onClick={() => onClose(terminal.id)}
        aria-label={`Close ${terminal.symbol} scalp terminal`}
        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel2)] text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
      >
        x
      </button>
      <div className="mb-0.5 flex h-6 items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2 py-0.5 text-[10px] font-medium text-[var(--text)]">
            {terminal.symbol}
          </span>
          <span className="rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
            {terminal.tradeMode}
          </span>
        </div>
        <span className="pr-7 text-[9px] uppercase tracking-[0.12em] text-[var(--muted2)]">{terminal.exchange}</span>
      </div>

      <ScalpQuickActions
        symbol={terminal.symbol}
        exchange={terminal.exchange}
        tradeMode={terminal.tradeMode}
        symbolMeta={symbolMeta}
        intent={terminal.intent}
        onIntentChange={(patch) => onUpdateIntent(terminal.id, patch)}
        embedded
      />

      <div className="mt-1 flex flex-1 flex-col border-t border-[var(--border)] pt-1">
        <div className="grid gap-0 overflow-hidden rounded-xl border border-[var(--border)]/70 bg-[var(--panel2)] grid-cols-[minmax(0,1.95fr)_118px]">
          <div className="min-w-0 p-1">
            <DomLadder
              market={market}
              loading={loading}
              error={error}
              embedded
              entryPrice={terminal.intent.price}
              entrySide={terminal.intent.side}
              slPrice={terminal.intent.slPrice || undefined}
              tpPrice={terminal.intent.tpPrice || undefined}
              onSelectLevel={handleSelectLevel}
            />
          </div>
          <div className="border-l border-[var(--border)]/40 p-0.5">
            <TapePanel market={market} loading={loading} error={error} embedded />
          </div>
        </div>

        <div className="mt-1.5 border-t border-[var(--border)] pt-1.5">
          <ScalpMiniChart
            symbol={terminal.symbol}
            midPrice={market?.midPrice}
            entryPrice={terminal.intent.price || undefined}
            slPrice={terminal.intent.slPrice || undefined}
            tpPrice={terminal.intent.tpPrice || undefined}
          />
        </div>
      </div>
    </article>
  );
}
