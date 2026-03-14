import type { BtcPulseDto } from "@/src/entities/market-pulse/model/types";
import { formatCompactPrice, formatSignedPct, formatRelativeUpdatedAt } from "@/src/shared/lib/market-pulse/format";
import { getDirectionTone } from "@/src/shared/lib/market-pulse/theme";

export function BtcLiveCard({
  data,
  stale = false,
  streamConnected = true,
}: {
  data: BtcPulseDto;
  stale?: boolean;
  streamConnected?: boolean;
}) {
  const tone = getDirectionTone(data.direction);

  return (
    <article className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted2)]">BTC Live</div>
          <div className="mt-1 text-xl font-semibold text-[var(--text)]">{formatCompactPrice(data.price)}</div>
        </div>
        <span
          className={[
            "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium",
            stale || !streamConnected ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/45 dark:bg-amber-400/10 dark:text-amber-200" : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/45 dark:bg-emerald-400/10 dark:text-emerald-200",
          ].join(" ")}
        >
          <span className={["h-1.5 w-1.5 rounded-full", stale || !streamConnected ? "bg-amber-500" : "bg-emerald-500"].join(" ")} />
          {stale || !streamConnected ? "Delayed" : "Live"}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className={["text-sm font-medium", tone.text].join(" ")}>{formatSignedPct(data.change24hPct)}</span>
        <span className={["inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold", tone.arrowBg].join(" ")}>
          {data.direction === "up" ? "↑" : data.direction === "down" ? "↓" : "→"}
        </span>
      </div>

      <div className="mt-auto pt-3 flex items-center justify-between text-[11px] text-[var(--muted2)]">
        <span>Source: Binance</span>
        <span>{formatRelativeUpdatedAt(data.updatedAt)}</span>
      </div>
    </article>
  );
}
