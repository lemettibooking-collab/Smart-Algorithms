"use client";

import { useState } from "react";
import { useTerminalSession } from "@/src/entities/terminal-session";
import type { TerminalOrderDto, TerminalPnlPositionDto } from "@/src/shared/model/terminal/contracts";
import { useTerminalBottomPanels as useTerminalBottomPanelsData } from "@/src/widgets/terminal-bottom-panels/model/use-terminal-bottom-panels";

type BottomTab = "open-orders" | "history" | "balances" | "positions";

const TAB_OPTIONS: Array<{ key: BottomTab; label: string }> = [
  { key: "positions", label: "Positions" },
  { key: "open-orders", label: "Open Orders" },
  { key: "history", label: "History" },
  { key: "balances", label: "Balances" },
];

function formatUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PnlValue({ value }: { value: number | null | undefined }) {
  const tone =
    value == null
      ? "text-[var(--muted2)]"
      : value > 0
        ? "text-emerald-300"
        : value < 0
          ? "text-rose-300"
          : "text-[var(--text)]";

  return <span className={tone}>{formatUsd(value)}</span>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel2)] px-4 py-8 text-center">
      <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
      <div className="mt-2 text-sm text-[var(--muted)]">{body}</div>
    </div>
  );
}

function StatusPill({ value }: { value: TerminalOrderDto["status"] }) {
  return (
    <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
      {value}
    </span>
  );
}

function OrdersTable({
  orders,
  showCancel = false,
  isCancelling = false,
  onCancel,
}: {
  orders: TerminalOrderDto[];
  showCancel?: boolean;
  isCancelling?: boolean;
  onCancel?: (orderId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {orders.map((order) => (
        <div key={order.id} className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text)]">{order.symbol}</span>
              <span className="text-xs text-[var(--muted)]">{`${order.side} ${order.origQty}${order.price ? ` @ ${order.price}` : " @ market"}`}</span>
              <StatusPill value={order.status} />
            </div>
            <div className="mt-1 text-xs text-[var(--muted2)]">{`${order.type} • ${order.id} • ${new Date(order.createdAt).toLocaleString()}`}</div>
          </div>
          {showCancel && onCancel ? (
            <button
              type="button"
              disabled={isCancelling}
              onClick={() => onCancel(order.id)}
              className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">{label}</div>
      <div className="mt-2 text-lg font-semibold text-[var(--text)]">{value}</div>
      <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>
    </div>
  );
}

function PositionsList({ positions }: { positions: TerminalPnlPositionDto[] }) {
  return (
    <div className="space-y-2">
      {positions.map((position) => (
        <div key={position.symbol} className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text)]">{position.symbol}</span>
                <span className="text-[11px] text-[var(--muted2)]">{`${position.baseAsset}/${position.quoteAsset}`}</span>
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {`Qty ${position.quantity} • Avg ${position.avgEntryPrice ?? "—"} • Mark ${position.markPrice ?? "—"}`}
              </div>
            </div>
            <div className="text-right text-xs text-[var(--muted)]">
              <div>{`Value ${formatUsd(position.marketValueUsd)}`}</div>
              <div className="mt-1">
                Realized <PnlValue value={position.realizedPnlUsd} />
              </div>
              <div className="mt-1">
                Unrealized <PnlValue value={position.unrealizedPnlUsd} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TerminalBottomPanels({ refreshKey = 0 }: { refreshKey?: number }) {
  const [activeTab, setActiveTab] = useState<BottomTab>("balances");
  const {
    state: { symbol, exchange, tradeMode },
  } = useTerminalSession();
  const {
    balances,
    account,
    pnl,
    openOrders,
    historyOrders,
    isLoading,
    error,
    actionState,
    actionMessage,
    cancelOrder,
    cancelAll,
  } = useTerminalBottomPanelsData({
    exchange,
    symbol,
    tradeMode,
    refreshKey,
  });

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadowSm)]">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted2)]">Bottom panels</div>
          <div className="mt-1 text-sm text-[var(--muted)]">Workspace shell for orders, fills and balances.</div>
        </div>

        <div className="flex flex-wrap gap-2">
          {TAB_OPTIONS.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-[var(--border)] bg-[var(--panel2)] text-[var(--text)] shadow-[var(--shadowSm)]"
                    : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        {error ? (
          <div className="mb-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        ) : null}

        {actionMessage ? (
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-4 py-3 text-sm text-[var(--muted)]">{actionMessage}</div>
        ) : null}

        {isLoading ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel2)] px-4 py-8 text-center text-sm text-[var(--muted)]">
            Loading terminal panel data...
          </div>
        ) : null}

        {!isLoading && account && pnl ? (
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <SummaryCard label="Paper Equity" value={formatUsd(account.equityUsd)} hint={`Exchange: ${exchange}`} />
            <SummaryCard label="Realized PnL" value={<PnlValue value={pnl.realizedPnlUsd} />} hint="Paper-only realized result" />
            <SummaryCard
              label="Unrealized PnL"
              value={<PnlValue value={pnl.unrealizedPnlUsd} />}
              hint="Marked to current snapshot prices"
            />
          </div>
        ) : null}

        {!isLoading && activeTab === "positions" ? (
          pnl?.positions.length ? (
            <PositionsList positions={pnl.positions} />
          ) : (
            <EmptyState
              title="No paper positions yet"
              body="Positions will appear here after paper fills start building inventory on this exchange."
            />
          )
        ) : null}

        {!isLoading && activeTab === "open-orders" ? (
          openOrders.length ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-[var(--muted)]">{`Active demo orders for ${symbol}`}</div>
                <button
                  type="button"
                  disabled={!openOrders.length || actionState === "cancelling"}
                  onClick={() => {
                    void cancelAll();
                  }}
                  className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel all
                </button>
              </div>
              <OrdersTable
                orders={openOrders}
                showCancel
                isCancelling={actionState === "cancelling"}
                onCancel={(orderId) => {
                  void cancelOrder(orderId);
                }}
              />
            </div>
          ) : (
          <EmptyState
            title="No open orders yet"
            body={`No active demo orders for ${symbol} right now. Trade mode: ${tradeMode}.`}
          />
          )
        ) : null}

        {!isLoading && activeTab === "history" ? (
          historyOrders.length ? (
            <OrdersTable orders={historyOrders} />
          ) : (
            <EmptyState
              title="No execution history yet"
              body="No demo terminal activity has been recorded for this symbol yet."
            />
          )
        ) : null}

        {!isLoading && activeTab === "balances" ? (
          <div className="grid gap-3 md:grid-cols-3">
            {balances.map((balance) => (
              <div key={balance.asset} className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-4">
                <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">{balance.asset}</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text)]">{balance.free}</div>
                <div className="mt-1 text-sm text-[var(--muted)]">Locked: {balance.locked}</div>
                <div className="mt-1 text-xs text-[var(--muted2)]">
                  {balance.usdValue != null ? `Approx. $${balance.usdValue.toLocaleString()}` : "Demo-safe valuation"}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
