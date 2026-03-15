import type { EquitiesPulseDto } from "@/src/entities/market-pulse/model/types";
import { formatRelativeUpdatedAt, formatRiskLabel, formatRiskLabelOrNa, formatSignedPctOrNa } from "@/src/shared/lib/market-pulse/format";
import { getRiskTone } from "@/src/shared/lib/market-pulse/theme";

export function GlobalRiskCard({ data }: { data: EquitiesPulseDto }) {
  const availableItems = data.items.filter((item) => item.isAvailable);
  const greenCount = availableItems.filter((item) => item.changePct24h > 0).length;
  const thinCoverage = data.isAvailable && availableItems.length > 0 && availableItems.length < 3;
  const tone = getRiskTone(thinCoverage ? "mixed" : data.label);
  const equityItems = data.items.filter((item) => item.group === "equities");
  const commodityItems = data.items.filter((item) => item.group === "commodities");
  const sourceLabel = data.source === "twelve-data" ? "Twelve Data" : "FMP";

  const renderRows = (items: typeof data.items) =>
    items.map((item) => (
      <div key={item.key} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-2 py-1 text-[11px]">
        <span className="text-[var(--muted)]">{item.name}</span>
        <span className={!item.isAvailable ? "text-[var(--muted2)]" : item.changePct24h > 0 ? "text-emerald-600 dark:text-emerald-400" : item.changePct24h < 0 ? "text-rose-600 dark:text-rose-400" : "text-[var(--muted)]"}>
          {formatSignedPctOrNa(item.changePct24h, item.isAvailable)}
        </span>
      </div>
    ));

  return (
    <article className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted2)]">Global Risk</div>
          <div className="mt-1 text-base font-semibold text-[var(--text)]">
            {!data.isAvailable ? formatRiskLabelOrNa(data.label, data.isAvailable) : thinCoverage ? "Thin coverage" : formatRiskLabel(data.label)}
          </div>
        </div>
        <span className={["inline-flex rounded-full border px-2 py-1 text-[11px] font-medium", tone.badge].join(" ")}>
          {!data.isAvailable ? "No data" : thinCoverage ? `${availableItems.length}/${data.items.length} live` : `${greenCount}/${Math.max(1, availableItems.length)} green`}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted2)]">Equities</div>
          <div className="space-y-1.5">{renderRows(equityItems)}</div>
        </div>
        <div>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted2)]">Commodities</div>
          <div className="space-y-1.5">{renderRows(commodityItems)}</div>
        </div>
      </div>

      <div className="mt-auto pt-3 flex items-center justify-between text-[11px] text-[var(--muted2)]">
        <span>{`Source: ${sourceLabel}`}</span>
        <span>{formatRelativeUpdatedAt(data.updatedAt)}</span>
      </div>
    </article>
  );
}
