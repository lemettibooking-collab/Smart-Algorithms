export const SIGNALS = ["Watch", "Whale Activity", "Big Move", "Dump", "Breakout", "Reversal"] as const;
export type SignalFilter = (typeof SIGNALS)[number];

export type SortBy = "score" | "change" | "change24h" | "spike";
export type AlertsPresetId = "conservative" | "balanced" | "scalp";
export type SignalToggleKey = "whale" | "bigMove" | "dump" | "breakout" | "reversal" | "watch";
export type SignalToggles = Record<SignalToggleKey, boolean>;

export type FiltersState = {
  tf: string;
  includeCalm: boolean;
  onlyStrong: boolean;
  strongScore: number;
  minScore: number;
  keep: number;
  scoreJump: number;
  cooldownSec: number;
  signalToggles: SignalToggles;
  limit: number;
  dedupe: boolean;
  sortBy: SortBy;
};

export type AlertsPreset = {
  id: AlertsPresetId;
  label: string;
  values: Partial<FiltersState>;
};

export const PRESET_ID_KEY = "alerts:presetId";
export const FILTERS_KEY = "alerts:filters";
export const DEFAULT_PRESET_ID: AlertsPresetId = "balanced";

export const ALERTS_PRESETS: AlertsPreset[] = [
  {
    id: "conservative",
    label: "Conservative",
    values: {
      tf: "1h",
      includeCalm: false,
      onlyStrong: true,
      strongScore: 6,
      minScore: 5,
      keep: 50,
      scoreJump: 2,
      cooldownSec: 180,
      signalToggles: { whale: false, bigMove: true, dump: true, breakout: true, reversal: true, watch: false },
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    values: {
      tf: "15m",
      includeCalm: false,
      onlyStrong: true,
      strongScore: 4,
      minScore: 3,
      keep: 80,
      scoreJump: 1,
      cooldownSec: 90,
      signalToggles: { whale: true, bigMove: true, dump: true, breakout: true, reversal: true, watch: false },
    },
  },
  {
    id: "scalp",
    label: "Scalp",
    values: {
      tf: "5m",
      includeCalm: false,
      onlyStrong: false,
      strongScore: 4,
      minScore: 2,
      keep: 120,
      scoreJump: 0.5,
      cooldownSec: 60,
      signalToggles: { whale: true, bigMove: true, dump: false, breakout: true, reversal: true, watch: false },
    },
  },
];

export function isPresetId(v: unknown): v is AlertsPresetId {
  return v === "conservative" || v === "balanced" || v === "scalp";
}

export function getPresetById(id: AlertsPresetId): AlertsPreset {
  return ALERTS_PRESETS.find((p) => p.id === id) ?? ALERTS_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!;
}

export function signalFilterToToggles(signalFilter: SignalFilter[]): SignalToggles {
  const set = new Set(signalFilter);
  return {
    whale: set.has("Whale Activity"),
    bigMove: set.has("Big Move"),
    dump: set.has("Dump"),
    breakout: set.has("Breakout"),
    reversal: set.has("Reversal"),
    watch: set.has("Watch"),
  };
}

export function togglesToSignalFilter(toggles: SignalToggles): SignalFilter[] {
  const out: SignalFilter[] = [];
  if (toggles.watch) out.push("Watch");
  if (toggles.whale) out.push("Whale Activity");
  if (toggles.bigMove) out.push("Big Move");
  if (toggles.dump) out.push("Dump");
  if (toggles.breakout) out.push("Breakout");
  if (toggles.reversal) out.push("Reversal");
  return out;
}
