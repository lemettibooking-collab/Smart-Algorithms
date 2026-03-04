import type { Candle } from "@/lib/binance";
import { fetchKlines, normalizeSymbol, isValidSymbol } from "@/lib/binance";
import { calcMetrics, type SymbolMetrics } from "@/lib/metrics";
import SymbolClient from "@/components/symbol-client";

type PageProps = {
  params: Promise<{ symbol: string }>;
};

export default async function SymbolPage({ params }: PageProps) {
  const { symbol: raw } = await params;
  const symbol = normalizeSymbol(raw);

  const interval = "1h" as const;
  const limit = 120;

  let initialCandles: Candle[] = [];
  let initialMetrics: SymbolMetrics = {
    atr14: null,
    change1h: null,
    change4h: null,
    change24h: null,
    volumeSpike: null,
  };

  if (isValidSymbol(symbol)) {
    initialCandles = await fetchKlines(symbol, interval as any, limit);
    initialMetrics = calcMetrics(initialCandles, interval as any);
  }

  return (
    <main className="space-y-4">
      <SymbolClient symbol={symbol} initialCandles={initialCandles} initialMetrics={initialMetrics} />
    </main>
  );
}
