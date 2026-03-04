import type { Candle } from "@/lib/binance";

export type PeriodChange = {
    pct: number | null;
    from: number | null; // price then
    to: number | null;   // price now
};

export type PeriodMetrics = {
    "1m": PeriodChange;
    "5m": PeriodChange;
    "15m": PeriodChange;
    "1h": PeriodChange;
    "4h": PeriodChange;
    "1d": PeriodChange;
    "1w": PeriodChange;
    "1M": PeriodChange;
    "1y": PeriodChange;
};

function round(n: number, digits = 4) {
    const m = Math.pow(10, digits);
    return Math.round(n * m) / m;
}

function calcPct(now: number | null, then: number | null): number | null {
    if (now == null || then == null) return null;
    if (!Number.isFinite(now) || !Number.isFinite(then) || then === 0) return null;
    return round(((now - then) / then) * 100, 4);
}

export function changeFromLookbackCandles(candles: Candle[], lookback: number): PeriodChange {
    if (!candles || candles.length < lookback + 1) return { pct: null, from: null, to: null };

    const to = candles[candles.length - 1]?.close ?? null;
    const from = candles[candles.length - 1 - lookback]?.close ?? null;

    return { pct: calcPct(to, from), from, to };
}
