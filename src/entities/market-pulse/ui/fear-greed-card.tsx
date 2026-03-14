import type { FearGreedDto } from "@/src/entities/market-pulse/model/types";
import { formatFearGreedLabel, formatRelativeUpdatedAt } from "@/src/shared/lib/market-pulse/format";
import { getFearGreedTone } from "@/src/shared/lib/market-pulse/theme";

export function FearGreedCard({ data }: { data: FearGreedDto }) {
  const tone = getFearGreedTone(data.label);

  return (
    <article className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted2)]">Fear &amp; Greed</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--text)]">{Math.round(data.value)}</div>
        </div>
        <span className={["inline-flex rounded-full border px-2 py-1 text-[11px] font-medium", tone.badge].join(" ")}>
          {formatFearGreedLabel(data.label)}
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--panel2)]">
        <div className={["h-full rounded-full", tone.bar].join(" ")} style={{ width: `${Math.max(0, Math.min(100, data.value))}%` }} />
      </div>

      <div className="mt-auto pt-3 flex items-center justify-between text-[11px] text-[var(--muted2)]">
        <span>Source: Alternative.me</span>
        <span>{formatRelativeUpdatedAt(data.updatedAt)}</span>
      </div>
    </article>
  );
}
