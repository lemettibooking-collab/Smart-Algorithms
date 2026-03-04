import type { Candle } from "@/lib/binance";

export type SymbolMetrics = {
  atr14: number | null;
  change1h: number | null;
  change4h: number | null;
  change24h: number | null;
  volumeSpike: number | null; // ratio vs avg
};

function round(n: number, digits = 4) {
  const m = Math.pow(10, digits);
  return Math.round(n * m) / m;
}

export function calcATR(candles: Candle[], period = 14): number | null {
  if (!candles || candles.length < period + 1) return null;

  // True Range:
  // TR = max(high-low, abs(high-prevClose), abs(low-prevClose))
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - p.close),
      Math.abs(c.low - p.close)
    );
    if (Number.isFinite(tr)) trs.push(tr);
  }

  if (trs.length < period) return null;

  const slice = trs.slice(-period);
  const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
  return round(avg, 6);
}

export function calcChangePercent(
  candles: Candle[],
  lookbackCandles: number
): number | null {
  if (!candles || candles.length < lookbackCandles + 1) return null;
  const last = candles[candles.length - 1]?.close ?? null;
  const prev = candles[candles.length - 1 - lookbackCandles]?.close ?? null;
  if (!last || !prev) return null;
  if (prev === 0) return null;
  const pct = ((last - prev) / prev) * 100;
  return round(pct, 4);
}

export function calcVolumeSpike(
  candles: Candle[],
  lookback = 20
): number | null {
  if (!candles || candles.length < lookback + 1) return null;
  const lastVol = candles[candles.length - 1]?.volume ?? null;
  if (lastVol == null) return null;

  const vols = candles.slice(-1 - lookback, -1).map((c) => c.volume);
  const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
  if (!Number.isFinite(avg) || avg <= 0) return null;

  return round(lastVol / avg, 4);
}

export function calcMetrics(
  candles: Candle[]
): SymbolMetrics {
  // ВАЖНО:
  // Если interval = "1h", то:
  // 1h = 1 свеча назад
  // 4h = 4 свечи
  // 24h = 24 свечи
  // Для других интервалов это "примерно", но пока нам норм.
  const one = 1;
  const four = 4;
  const day = 24;

  const change1h = calcChangePercent(candles, one);
  const change4h = calcChangePercent(candles, four);
  const change24h = calcChangePercent(candles, day);

  return {
    atr14: calcATR(candles, 14),
    change1h,
    change4h,
    change24h,
    volumeSpike: calcVolumeSpike(candles, 20),
  };
}
