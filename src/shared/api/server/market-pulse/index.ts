import type { MarketPulseDto } from "@/src/entities/market-pulse";
import { fallbackFearGreed, getFearGreedSnapshot } from "./fear-greed";
import { fallbackBtcPulse, getBtcPulseSnapshot } from "./btc";
import { fallbackNewsSentiment, getNewsSentimentSnapshot } from "./news-sentiment";
import { fallbackEquitiesPulse, getEquitiesPulseSnapshot } from "./equities";
import { fallbackAltBreadthPulse, getAltBreadthSnapshot } from "./alt-breadth";
import { fallbackAdvancedStructure, getAdvancedStructureSnapshot } from "./advanced-structure";

function logProviderFailure(scope: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[market-pulse] ${scope} failed: ${message}`);
}

export async function getMarketPulseSnapshot(): Promise<MarketPulseDto> {
  const [fearGreed, btc, sentiment, equities, altBreadth, advanced] = await Promise.allSettled([
    getFearGreedSnapshot(),
    getBtcPulseSnapshot(),
    getNewsSentimentSnapshot(),
    getEquitiesPulseSnapshot(),
    getAltBreadthSnapshot(),
    getAdvancedStructureSnapshot(),
  ]);

  if (fearGreed.status === "rejected") logProviderFailure("fear-greed", fearGreed.reason);
  if (btc.status === "rejected") logProviderFailure("btc", btc.reason);
  if (sentiment.status === "rejected") logProviderFailure("news-sentiment", sentiment.reason);
  if (equities.status === "rejected") logProviderFailure("equities", equities.reason);
  if (altBreadth.status === "rejected") logProviderFailure("alt-breadth", altBreadth.reason);
  if (advanced.status === "rejected") logProviderFailure("advanced-structure", advanced.reason);

  const advancedValue = advanced.status === "fulfilled" ? advanced.value : fallbackAdvancedStructure();

  return {
    fearGreed: fearGreed.status === "fulfilled" ? fearGreed.value : fallbackFearGreed(),
    btc: btc.status === "fulfilled" ? btc.value : fallbackBtcPulse(),
    sentiment: sentiment.status === "fulfilled" ? sentiment.value : fallbackNewsSentiment(),
    equities: equities.status === "fulfilled" ? equities.value : fallbackEquitiesPulse(),
    altBreadth: altBreadth.status === "fulfilled" ? altBreadth.value : fallbackAltBreadthPulse(),
    btcRotation: advancedValue.btcRotation,
    derivativesHeat: advancedValue.derivativesHeat,
    marketLeadership: advancedValue.marketLeadership,
    breakoutHealth: advancedValue.breakoutHealth,
    stablecoinFlow: advancedValue.stablecoinFlow,
    narrativeHeat: advancedValue.narrativeHeat,
  };
}

export { getBtcPulseSnapshot } from "./btc";
