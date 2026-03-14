import type { Direction, PulseLabel, RiskLabel } from "@/src/entities/market-pulse";

export function getFearGreedTone(label: string) {
  switch (label) {
    case "extreme-fear":
    case "fear":
      return {
        badge: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-400/45 dark:bg-rose-400/12 dark:text-rose-200",
        bar: "bg-rose-500 dark:bg-rose-400",
      };
    case "greed":
    case "extreme-greed":
      return {
        badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/45 dark:bg-emerald-400/12 dark:text-emerald-200",
        bar: "bg-emerald-500 dark:bg-emerald-400",
      };
    default:
      return {
        badge: "border-slate-300 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70",
        bar: "bg-sky-500 dark:bg-sky-400",
      };
  }
}

export function getDirectionTone(direction: Direction) {
  if (direction === "up") {
    return {
      text: "text-emerald-600 dark:text-emerald-400",
      arrowBg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-200",
    };
  }
  if (direction === "down") {
    return {
      text: "text-rose-600 dark:text-rose-400",
      arrowBg: "bg-rose-100 text-rose-700 dark:bg-rose-400/12 dark:text-rose-200",
    };
  }
  return {
    text: "text-[var(--muted)]",
    arrowBg: "bg-[var(--panel2)] text-[var(--muted)] dark:bg-white/5 dark:text-white/70",
  };
}

export function getSentimentTone(label: PulseLabel) {
  if (label === "positive") {
    return {
      badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/45 dark:bg-emerald-400/12 dark:text-emerald-200",
      bar: "bg-emerald-500 dark:bg-emerald-400",
    };
  }
  if (label === "negative") {
    return {
      badge: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-400/45 dark:bg-rose-400/12 dark:text-rose-200",
      bar: "bg-rose-500 dark:bg-rose-400",
    };
  }
  return {
    badge: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/45 dark:bg-sky-400/12 dark:text-sky-200",
    bar: "bg-sky-500 dark:bg-sky-400",
  };
}

export function getRiskTone(label: RiskLabel) {
  if (label === "risk-on") {
    return {
      badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/45 dark:bg-emerald-400/12 dark:text-emerald-200",
    };
  }
  if (label === "risk-off") {
    return {
      badge: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-400/45 dark:bg-rose-400/12 dark:text-rose-200",
    };
  }
  return {
    badge: "border-slate-300 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70",
  };
}
