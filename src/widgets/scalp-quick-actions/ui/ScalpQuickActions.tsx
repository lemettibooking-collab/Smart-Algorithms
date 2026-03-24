import type {
  TerminalExchange,
  TerminalOrderType,
  TerminalSymbolMetaDto,
  TerminalTradeMode,
} from "@/src/shared/model/terminal/contracts";
import { useScalpQuickActions } from "@/src/widgets/scalp-quick-actions/model/use-scalp-quick-actions";
import type { ScalpActionMode, ScalpOrderIntent } from "@/src/widgets/terminal-scalp-workspace/model/types";

type ScalpQuickActionsProps = {
  symbol: string;
  exchange: TerminalExchange;
  tradeMode: TerminalTradeMode;
  symbolMeta: TerminalSymbolMetaDto | null;
  intent: ScalpOrderIntent;
  onIntentChange: (patch: Partial<ScalpOrderIntent>) => void;
  embedded?: boolean;
};

function CompactToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={[
            "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            option.value === value
              ? "bg-[var(--panel)] text-[var(--text)] shadow-[var(--shadowSm)]"
              : "text-[var(--muted)] hover:text-[var(--text)]",
          ].join(" ")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MarkerBadge({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "entry" | "sl" | "tp" }) {
  return (
    <div
      className={[
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
        tone === "entry"
          ? "border-sky-400/35 bg-sky-500/10 text-sky-200"
          : tone === "sl"
            ? "border-amber-400/35 bg-amber-500/10 text-amber-200"
            : tone === "tp"
              ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
              : "border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)]",
      ].join(" ")}
    >
      <span className="uppercase tracking-[0.12em] text-[8px]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ActionButton({
  label,
  tone = "neutral",
  disabled = false,
  onClick,
}: {
  label: string;
  tone?: "neutral" | "buy" | "sell";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white shadow-[var(--shadowSm)] transition-opacity",
        disabled ? "cursor-not-allowed opacity-45" : "opacity-90",
        tone === "buy" ? "bg-emerald-500/85" : tone === "sell" ? "bg-rose-500/85" : "bg-slate-500/75",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export function ScalpQuickActions({
  symbol,
  exchange,
  tradeMode,
  symbolMeta,
  intent,
  onIntentChange,
  embedded = false,
}: ScalpQuickActionsProps) {
  const {
    draft,
    validation,
    issuesByField,
    actionState,
    actionMessage,
    lastOrder,
    submitIntent,
    cancelAll,
  } = useScalpQuickActions({
    symbol,
    exchange,
    tradeMode,
    symbolMeta,
    intent,
  });

  const isSubmitting = actionState === "submitting";
  const isCancelling = actionState === "cancelling";
  const quantityErrors = issuesByField.quantity ?? [];
  const priceErrors = issuesByField.price ?? [];
  const generalErrors = [...(issuesByField.symbol ?? []), ...(issuesByField.general ?? [])];
  const typeOptions: Array<{ label: string; value: TerminalOrderType }> = [
    { label: "MKT", value: "MARKET" },
    { label: "LMT", value: "LIMIT" },
  ];
  const actionModeOptions: Array<{ label: string; value: ScalpActionMode }> = [
    { label: "ENTRY", value: "ENTRY" },
    { label: "SL", value: "SL" },
    { label: "TP", value: "TP" },
  ];
  const buyLabel = isSubmitting ? "Submitting..." : "Buy";
  const sellLabel = isSubmitting ? "Submitting..." : "Sell";
  const hasDraftMarkers = Boolean(intent.price || intent.slPrice || intent.tpPrice);

  return (
    <section
      className={
        embedded
          ? "px-0 py-0"
          : "rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2.5 shadow-[var(--shadowSm)]"
      }
    >
      <div className="flex flex-col gap-1 border-b border-[var(--border)] pb-1">
        <div className="grid grid-cols-[auto_auto_68px_96px] items-center gap-1">
          <CompactToggle
            value={intent.type}
            options={typeOptions}
            onChange={(value) =>
              onIntentChange({
                type: value,
                price: value === "MARKET" ? "" : intent.price,
                source: "manual",
              })
            }
          />

          <CompactToggle
            value={intent.actionMode}
            options={actionModeOptions}
            onChange={(value) => onIntentChange({ actionMode: value })}
          />

          <input
            value={intent.quantity}
            onChange={(event) => onIntentChange({ quantity: event.target.value })}
            placeholder="Qty"
            className={[
              "h-8 w-full rounded-lg border bg-[var(--panel2)] px-2 py-1 text-[11px] text-[var(--text)] outline-none transition-colors",
              quantityErrors.length ? "border-rose-400/70" : "border-[var(--border)] focus:border-sky-400/70",
            ].join(" ")}
          />

          <input
            value={intent.type === "LIMIT" ? intent.price : ""}
            onChange={(event) => onIntentChange({ price: event.target.value, source: "manual" })}
            disabled={intent.type !== "LIMIT"}
            placeholder="Price"
            className={[
              "h-8 w-full rounded-lg border bg-[var(--panel2)] px-2 py-1 text-[11px] text-[var(--text)] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-45",
              priceErrors.length ? "border-rose-400/70" : "border-[var(--border)] focus:border-sky-400/70",
            ].join(" ")}
          />
        </div>

        <div className="grid grid-cols-3 gap-1">
          <ActionButton
            label={buyLabel}
            tone="buy"
            disabled={!validation.ok || isSubmitting || isCancelling}
            onClick={() => {
              onIntentChange({ side: "BUY" });
              void submitIntent("BUY", draft.type);
            }}
          />
          <ActionButton
            label={sellLabel}
            tone="sell"
            disabled={!validation.ok || isSubmitting || isCancelling}
            onClick={() => {
              onIntentChange({ side: "SELL" });
              void submitIntent("SELL", draft.type);
            }}
          />
          <ActionButton
            label={isCancelling ? "Canceling..." : "Cancel All"}
            disabled={isSubmitting || isCancelling}
            onClick={() => {
              void cancelAll();
            }}
          />
        </div>

        {hasDraftMarkers ? (
          <div className="overflow-x-auto [scrollbar-width:none]">
            <div className="flex h-5 w-max items-center gap-1">
            {intent.price ? <MarkerBadge label="Entry" value={intent.price} tone="entry" /> : null}
            {intent.slPrice ? <MarkerBadge label="SL" value={intent.slPrice} tone="sl" /> : null}
            {intent.tpPrice ? <MarkerBadge label="TP" value={intent.tpPrice} tone="tp" /> : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-1 grid content-start gap-1">
        {quantityErrors.length ? (
          <ul className="space-y-1 text-[11px] text-rose-300">
            {quantityErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        {priceErrors.length ? (
          <ul className="space-y-1 text-[11px] text-rose-300">
            {priceErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        {generalErrors.length ? (
          <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-200">
            {generalErrors.join(" ")}
          </div>
        ) : null}
        {actionMessage ? (
          <div
            className={[
              "rounded-lg px-2 py-1.5 text-[10px]",
              actionState === "success"
                ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                : actionState === "error"
                  ? "border border-rose-400/40 bg-rose-500/10 text-rose-200"
                  : "border border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)]",
            ].join(" ")}
          >
            <div>{actionMessage}</div>
            {lastOrder ? (
              <div className="mt-1 text-[10px] text-current/90">
                {`${lastOrder.side} ${lastOrder.origQty} ${lastOrder.symbol}${lastOrder.price ? ` @ ${lastOrder.price}` : " @ market"} • ${lastOrder.status}`}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
