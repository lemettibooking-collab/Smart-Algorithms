import type { NewsSentimentDto } from "@/src/entities/market-pulse/model/types";
import { formatRelativeUpdatedAt, formatSentimentLabelOrNa } from "@/src/shared/lib/market-pulse/format";
import { getSentimentTone } from "@/src/shared/lib/market-pulse/theme";

function limitedCopy(errorCode?: string) {
  if (errorCode === "rate_limited" || errorCode === "usage_limit_reached") return ["Temporarily limited", "Will retry later"];
  if (errorCode === "missing_api_key") return ["Sentiment unavailable", "Configuration required"];
  if (errorCode === "empty_provider_payload") return ["No matching news", "Will retry later"];
  return ["Temporarily limited", "Will retry later"];
}

function parseDriver(driver: string) {
  const [kind, ...rest] = driver.split("|");
  if (rest.length === 0) return { kind: null, text: driver };
  return { kind, text: rest.join("|") };
}

function driverTone(kind: string | null) {
  if (kind === "Crypto") return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200";
  if (kind === "Macro") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200";
  if (kind === "Market") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200";
  return "border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)]";
}

export function NewsSentimentCard({ data }: { data: NewsSentimentDto }) {
  const tone = getSentimentTone(data.label);
  const width = data.isAvailable ? Math.max(0, Math.min(100, (data.score + 100) / 2)) : 0;
  const fallbackLines = limitedCopy(data.errorCode);
  const drivers = data.isAvailable ? data.drivers.slice(0, 2).map(parseDriver) : [];

  return (
    <article className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted2)]">News Sentiment</div>
          <div className="mt-1 text-base font-semibold text-[var(--text)]">{formatSentimentLabelOrNa(data.label, data.isAvailable)}</div>
        </div>
        <span className={["inline-flex rounded-full border px-2 py-1 text-[11px] font-medium", tone.badge].join(" ")}>
          {data.isAvailable ? Math.round(data.score) : data.errorCode === "rate_limited" ? "Limited" : "N/A"}
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--panel2)]">
        <div className={["h-full rounded-full", tone.bar].join(" ")} style={{ width: `${width}%` }} />
      </div>

      <div className="mt-3 space-y-1.5">
        {data.isAvailable
          ? drivers.map((driver) => (
              <div key={`${driver.kind ?? "driver"}-${driver.text}`} className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-2.5 py-2 text-[11px] leading-4">
                {driver.kind ? <span className={["inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", driverTone(driver.kind)].join(" ")}>{driver.kind}</span> : null}
                <span className="min-w-0 text-[var(--muted)]">{driver.text}</span>
              </div>
            ))
          : fallbackLines.map((line) => (
              <div key={line} className="text-[11px] leading-4 text-[var(--muted)]">
                {line}
              </div>
            ))}
      </div>

      <div className="mt-auto pt-3 flex items-center justify-between text-[11px] text-[var(--muted2)]">
        <span>Source: Marketaux</span>
        <span>{formatRelativeUpdatedAt(data.updatedAt)}</span>
      </div>
    </article>
  );
}
