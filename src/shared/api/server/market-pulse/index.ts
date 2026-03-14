import type { MarketPulseDto } from "@/src/entities/market-pulse";
import { fallbackFearGreed, getFearGreedSnapshot } from "./fear-greed";
import { fallbackBtcPulse, getBtcPulseSnapshot } from "./btc";
import { fallbackNewsSentiment, getNewsSentimentSnapshot } from "./news-sentiment";
import { fallbackEquitiesPulse, getEquitiesPulseSnapshot } from "./equities";

function logProviderFailure(scope: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[market-pulse] ${scope} failed: ${message}`);
}

export async function getMarketPulseSnapshot(): Promise<MarketPulseDto> {
  const [fearGreed, btc, sentiment, equities] = await Promise.allSettled([
    getFearGreedSnapshot(),
    getBtcPulseSnapshot(),
    getNewsSentimentSnapshot(),
    getEquitiesPulseSnapshot(),
  ]);

  if (fearGreed.status === "rejected") logProviderFailure("fear-greed", fearGreed.reason);
  if (btc.status === "rejected") logProviderFailure("btc", btc.reason);
  if (sentiment.status === "rejected") logProviderFailure("news-sentiment", sentiment.reason);
  if (equities.status === "rejected") logProviderFailure("equities", equities.reason);

  return {
    fearGreed: fearGreed.status === "fulfilled" ? fearGreed.value : fallbackFearGreed(),
    btc: btc.status === "fulfilled" ? btc.value : fallbackBtcPulse(),
    sentiment: sentiment.status === "fulfilled" ? sentiment.value : fallbackNewsSentiment(),
    equities: equities.status === "fulfilled" ? equities.value : fallbackEquitiesPulse(),
  };
}

export { getBtcPulseSnapshot } from "./btc";
