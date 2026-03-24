import type { TerminalOrderSide, TerminalScalpMarketDto } from "@/src/shared/model/terminal/contracts";

function toNumber(value?: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function StatePanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel2)] px-4 py-10 text-center">
      <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
      <div className="mt-2 text-sm text-[var(--muted)]">{body}</div>
    </div>
  );
}

export function DomLadder({
  market,
  loading,
  error,
  entryPrice,
  entrySide,
  slPrice,
  tpPrice,
  onSelectLevel,
  embedded = false,
}: {
  market: TerminalScalpMarketDto | null;
  loading: boolean;
  error: string | null;
  entryPrice?: string;
  entrySide?: TerminalOrderSide;
  slPrice?: string;
  tpPrice?: string;
  onSelectLevel?: (selection: { price: string; side: TerminalOrderSide }) => void;
  embedded?: boolean;
}) {
  const Wrapper = embedded ? "div" : "section";
  const maxBidSize = market ? Math.max(...market.dom.map((row) => toNumber(row.bidSize)), 1) : 1;
  const maxAskSize = market ? Math.max(...market.dom.map((row) => toNumber(row.askSize)), 1) : 1;

  return (
    <Wrapper className={embedded ? "min-h-[380px]" : "rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadowSm)]"}>
      <div className={embedded ? "border-b border-[var(--border)]/50 pb-1" : "border-b border-[var(--border)] pb-4"}>
        <div className="flex flex-wrap items-center gap-2 text-[10px] tracking-[0.08em] text-[var(--muted2)]">
          <span className="font-semibold uppercase">BOOK</span>
          <span className="text-emerald-200">{`Bid ${market?.bestBid ?? "--"}`}</span>
          <span className="text-rose-200">{`Ask ${market?.bestAsk ?? "--"}`}</span>
          <span className="text-[var(--muted)]">{`Spread ${market?.spread ?? "--"}`}</span>
        </div>
      </div>

      <div className={embedded ? "mt-1" : "mt-4"}>
        {loading ? <StatePanel title="Loading DOM" body="Preparing demo-safe ladder rows for the active terminal symbol." /> : null}
        {!loading && error ? <StatePanel title="DOM unavailable" body={error} /> : null}
        {!loading && !error && !market ? <StatePanel title="No ladder data" body="No scalp market snapshot is available for this symbol yet." /> : null}
        {!loading && !error && market ? (
          <div className="overflow-hidden rounded-lg border border-[var(--border)]/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.015),transparent)]">
            <div className="divide-y divide-[var(--border)]/45">
              {market.dom.map((row) => {
                const isBestBid = row.price === market.bestBid;
                const isBestAsk = row.price === market.bestAsk;
                const bidSelected = entryPrice === row.price && entrySide === "BUY";
                const askSelected = entryPrice === row.price && entrySide === "SELL";
                const hasEntryMarker = bidSelected || askSelected;
                const hasSlMarker = slPrice === row.price;
                const hasTpMarker = tpPrice === row.price;
                const bidWidth = `${Math.max(0, Math.min(100, (toNumber(row.bidSize) / maxBidSize) * 100)).toFixed(2)}%`;
                const askWidth = `${Math.max(0, Math.min(100, (toNumber(row.askSize) / maxAskSize) * 100)).toFixed(2)}%`;

                return (
                  <div
                    key={`${row.price}-${row.bidSize ?? "0"}-${row.askSize ?? "0"}`}
                    className={[
                      "relative grid grid-cols-[minmax(0,1fr)_74px] items-stretch gap-0 text-[11px]",
                      hasSlMarker
                        ? "bg-amber-500/7"
                        : hasTpMarker
                          ? "bg-emerald-500/7"
                          : hasEntryMarker
                            ? "bg-sky-500/7"
                            : isBestAsk
                              ? "bg-rose-500/6"
                              : isBestBid
                                ? "bg-emerald-500/6"
                                : "bg-transparent",
                      ].join(" ")}
                    >
                    <div className="relative min-w-0">
                      {row.askSize ? (
                        <button
                          type="button"
                          onClick={() => onSelectLevel?.({ price: row.price, side: "SELL" })}
                          className={[
                            "absolute inset-x-0 top-0 flex h-1/2 items-center justify-end overflow-hidden px-1.5 pr-1.5 text-right font-medium transition-colors",
                            hasEntryMarker && entrySide === "SELL"
                              ? "bg-sky-500/14 text-sky-200"
                              : isBestAsk
                                ? "bg-rose-500/10 text-rose-100"
                                : "text-rose-200 hover:bg-rose-500/8",
                          ].join(" ")}
                        >
                          <span className="absolute inset-y-0 right-0 bg-rose-500/22" style={{ width: askWidth }} />
                          <span className="relative z-10 flex min-w-0 items-baseline justify-end gap-1.5">
                            <span className="truncate text-[10px] text-[var(--muted2)]">{row.askTotal ?? ""}</span>
                            <span>{row.askSize}</span>
                          </span>
                        </button>
                      ) : null}

                      {row.bidSize ? (
                        <button
                          type="button"
                          onClick={() => onSelectLevel?.({ price: row.price, side: "BUY" })}
                          className={[
                            "absolute inset-x-0 bottom-0 flex h-1/2 items-center justify-end overflow-hidden px-1.5 pr-1.5 text-right font-medium transition-colors",
                            hasEntryMarker && entrySide === "BUY"
                              ? "bg-sky-500/14 text-sky-200"
                              : isBestBid
                                ? "bg-emerald-500/10 text-emerald-100"
                                : "text-emerald-200 hover:bg-emerald-500/8",
                          ].join(" ")}
                        >
                          <span className="absolute inset-y-0 right-0 bg-emerald-500/22" style={{ width: bidWidth }} />
                          <span className="relative z-10 flex min-w-0 items-baseline justify-end gap-1.5">
                            <span className="truncate text-[10px] text-[var(--muted2)]">{row.bidTotal ?? ""}</span>
                            <span>{row.bidSize}</span>
                          </span>
                        </button>
                      ) : null}

                      {!row.askSize && !row.bidSize ? <span className="block h-[24px]" /> : null}
                    </div>

                    <div
                      className={[
                        "relative flex flex-col items-center justify-center border-l border-[var(--border)]/55 bg-[var(--panel)]/84 px-1 py-0.5",
                        isBestAsk ? "shadow-[inset_0_0_0_1px_rgba(244,63,94,0.14)]" : "",
                        isBestBid ? "shadow-[inset_0_0_0_1px_rgba(16,185,129,0.14)]" : "",
                      ].join(" ")}
                    >
                      {hasEntryMarker ? <span className="absolute inset-y-0 left-0 w-[2px] bg-sky-400/80" /> : null}
                      {hasSlMarker ? <span className="absolute inset-y-0 right-0 w-[2px] bg-amber-400/80" /> : null}
                      {hasTpMarker ? <span className="absolute inset-y-0 right-0 w-[2px] bg-emerald-400/80" /> : null}

                      <div
                        className={[
                          "text-[11px] font-semibold tracking-[0.11em]",
                          hasEntryMarker
                            ? "text-sky-100"
                            : hasSlMarker
                              ? "text-amber-100"
                              : hasTpMarker
                                ? "text-emerald-100"
                                : isBestAsk
                                  ? "text-rose-100"
                                  : isBestBid
                                    ? "text-emerald-100"
                                    : "",
                        ].join(" ")}
                      >
                        {row.price}
                      </div>

                      {hasEntryMarker || hasSlMarker || hasTpMarker ? (
                        <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1">
                          {hasEntryMarker ? (
                            <span className="rounded-full border border-sky-400/35 bg-sky-500/10 px-1 py-0.5 text-[8px] font-medium text-sky-200">
                              ENTRY
                            </span>
                          ) : null}
                          {hasSlMarker ? (
                            <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-1 py-0.5 text-[8px] font-medium text-amber-200">
                              SL
                            </span>
                          ) : null}
                          {hasTpMarker ? (
                            <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-1 py-0.5 text-[8px] font-medium text-emerald-200">
                              TP
                            </span>
                          ) : null}
                        </div>
                      ) : isBestAsk ? (
                        <span className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.12em] text-rose-300">Ask</span>
                      ) : isBestBid ? (
                        <span className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.12em] text-emerald-300">Bid</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </Wrapper>
  );
}
