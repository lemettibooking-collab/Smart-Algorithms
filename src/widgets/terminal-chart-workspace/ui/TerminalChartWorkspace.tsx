"use client";

import { useState } from "react";
import { useTerminalSession } from "@/src/entities/terminal-session";
import { useTerminalSymbolMeta } from "@/src/shared/lib/terminal/use-terminal-symbol-meta";
import type { TerminalSymbolMetaDto } from "@/src/shared/model/terminal/contracts";
import type { TerminalBootstrapResponse } from "@/src/widgets/terminal-shell/model/types";
import { TerminalOrderTicket } from "@/src/widgets/terminal-order-ticket";
import { TerminalBottomPanels } from "@/src/widgets/terminal-bottom-panels";

function MetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}

function TerminalChartPanel({
  symbolMeta,
  symbolMetaLoading,
  symbolMetaError,
}: {
  symbolMeta: TerminalSymbolMetaDto | null;
  symbolMetaLoading: boolean;
  symbolMetaError: string | null;
}) {
  const {
    state: { symbol, exchange, connectionState },
  } = useTerminalSession();

  const filterSummary = [
    symbolMeta?.filters.tickSize ? `Tick ${symbolMeta.filters.tickSize}` : null,
    symbolMeta?.filters.stepSize ? `Step ${symbolMeta.filters.stepSize}` : null,
    symbolMeta?.filters.minQty ? `Min qty ${symbolMeta.filters.minQty}` : null,
    symbolMeta?.filters.minNotional ? `Min notional ${symbolMeta.filters.minNotional}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadowSm)]">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted2)]">Chart panel</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-[var(--text)]">{symbol}</h2>
            <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2 py-0.5 text-xs text-[var(--muted)]">
              {exchange}
            </span>
            <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2 py-0.5 text-xs text-[var(--muted)]">
              {connectionState}
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Chart shell ready for future TradingView or custom chart integration.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            "1m",
            "5m",
            "15m",
            "1h",
            "4h",
          ].map((timeframe, index) => (
            <button
              key={timeframe}
              type="button"
              className={[
                "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                index === 2
                  ? "border-[var(--border)] bg-[var(--panel2)] text-[var(--text)]"
                  : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
              ].join(" ")}
            >
              {timeframe}
            </button>
          ))}
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
          >
            Indicators
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetaBadge label="Base asset" value={symbolMetaLoading ? "Loading..." : symbolMeta?.baseAsset ?? "Unavailable"} />
        <MetaBadge label="Quote asset" value={symbolMetaLoading ? "Loading..." : symbolMeta?.quoteAsset ?? "Unavailable"} />
        <MetaBadge
          label="Status"
          value={symbolMetaLoading ? "Loading..." : symbolMeta?.status ?? (symbolMetaError ? "Error" : "Unavailable")}
        />
        <MetaBadge
          label="Filters"
          value={symbolMetaLoading ? "Loading current symbol meta..." : symbolMetaError ? symbolMetaError : filterSummary || "Waiting for meta"}
        />
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] p-4">
        <div className="relative min-h-[420px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel2)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:44px_44px]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(var(--accent),0.10),transparent)]" />
          <div className="absolute inset-x-5 top-5 flex items-center justify-between text-xs text-[var(--muted2)]">
            <span>{symbolMeta ? `${symbolMeta.baseAsset}/${symbolMeta.quoteAsset}` : symbol}</span>
            <span>Chart shell</span>
          </div>
          <div className="absolute inset-x-6 bottom-10 top-16 rounded-xl border border-dashed border-[var(--border)] bg-[linear-gradient(180deg,rgba(15,23,42,0.05),transparent)]">
            <svg viewBox="0 0 1000 360" className="h-full w-full">
              <path
                d="M0 260 C80 245 140 200 210 210 C280 220 310 120 385 130 C455 140 480 220 560 205 C640 190 690 105 770 120 C850 135 890 185 1000 150"
                fill="none"
                stroke="rgba(56,189,248,0.9)"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between text-xs text-[var(--muted2)]">
            <span>Price scale placeholder</span>
            <span>Volume and drawings will attach here later</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function TerminalChartWorkspace({ bootstrap }: { bootstrap: TerminalBootstrapResponse }) {
  const [panelsRefreshKey, setPanelsRefreshKey] = useState(0);
  const {
    state: { symbol, exchange },
  } = useTerminalSession();
  const {
    symbolMeta,
    loading: symbolMetaLoading,
    error: symbolMetaError,
  } = useTerminalSymbolMeta({
    exchange,
    symbol,
    initialSymbolMeta: bootstrap.symbol,
  });

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_340px]">
        <TerminalChartPanel
          symbolMeta={symbolMeta}
          symbolMetaLoading={symbolMetaLoading}
          symbolMetaError={symbolMetaError}
        />
        <TerminalOrderTicket
          bootstrap={bootstrap}
          symbolMeta={symbolMeta}
          symbolMetaLoading={symbolMetaLoading}
          symbolMetaError={symbolMetaError}
          onOrderSuccess={() => {
            setPanelsRefreshKey((current) => current + 1);
          }}
        />
      </div>
      <TerminalBottomPanels refreshKey={panelsRefreshKey} />
    </section>
  );
}
