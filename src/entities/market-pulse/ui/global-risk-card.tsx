import type { EquitiesPulseDto } from "@/src/entities/market-pulse/model/types";
import { formatRelativeUpdatedAt, formatRiskLabelOrNa, formatSignedPctOrNa } from "@/src/shared/lib/market-pulse/format";
import { getRiskTone } from "@/src/shared/lib/market-pulse/theme";

export function GlobalRiskCard({ data }: { data: EquitiesPulseDto }) {
  const tone = getRiskTone(data.label);
  const availableItems = data.items.filter((item) => item.isAvailable);
  const greenCount = availableItems.filter((item) => item.changePct24h > 0).length;

  return (
    <article className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted2)]">Global Risk</div>
          <div className="mt-1 text-base font-semibold text-[var(--text)]">{formatRiskLabelOrNa(data.label, data.isAvailable)}</div>
        </div>
        <span className={["inline-flex rounded-full border px-2 py-1 text-[11px] font-medium", tone.badge].join(" ")}>
          {data.isAvailable ? `${greenCount}/${Math.max(1, availableItems.length)} green` : "No data"}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        {data.items.map((item) => (
          <div key={item.key} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-2 py-1 text-[11px]">
            <span className="text-[var(--muted)]">{item.name}</span>
            <span className={!item.isAvailable ? "text-[var(--muted2)]" : item.changePct24h > 0 ? "text-emerald-600 dark:text-emerald-400" : item.changePct24h < 0 ? "text-rose-600 dark:text-rose-400" : "text-[var(--muted)]"}>
              {formatSignedPctOrNa(item.changePct24h, item.isAvailable)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-3 flex items-center justify-between text-[11px] text-[var(--muted2)]">
        <span>Source: FMP</span>
        <span>{formatRelativeUpdatedAt(data.updatedAt)}</span>
      </div>
    </article>
  );
}
