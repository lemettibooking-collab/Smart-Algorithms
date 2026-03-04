// lib/signals.ts
// Single source of truth for signal labels.
// Strict mode: fewer, higher-quality signals.

type Mode = "klines" | "ticker";

export type SignalInputs = {
    tf: string; // "1m" | "15m" | "1h" | ...
    changePercent: number; // Δ(tf), %
    change24hPercent: number; // 24h%, %
    volSpike: number | null; // klines spike (or null)
    vol24hQuote?: number; // optional for ticker heuristics
    mode: Mode;
};

const MOVE_THRESHOLDS_ABS: Record<string, number> = {
    "1m": 0.9,
    "3m": 1.2,
    "5m": 1.5,
    "15m": 2.2,
    "30m": 3.0,
    "1h": 4.0,
    "2h": 5.5,
    "4h": 7.5,
    "6h": 9.0,
    "8h": 10.5,
    "12h": 12.0,
    "1d": 18.0,
    "1w": 30.0,
    "1M": 60.0,
    // fallback keys sometimes used
    "24h": 18.0,
    "ticker": 18.0,
};

const SPIKE_WHALE = 3.0;   // very abnormal
const SPIKE_CONFIRM = 2.2; // confirmation for breakout/dump/reversal
const SPIKE_WATCH = 1.8;   // optional “watch”, strict

function n(v: any, fb = 0) {
    const x = Number(v);
    return Number.isFinite(x) ? x : fb;
}

function absMoveThreshold(tf: string) {
    const k = String(tf ?? "").trim();
    return MOVE_THRESHOLDS_ABS[k] ?? 2.2; // default ~15m
}

function clamp(x: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, x));
}

function isPos(x: number) {
    return Number.isFinite(x) && x > 0;
}

/**
 * STRICT signal classifier.
 * Returns one of:
 * Calm / Watch / Whale Activity / Big Move / Dump / Breakout / Reversal
 */
export function classifySignalStrict(inp: SignalInputs): string {
    const tf = String(inp.tf ?? "15m").trim();
    const mode = inp.mode;

    const m = n(inp.changePercent, 0);
    const m24 = n(inp.change24hPercent, 0);
    const absM = Math.abs(m);
    const moveAbs = absMoveThreshold(tf);

    const vRaw = inp.volSpike == null ? null : n(inp.volSpike, 0);
    const v = vRaw == null ? null : clamp(vRaw, 0, 99);

    // ---- ticker-mode: strict & honest ----
    // In ticker-mode your "volSpike" isn't candle spike; it’s volume dominance / heuristic.
    // For strictness, we DO NOT emit Whale/Breakout based on this, only movement-based signals.
    if (mode === "ticker") {
        if (m > moveAbs) return "Big Move";
        if (m < -moveAbs) return "Dump";
        // Reversal heuristic: strong counter-move vs 24h direction
        if (absM >= 0.8 * moveAbs && ((m > 0 && m24 < 0) || (m < 0 && m24 > 0))) return "Reversal";
        return "Calm";
    }

    // ---- klines-mode (candle-based spike is valid) ----
    // 1) Breakout: up move + confirmation spike
    if (m > moveAbs && (v != null && v >= SPIKE_CONFIRM)) return "Breakout";

    // 2) Dump: down move + (spike OR ultra move)
    if (m < -moveAbs) {
        if ((v != null && v >= SPIKE_WATCH) || absM >= 1.6 * moveAbs) return "Dump";
        // if it's down move but not confirmed, still Big Move (down), but we use Dump only when strict conditions met
        return "Big Move";
    }

    // 3) Whale Activity: very high spike but not a full bigMove
    if (v != null && v >= SPIKE_WHALE && absM < moveAbs) return "Whale Activity";

    // 4) Big Move: large abs movement (without confirmation)
    if (absM >= moveAbs) return "Big Move";

    // 5) Reversal: strong counter move + confirmation spike + against 24h drift
    if (
        absM >= 0.8 * moveAbs &&
        (v != null && v >= SPIKE_CONFIRM) &&
        ((m > 0 && m24 < 0) || (m < 0 && m24 > 0))
    ) {
        return "Reversal";
    }

    // 6) Watch (strict & rare)
    if (absM >= 0.6 * moveAbs && (v != null && v >= SPIKE_WATCH)) return "Watch";

    return "Calm";
}

/**
 * Backward-compatible wrapper matching your current /api/hot calls.
 * You already call computeSignal({ changePercent, change24hPercent, volSpike, vol24hQuote, mode })
 */
export function computeSignal(args: {
    changePercent: number;
    change24hPercent: number;
    volSpike: number | null;
    vol24hQuote?: number;
    mode: "klines" | "ticker";
    tf?: string; // allow passing g/tf (recommended)
}) {
    return classifySignalStrict({
        tf: args.tf ?? "15m",
        changePercent: args.changePercent,
        change24hPercent: args.change24hPercent,
        volSpike: args.volSpike,
        vol24hQuote: args.vol24hQuote,
        mode: args.mode,
    });
}