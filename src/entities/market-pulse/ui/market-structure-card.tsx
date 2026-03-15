"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import type { MarketStructureMetricDto } from "@/src/entities/market-pulse/model/types";
import { formatRelativeUpdatedAt } from "@/src/shared/lib/market-pulse/format";
import { getStructureTone } from "@/src/shared/lib/market-pulse/theme";

type TooltipPosition = {
  top: number;
  left: number;
};

function StructureTooltip({
  buttonRef,
  title,
  lines,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  title: string;
  lines: string[];
}) {
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

      let left = rect.right + sideOffset;
      if (left + tooltipWidth > window.innerWidth - viewportPadding) {
        left = rect.left - tooltipWidth - sideOffset;
      }
      left = Math.min(Math.max(viewportPadding, left), window.innerWidth - tooltipWidth - viewportPadding);

      let top = rect.top;
      if (top + tooltipHeight > window.innerHeight - viewportPadding) {
        top = window.innerHeight - tooltipHeight - viewportPadding;
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
        aria-label={`What ${title} means`}
        aria-describedby={isOpen ? tooltipId : undefined}
        title={`What ${title} means`}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={(event) => {
          if (!tooltipRef.current?.contains(event.relatedTarget as Node | null)) setIsOpen(false);
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
              tabIndex={-1}
              onMouseEnter={() => setIsOpen(true)}
              onMouseLeave={() => setIsOpen(false)}
              className="fixed z-[120] max-w-[min(320px,calc(100vw-24px))]"
              style={{ top: position.top, left: position.left }}
            >
              <div className="w-[300px] max-w-[min(320px,calc(100vw-24px))] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 text-left shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-sm">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted2)]">{title}</div>
                <div className="mt-2 space-y-2 text-[11px] leading-4 text-[var(--muted)]">
                  {lines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function fallbackCopy(status: MarketStructureMetricDto["status"]) {
  if (status === "partial") return "Coverage is still limited for this signal.";
  return "Not enough data to build a reliable signal.";
}

export function MarketStructureCard({
  title,
  data,
  tooltipLines,
}: {
  title: string;
  data: MarketStructureMetricDto;
  tooltipLines: string[];
}) {
  const tone = getStructureTone(data.bias);
  const width = data.isAvailable ? clamp(data.score, 0, 100) : 0;
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  const stats = data.stats.slice(0, 3);

  return (
    <article className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted2)]">{title}</div>
          <StructureTooltip buttonRef={infoButtonRef} title={title} lines={tooltipLines} />
        </div>
        <span className={["inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-medium opacity-80", tone.badge].join(" ")}>
          {data.isAvailable ? data.label : "No data"}
        </span>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-5 text-[var(--text)]">{data.isAvailable ? data.label : "Unavailable"}</div>
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
        <div className="grid grid-cols-3 gap-0">
          {stats.map((stat, idx) => (
            <div
              key={stat.label}
              className={[
                "flex min-w-0 min-h-[3.35rem] flex-col justify-between",
                idx === 0 ? "pr-2" : idx === 1 ? "border-l border-[var(--border)] px-2" : "border-l border-[var(--border)] pl-2",
              ].join(" ")}
            >
              <div className="text-[8px] uppercase tracking-[0.08em] leading-[1.35] text-[var(--muted2)] whitespace-normal text-balance">
                {stat.label}
              </div>
              <div className="mt-1 text-sm font-semibold leading-tight text-[var(--text)] whitespace-normal break-words">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2.5 text-[11px] leading-4 text-[var(--muted)]">{data.isAvailable ? data.summary : fallbackCopy(data.status)}</div>

      <div className="mt-auto pt-2.5 text-[11px] text-[var(--muted2)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{`Updated: ${formatRelativeUpdatedAt(data.updatedAt)}`}</span>
          <span>{`Source: ${data.source}`}</span>
        </div>
      </div>
    </article>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
