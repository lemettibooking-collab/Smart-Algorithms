import type { TerminalScalpMarketDto } from "@/src/shared/model/terminal/contracts";
import { mapTapeToExecutionStripRows } from "@/src/widgets/tape-panel/model/map-tape-to-execution-strip";

function StatePanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel2)] px-4 py-10 text-center">
      <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
      <div className="mt-2 text-sm text-[var(--muted)]">{body}</div>
    </div>
  );
}

export function TapePanel({
  market,
  loading,
  error,
  embedded = false,
}: {
  market: TerminalScalpMarketDto | null;
  loading: boolean;
  error: string | null;
  embedded?: boolean;
}) {
  const Wrapper = embedded ? "div" : "section";
  const stripRows = market ? mapTapeToExecutionStripRows(market.dom, market.tape) : [];

  return (
    <Wrapper className={embedded ? "h-full min-h-[380px]" : "rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadowSm)]"}>
      <div className={embedded ? "" : "mt-4"}>
        {loading ? <StatePanel title="Loading tape" body="Preparing a recent trade stream snapshot for the active symbol." /> : null}
        {!loading && error ? <StatePanel title="Tape unavailable" body={error} /> : null}
        {!loading && !error && !market ? <StatePanel title="No tape data" body="No recent trade snapshot is available yet." /> : null}
        {!loading && !error && market ? (
          <div className={embedded ? "overflow-hidden" : "overflow-hidden rounded-xl border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]"}>
            <div className="border-l border-[var(--border)]/30 divide-y divide-[var(--border)]/35">
              {stripRows.map((row) => {
                const trade = row.trade;
                const tone = trade?.side === "buy" ? "buy" : trade?.side === "sell" ? "sell" : "idle";

                return (
                  <div
                    key={`${row.price}-${trade?.id ?? "empty"}`}
                    className={[
                      "relative flex min-h-[24px] items-center justify-end overflow-hidden px-1 py-0.5 text-[10px]",
                      tone === "buy"
                        ? "bg-emerald-500/[0.025]"
                        : tone === "sell"
                          ? "bg-rose-500/[0.025]"
                          : "bg-transparent",
                    ].join(" ")}
                  >
                    {trade ? (
                      <>
                        <span
                          className={[
                            "absolute inset-y-0 left-0",
                            tone === "buy" ? "bg-emerald-500/20" : "bg-rose-500/20",
                          ].join(" ")}
                          style={{ width: `${Math.min(100, 18 + row.count * 10)}%` }}
                        />
                        <div className="relative z-10 flex items-center gap-1">
                          {row.count > 1 ? (
                            <span className="text-[8px] text-[var(--muted2)]">{`x${row.count}`}</span>
                          ) : null}
                          <span className={tone === "buy" ? "font-semibold text-emerald-200" : "font-semibold text-rose-200"}>
                            {trade.qty}
                          </span>
                          <span className="text-[8px] text-[var(--muted2)]">{new Date(trade.ts).toLocaleTimeString()}</span>
                        </div>
                      </>
                    ) : (
                      <span className="h-px w-2 bg-[var(--border)]/30" />
                    )}
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
