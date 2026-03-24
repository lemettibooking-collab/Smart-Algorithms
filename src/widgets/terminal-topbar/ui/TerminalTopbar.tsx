"use client";

import Link from "next/link";
import { useTerminalSession } from "@/src/entities/terminal-session";
import type { TerminalBootstrapResponse, TerminalExchange, TerminalMode } from "@/src/widgets/terminal-shell/model/types";

const MODE_OPTIONS: Array<{ value: TerminalMode; label: string; description: string }> = [
  { value: "chart", label: "Chart", description: "Multi-panel chart workspace" },
  { value: "scalp", label: "Scalp", description: "Fast execution ladder layout" },
];

function buildModeHref(symbol: string, exchange: TerminalExchange, mode: TerminalMode) {
  const params = new URLSearchParams({ symbol, exchange, mode });
  return `/terminal?${params.toString()}`;
}

function formatConnectionLabel(state: ReturnType<typeof useTerminalSession>["state"]["connectionState"]) {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function connectionTone(state: ReturnType<typeof useTerminalSession>["state"]["connectionState"]) {
  if (state === "connected") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  if (state === "connecting" || state === "reconnecting") return "border-sky-400/30 bg-sky-500/10 text-sky-200";
  if (state === "stale") return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  if (state === "disconnected") return "border-rose-400/30 bg-rose-500/10 text-rose-200";
  return "border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)]";
}

export function TerminalTopbar({ bootstrap }: { bootstrap: TerminalBootstrapResponse }) {
  const {
    state: { symbol, exchange, mode, tradeMode, connectionState },
  } = useTerminalSession();
  const compact = mode === "scalp";

  if (compact) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 shadow-[var(--shadowSm)]">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">
            <span className="rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2 py-0.5 normal-case text-[var(--muted)]">{exchange}</span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2 py-0.5 normal-case text-[var(--muted)]">{tradeMode}</span>
            <span className={`rounded-full border px-2 py-0.5 normal-case ${connectionTone(connectionState)}`}>
              {formatConnectionLabel(connectionState)}
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2 py-0.5 normal-case text-[var(--text)]">Scalp board</span>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-1">
            <div className="flex flex-wrap gap-1">
              {MODE_OPTIONS.map((option) => {
                const active = option.value === mode;
                return (
                  <Link
                    key={option.value}
                    href={buildModeHref(symbol, exchange, option.value)}
                    className={[
                      "min-w-[108px] rounded-lg px-2.5 py-1.5 text-left transition-colors",
                      active
                        ? "bg-[var(--panel)] text-[var(--text)] shadow-[var(--shadowSm)]"
                        : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
                    ].join(" ")}
                  >
                    <div className="text-xs font-semibold">{option.label}</div>
                    <div className="mt-0.5 text-[10px] leading-4 text-[var(--muted2)]">{option.description}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4 shadow-[var(--shadowSm)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted2)]">Trading workspace</div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-[var(--text)]" style={{ textShadow: "var(--titleTextShadow)" }}>
            Trading Terminal
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Terminal shell scaffold for future charting, execution and order workflow modules.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">Symbol</div>
              <div className="mt-1 text-sm font-semibold text-[var(--text)]">{symbol}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">Exchange</div>
              <div className="mt-1 inline-flex rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-xs font-medium text-[var(--text)]">
                {exchange}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">Trade mode</div>
              <div className="mt-1 text-sm font-semibold text-[var(--text)]">{tradeMode}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">Connection</div>
              <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${connectionTone(connectionState)}`}>
                {formatConnectionLabel(connectionState)}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-1">
            <div className="flex flex-wrap gap-1">
              {MODE_OPTIONS.map((option) => {
                const active = option.value === mode;
                return (
                  <Link
                    key={option.value}
                    href={buildModeHref(symbol, exchange, option.value)}
                    className={[
                      "min-w-[132px] rounded-lg px-3 py-2 text-left transition-colors",
                      active
                        ? "bg-[var(--panel)] text-[var(--text)] shadow-[var(--shadowSm)]"
                        : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
                    ].join(" ")}
                  >
                    <div className="text-sm font-semibold">{option.label}</div>
                    <div className="mt-0.5 text-[11px] leading-4 text-[var(--muted2)]">{option.description}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">Pinned</span>
        {bootstrap.terminal.pinnedSymbols.map((pinnedSymbol) => (
          <span
            key={pinnedSymbol}
            className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2.5 py-1 text-xs text-[var(--text)]"
          >
            {pinnedSymbol}
          </span>
        ))}
        {bootstrap.symbol ? (
          <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2.5 py-1 text-xs text-[var(--muted)]">
            {`${bootstrap.symbol.baseAsset}/${bootstrap.symbol.quoteAsset} • ${bootstrap.symbol.status}`}
          </span>
        ) : null}
        <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2.5 py-1 text-xs text-[var(--muted)]">
          {bootstrap.account.demo ? "Demo bootstrap" : "Live bootstrap"}
        </span>
      </div>
    </section>
  );
}
