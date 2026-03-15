import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { Info } from "lucide-react";
import { createPortal } from "react-dom";
import type { AltBreadthDto } from "@/src/entities/market-pulse/model/types";
import { formatConfidence } from "@/src/shared/lib/market-pulse/format";
import { getAltBreadthTone } from "@/src/shared/lib/market-pulse/theme";

function fallbackLines(status: AltBreadthDto["status"]) {
  if (status === "partial") return ["Coverage is still thin", "Signal may be noisy"];
  return ["No usable breadth data", "Will retry later"];
}

function formatUpdatedAt(updatedAt: number) {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return "updated now";
  const diffSec = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (diffSec < 15) return "updated now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

function getStateText(data: AltBreadthDto) {
  if (!data.isAvailable) return "Signal unavailable";
  if (data.bias === "buying") return "Buyers in control";
  if (data.bias === "selling") return "Sellers in control";
  return "Market is mixed";
}

function getSummaryText(data: AltBreadthDto) {
  if (!data.isAvailable) return fallbackLines(data.status)[0];
  if (data.bias === "buying") {
    return "Most liquid altcoins are rising, and buyers currently control the tape.";
  }
  if (data.bias === "selling") {
    return "Most liquid altcoins are falling, and sellers currently control the market.";
  }
  return "Liquid altcoins are mixed, with no clear side in control.";
}

function getMetricOne(data: AltBreadthDto) {
  const declinersPct = Math.round((data.stats.decliners / Math.max(1, data.universe.includedCount)) * 100);
  if (!data.isAvailable) return { label: "Gainers", value: "N/A" };
  if (data.bias === "selling") return { label: "Losers", value: `${declinersPct}%` };
  return { label: "Gainers", value: `${Math.round(data.stats.advancersPct)}%` };
}

function getMetricTwo(data: AltBreadthDto) {
  const downVolPct = Math.max(0, 100 - data.stats.upVolumePct);
  if (!data.isAvailable) return { label: "Up volume", value: "N/A" };
  if (data.bias === "selling") return { label: "Down volume", value: `${Math.round(downVolPct)}%` };
  if (data.bias === "neutral") return { label: "Losers", value: `${Math.round((data.stats.decliners / Math.max(1, data.universe.includedCount)) * 100)}%` };
  return { label: "Up volume", value: `${Math.round(data.stats.upVolumePct)}%` };
}

function getDominanceText(data: AltBreadthDto) {
  if (!data.isAvailable) return fallbackLines(data.status)[1];

  const upVol = Math.max(0, data.stats.upVolumePct);
  const downVol = Math.max(0, 100 - upVol);
  const dominant = Math.max(upVol, downVol);
  const weaker = Math.max(0.1, Math.min(upVol, downVol));
  const ratio = dominant / weaker;

  if (!Number.isFinite(ratio) || ratio < 1.35) {
    return "Breadth is balanced, with no strong volume dominance";
  }

  if (upVol > downVol) {
    return `Up-volume dominates at ${ratio.toFixed(1)}x`;
  }

  if (downVol > upVol) {
    return `Down-volume dominates at ${ratio.toFixed(1)}x`;
  }

  return "Breadth is balanced, with no strong volume dominance";
}

function TooltipContent({ data }: { data: AltBreadthDto }) {
  return (
    <div className="w-[300px] max-w-[min(320px,calc(100vw-24px))] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 text-left shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-sm">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted2)]">ALT MARKET MOOD</div>
      <div className="mt-2 text-[12px] leading-5 text-[var(--text)]">
        ALT MARKET MOOD shows the overall state of liquid altcoins: whether buyers, sellers, or a roughly neutral balance currently have the edge.
      </div>
      <div className="mt-3 text-[11px] font-medium text-[var(--text)]">Score bands: 0-100</div>
      <div className="mt-1 space-y-1 text-[11px] leading-4 text-[var(--muted)]">
        <div>0-19: strong selling pressure</div>
        <div>20-39: sellers stronger</div>
        <div>40-59: mixed market</div>
        <div>60-79: buyers stronger</div>
        <div>80-100: strong buying pressure</div>
      </div>
      <div className="mt-3 text-[11px] font-medium text-[var(--text)]">Metric guide</div>
      <div className="mt-1 space-y-1 text-[11px] leading-4 text-[var(--muted)]">
        <div>Gainers / Losers: share of the basket currently rising or falling.</div>
        <div>Up volume / Down volume: where most of the basket&apos;s trading volume is concentrated.</div>
        <div>Avg move: a simplified UI label for the basket&apos;s median 24h move.</div>
      </div>
      <div className="mt-3 text-[11px] leading-4 text-[var(--muted)]">
        Important: this is not real order-flow. It is a synthetic breadth / pressure estimate built from a liquid altcoin basket.
      </div>
      <div className="mt-2 text-[11px] leading-4 text-[var(--muted)]">
        Calculated from a filtered basket of liquid tradable altcoins. Illiquid and low-quality assets are excluded to keep the signal cleaner.
      </div>
      <div className="mt-3 space-y-1 text-[11px] leading-4 text-[var(--muted)]">
        <div>{`Tracked liquid coins: ${data.universe.includedCount}`}</div>
        <div>{`Coverage quality: ${formatConfidence(data.confidence)}`}</div>
        <div>Source: Smart Algorithms</div>
        <div>{`Methodology: ${data.methodology}`}</div>
      </div>
    </div>
  );
}

type TooltipPosition = {
  top: number;
  left: number;
};

function AltMarketMoodTooltip({ buttonRef, data }: { buttonRef: RefObject<HTMLButtonElement | null>; data: AltBreadthDto }) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ top: 12, left: 12 });

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const button = buttonRef.current;
      const tooltip = tooltipRef.current;
      if (!button || !tooltip) return;

      const viewportPadding = 12;
      const sideOffset = 8;
      const rect = button.getBoundingClientRect();
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = rect.right + sideOffset;
      if (left + tooltipWidth > viewportWidth - viewportPadding) {
        left = rect.left - tooltipWidth - sideOffset;
      }
      left = Math.min(Math.max(viewportPadding, left), viewportWidth - tooltipWidth - viewportPadding);

      let top = rect.top;
      if (top + tooltipHeight > viewportHeight - viewportPadding) {
        top = viewportHeight - tooltipHeight - viewportPadding;
      }
      top = Math.max(viewportPadding, top);

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [buttonRef, isOpen]);

  if (typeof document === "undefined") return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="What Alt Market Mood means"
        aria-describedby={isOpen ? tooltipId : undefined}
        title="What Alt Market Mood means"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={(event) => {
          if (!tooltipRef.current?.contains(event.relatedTarget as Node | null)) {
            setIsOpen(false);
          }
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel2)] text-[var(--muted2)] transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {isOpen
        ? createPortal(
            <div
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              onMouseEnter={() => setIsOpen(true)}
              onMouseLeave={() => setIsOpen(false)}
              onBlur={(event) => {
                if (!buttonRef.current?.contains(event.relatedTarget as Node | null)) {
                  setIsOpen(false);
                }
              }}
              tabIndex={-1}
              className="fixed z-[120] max-w-[min(320px,calc(100vw-24px))]"
              style={{ top: position.top, left: position.left }}
            >
              <TooltipContent data={data} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function AltcoinBreadthCard({ data }: { data: AltBreadthDto }) {
  const tone = getAltBreadthTone(data.label);
  const width = data.isAvailable ? Math.max(0, Math.min(100, data.score)) : 0;
  const lines = !data.isAvailable ? fallbackLines(data.status) : [];
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  const metricOne = getMetricOne(data);
  const metricTwo = getMetricTwo(data);
  const metricLabelClass = "text-[9px] uppercase tracking-[0.08em] text-[var(--muted2)]";
  const metricValueClass = "mt-1 text-sm font-semibold leading-none text-[var(--text)]";

  return (
    <article className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted2)]">Alt Market Mood</div>
          <AltMarketMoodTooltip buttonRef={infoButtonRef} data={data} />
        </div>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-5 text-[var(--text)]">{getStateText(data)}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-semibold leading-none text-[var(--text)]">{data.isAvailable ? `${data.score}/100` : "N/A"}</div>
          <div className="mt-1 text-[10px] text-[var(--muted2)]">Signal strength</div>
        </div>
      </div>

      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[var(--panel2)]">
        <div className={["h-full rounded-full", tone.bar].join(" ")} style={{ width: `${width}%` }} />
      </div>

      <div className="mt-2.5 rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-2.5 py-2">
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0 pr-1">
            <div className={metricLabelClass}>{metricOne.label}</div>
            <div className={metricValueClass}>{metricOne.value}</div>
          </div>
          <div className="min-w-0 border-l border-[var(--border)] px-2">
            <div className={metricLabelClass}>{metricTwo.label}</div>
            <div className={metricValueClass}>{metricTwo.value}</div>
          </div>
          <div className="min-w-0 border-l border-[var(--border)] pl-2">
            <div className={metricLabelClass}>Avg move</div>
            <div className={metricValueClass}>
              {data.isAvailable ? `${data.stats.medianReturnPct >= 0 ? "+" : ""}${data.stats.medianReturnPct.toFixed(1)}%` : "N/A"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2.5 space-y-1">
        <div className="text-[11px] leading-4 text-[var(--muted)]">{data.isAvailable ? getSummaryText(data) : lines[0]}</div>
        <div className="text-[10.5px] leading-4 text-[var(--muted2)]">{getDominanceText(data)}</div>
      </div>

      <div className="mt-auto pt-2.5 text-[11px] text-[var(--muted2)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{`Tracked liquid coins: ${data.universe.includedCount}`}</span>
          <span>{`Updated: ${formatUpdatedAt(data.updatedAt)}`}</span>
        </div>
      </div>
    </article>
  );
}
