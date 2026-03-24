"use client";

import { useEffect, useMemo, useState } from "react";
import { useTerminalSession } from "@/src/entities/terminal-session";
import type { TerminalBootstrapResponse } from "@/src/shared/model/terminal/contracts";
import { ScalpTerminalCard } from "@/src/widgets/terminal-scalp-workspace/ui/ScalpTerminalCard";
import {
  loadPersistedScalpBoard,
  savePersistedScalpBoard,
} from "@/src/widgets/terminal-scalp-workspace/model/persistence";
import type { ScalpOrderIntent, ScalpTerminalInstance } from "@/src/widgets/terminal-scalp-workspace/model/types";

function createDefaultIntent(quantity = "0.1"): ScalpOrderIntent {
  return {
    side: "BUY",
    type: "MARKET",
    quantity,
    price: "",
    source: "manual",
    actionMode: "ENTRY",
    slPrice: "",
    tpPrice: "",
  };
}

function pickNextSymbol(pinnedSymbols: string[], terminals: ScalpTerminalInstance[]) {
  const used = new Set(terminals.map((terminal) => terminal.symbol));
  const unused = pinnedSymbols.find((symbol) => !used.has(symbol));
  if (unused) return unused;
  return pinnedSymbols[terminals.length % pinnedSymbols.length] ?? "BTCUSDT";
}

function deriveNextTerminalIndex(terminals: ScalpTerminalInstance[]) {
  const maxIndex = terminals.reduce((currentMax, terminal) => {
    const match = terminal.id.match(/scalp-terminal-(\d+)$/);
    if (!match) return currentMax;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? Math.max(currentMax, parsed) : currentMax;
  }, 0);

  return maxIndex + 1;
}

export function TerminalScalpWorkspace({ bootstrap }: { bootstrap: TerminalBootstrapResponse }) {
  const {
    state: { symbol, exchange, tradeMode },
  } = useTerminalSession();

  const initialTerminals = useMemo<ScalpTerminalInstance[]>(
    () => [
      {
        id: "scalp-terminal-1",
        symbol,
        exchange,
        tradeMode,
        intent: createDefaultIntent(),
      },
    ],
    [exchange, symbol, tradeMode],
  );

  const [terminals, setTerminals] = useState<ScalpTerminalInstance[]>(() => {
    if (typeof window === "undefined") {
      return initialTerminals;
    }

    return (
      loadPersistedScalpBoard({
        defaultExchange: exchange,
        defaultTradeMode: tradeMode,
        defaultQuantity: "0.1",
      }) ?? initialTerminals
    );
  });
  const [nextTerminalIndex, setNextTerminalIndex] = useState(() => deriveNextTerminalIndex(terminals));

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      savePersistedScalpBoard(terminals);
    }, 200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [terminals]);

  function updateIntent(id: string, patch: Partial<ScalpOrderIntent>) {
    setTerminals((current) =>
      current.map((terminal) =>
        terminal.id === id
          ? {
              ...terminal,
              intent: {
                ...terminal.intent,
                ...patch,
              },
            }
          : terminal,
      ),
    );
  }

  function addTerminal() {
    setTerminals((current) => [
      ...current,
      {
        id: `scalp-terminal-${nextTerminalIndex}`,
        symbol: pickNextSymbol(bootstrap.terminal.pinnedSymbols, current),
        exchange,
        tradeMode,
        intent: createDefaultIntent(),
      },
    ]);
    setNextTerminalIndex((current) => current + 1);
  }

  function closeTerminal(id: string) {
    setTerminals((current) => current.filter((terminal) => terminal.id !== id));
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 shadow-[var(--shadowSm)]">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">Scalp board</div>
          <div className="mt-0.5 text-[11px] text-[var(--muted)]">{`${terminals.length} terminals in a horizontal strip.`}</div>
        </div>
        <button
          type="button"
          onClick={addTerminal}
          className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text)] hover:bg-[var(--panel)]"
        >
          Add terminal
        </button>
      </div>

      <div className="overflow-x-auto pb-2">
        {terminals.length ? (
          <div className="flex w-max min-w-0 flex-nowrap gap-3">
            {terminals.map((terminal) => (
              <ScalpTerminalCard
                key={terminal.id}
                terminal={terminal}
                bootstrap={bootstrap}
                onUpdateIntent={updateIntent}
                onClose={closeTerminal}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel)] px-4 py-8 text-center">
            <div className="text-sm font-semibold text-[var(--text)]">No scalp terminals open</div>
            <div className="mt-1 text-sm text-[var(--muted)]">Add a terminal to continue building the strip.</div>
            <button
              type="button"
              onClick={addTerminal}
              className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-1.5 text-[11px] font-medium text-[var(--text)] hover:bg-[var(--panel)]"
            >
              Add terminal
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
