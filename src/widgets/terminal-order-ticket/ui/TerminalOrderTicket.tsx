"use client";

import { useTerminalSession } from "@/src/entities/terminal-session";
import type {
  TerminalBootstrapResponse,
  TerminalOrderSide,
  TerminalOrderType,
  TerminalSymbolMetaDto,
} from "@/src/shared/model/terminal/contracts";
import { useTerminalOrderTicket } from "@/src/widgets/terminal-order-ticket/model/use-terminal-order-ticket";

function SegmentedControl<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">{title}</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={[
              "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              option.value === value
                ? "border-[var(--border)] bg-[var(--panel2)] text-[var(--text)]"
                : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FieldControl({
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled = false,
  errors = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hint?: string;
  disabled?: boolean;
  errors?: string[];
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">{label}</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={[
          "mt-2 w-full rounded-xl border bg-[var(--panel2)] px-3 py-3 text-sm outline-none transition-colors",
          disabled ? "cursor-not-allowed text-[var(--muted2)]" : "text-[var(--text)]",
          errors.length ? "border-rose-400/70" : "border-[var(--border)] focus:border-sky-400/70",
        ].join(" ")}
      />
      {hint ? <div className="mt-2 text-xs text-[var(--muted2)]">{hint}</div> : null}
      {errors.length ? (
        <ul className="mt-2 space-y-1 text-xs text-rose-300">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TerminalOrderTicket({
  bootstrap,
  symbolMeta,
  symbolMetaLoading = false,
  symbolMetaError = null,
  onOrderSuccess,
}: {
  bootstrap: TerminalBootstrapResponse;
  symbolMeta: TerminalSymbolMetaDto | null;
  symbolMetaLoading?: boolean;
  symbolMetaError?: string | null;
  onOrderSuccess?: () => void;
}) {
  const {
    state: { symbol, exchange, tradeMode },
  } = useTerminalSession();
  const {
    side,
    type,
    quantity,
    price,
    validation,
    issuesByField,
    submitState,
    submitMessage,
    lastOrder,
    submitOrder,
    setSide,
    setType,
    setQuantity,
    setPrice,
  } = useTerminalOrderTicket({
    symbol,
    exchange,
    tradeMode,
    symbolMeta,
    onOrderSuccess,
  });

  const symbolMetaHints = [
    symbolMeta?.filters.tickSize ? `Tick ${symbolMeta.filters.tickSize}` : null,
    symbolMeta?.filters.stepSize ? `Step ${symbolMeta.filters.stepSize}` : null,
    symbolMeta?.filters.minQty ? `Min qty ${symbolMeta.filters.minQty}` : null,
    symbolMeta?.filters.minNotional ? `Min notional ${symbolMeta.filters.minNotional}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const sideOptions: Array<{ label: string; value: TerminalOrderSide }> = [
    { label: "Buy", value: "BUY" },
    { label: "Sell", value: "SELL" },
  ];
  const typeOptions: Array<{ label: string; value: TerminalOrderType }> = [
    { label: "Market", value: "MARKET" },
    { label: "Limit", value: "LIMIT" },
  ];
  const buyDisabled = !validation.ok || side !== "BUY";
  const sellDisabled = !validation.ok || side !== "SELL";
  const isSubmitting = submitState === "submitting";

  return (
    <aside className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadowSm)]">
      <div className="border-b border-[var(--border)] pb-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted2)]">Order ticket</div>
        <div className="mt-2 text-lg font-semibold text-[var(--text)]">{symbol}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2 py-0.5">{exchange}</span>
          <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2 py-0.5">{tradeMode}</span>
          <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2 py-0.5">
            {bootstrap.account.demo ? "Demo account" : "Live account"}
          </span>
        </div>
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-xs text-[var(--muted)]">
          {symbolMetaLoading ? "Loading symbol meta..." : symbolMetaError ? symbolMetaError : symbolMetaHints || "Symbol validation context is ready."}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <SegmentedControl title="Side" options={sideOptions} value={side} onChange={setSide} />
        <SegmentedControl title="Order type" options={typeOptions} value={type} onChange={setType} />
        <FieldControl
          label="Price"
          value={price}
          onChange={setPrice}
          placeholder={type === "LIMIT" ? "Enter limit price" : "Price not required for market orders"}
          disabled={type === "MARKET"}
          hint={type === "LIMIT" ? (symbolMeta?.filters.tickSize ? `Tick size ${symbolMeta.filters.tickSize}` : "Limit price validation will use symbol meta when available.") : "Market orders do not require a price in this shell."}
          errors={issuesByField.price}
        />
        <FieldControl
          label="Quantity"
          value={quantity}
          onChange={setQuantity}
          placeholder="Enter quantity"
          hint={symbolMeta?.filters.stepSize ? `Step size ${symbolMeta.filters.stepSize}${symbolMeta?.filters.minQty ? ` • Min qty ${symbolMeta.filters.minQty}` : ""}` : "Quantity validation will use symbol meta when available."}
          errors={issuesByField.quantity}
        />

        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">Quick size</div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {["10%", "25%", "50%", "100%"].map((preset) => (
              <button
                key={preset}
                type="button"
                className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {issuesByField.symbol?.length || issuesByField.general?.length ? (
          <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {[...(issuesByField.symbol ?? []), ...(issuesByField.general ?? [])].join(" ")}
          </div>
        ) : null}

        {submitMessage ? (
          <div
            className={[
              "rounded-xl px-3 py-2 text-xs",
              submitState === "success"
                ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                : submitState === "error"
                  ? "border border-rose-400/40 bg-rose-500/10 text-rose-200"
                  : "border border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)]",
            ].join(" ")}
          >
            <div>{submitMessage}</div>
            {lastOrder ? (
              <div className="mt-1 text-[11px] text-current/90">
                {`${lastOrder.side} ${lastOrder.origQty} ${lastOrder.symbol}${lastOrder.price ? ` @ ${lastOrder.price}` : " @ market"} • ${lastOrder.status}`}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => {
              if (!buyDisabled) void submitOrder();
            }}
            disabled={buyDisabled || isSubmitting}
            className={[
              "rounded-xl px-3 py-3 text-sm font-semibold text-white shadow-[var(--shadowSm)] transition-opacity",
              buyDisabled || isSubmitting ? "cursor-not-allowed bg-emerald-500/45 opacity-60" : "bg-emerald-500/90",
            ].join(" ")}
          >
            {isSubmitting && side === "BUY" ? "Submitting..." : "Submit Buy"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!sellDisabled) void submitOrder();
            }}
            disabled={sellDisabled || isSubmitting}
            className={[
              "rounded-xl px-3 py-3 text-sm font-semibold text-white shadow-[var(--shadowSm)] transition-opacity",
              sellDisabled || isSubmitting ? "cursor-not-allowed bg-rose-500/45 opacity-60" : "bg-rose-500/90",
            ].join(" ")}
          >
            {isSubmitting && side === "SELL" ? "Submitting..." : "Submit Sell"}
          </button>
        </div>
      </div>
    </aside>
  );
}
