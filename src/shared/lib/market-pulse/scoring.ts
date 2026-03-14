import type { Direction, EquityPulseItemDto, PulseLabel, RiskLabel } from "@/src/entities/market-pulse";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toFinite(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function isObj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeAlphaScore(value: unknown) {
  const raw = toFinite(value, 0);
  return clamp(raw * 100, -100, 100);
}

function normalizeArticleText(article: Record<string, unknown>) {
  return [article.title, article.summary, article.source].map((part) => String(part ?? "").toLowerCase()).join(" ");
}

function articleBucket(article: Record<string, unknown>) {
  const topics = asArray(article.topics)
    .map((item) => (isObj(item) ? String(item.topic ?? "").toLowerCase() : ""))
    .filter(Boolean);
  const tickers = asArray(article.ticker_sentiment)
    .map((item) => (isObj(item) ? String(item.ticker ?? "").toUpperCase() : ""))
    .filter(Boolean);
  const text = normalizeArticleText(article);

  const score = normalizeAlphaScore(article.overall_sentiment_score);
  const crypto =
    tickers.some((ticker) => ticker.includes("BTC") || ticker.includes("ETH") || ticker.includes("CRYPTO")) ||
    topics.some((topic) => topic.includes("blockchain") || topic.includes("crypt")) ||
    /(bitcoin|btc|ether|eth|crypto|blockchain)/.test(text);
  const macro =
    topics.some((topic) => topic.includes("economy") || topic.includes("monetary") || topic.includes("inflation")) ||
    /(macro|inflation|fed|rates|rate hike|economy|monetary)/.test(text);
  const market =
    topics.some((topic) => topic.includes("financial_markets") || topic.includes("markets")) ||
    /(stocks|equities|nasdaq|s&p|dow|risk)/.test(text);

  return { score, crypto, macro, market };
}

export function classifyNewsSentiment(score: number): PulseLabel {
  if (score > 20) return "positive";
  if (score < -20) return "negative";
  return "neutral";
}

export function scoreNewsSentiment(feed: unknown[]): {
  score: number;
  label: PulseLabel;
  drivers: string[];
  isAvailable: boolean;
  buckets: {
    cryptoHeadlineScore: number;
    macroHeadlineScore: number;
    marketHeadlineScore: number;
  };
} {
  let cryptoSum = 0;
  let cryptoCount = 0;
  let macroSum = 0;
  let macroCount = 0;
  let marketSum = 0;
  let marketCount = 0;

  const drivers = asArray(feed)
    .filter(isObj)
    .map((article) => ({
      title: String(article.title ?? "").trim(),
      score: Math.abs(normalizeAlphaScore(article.overall_sentiment_score)),
    }))
    .filter((item) => item.title)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((item) => item.title.length > 68 ? `${item.title.slice(0, 65)}...` : item.title);

  for (const rawItem of asArray(feed)) {
    if (!isObj(rawItem)) continue;
    const bucket = articleBucket(rawItem);
    if (bucket.crypto) {
      cryptoSum += bucket.score;
      cryptoCount += 1;
    }
    if (bucket.macro) {
      macroSum += bucket.score;
      macroCount += 1;
    }
    if (bucket.market) {
      marketSum += bucket.score;
      marketCount += 1;
    }
  }

  const cryptoAvg = cryptoCount ? cryptoSum / cryptoCount : 0;
  const macroAvg = macroCount ? macroSum / macroCount : 0;
  const marketAvg = marketCount ? marketSum / marketCount : 0;
  const matchedBuckets = cryptoCount + macroCount + marketCount;
  const fallbackScores = asArray(feed)
    .filter(isObj)
    .map((article) => normalizeAlphaScore(article.overall_sentiment_score))
    .filter((score) => Number.isFinite(score));
  const fallbackAvg = fallbackScores.length ? fallbackScores.reduce((acc, score) => acc + score, 0) / fallbackScores.length : 0;
  const score = clamp(
    matchedBuckets > 0 ? 0.5 * cryptoAvg + 0.3 * macroAvg + 0.2 * marketAvg : fallbackAvg,
    -100,
    100
  );
  const isAvailable = matchedBuckets > 0 || fallbackScores.length > 0;

  return {
    score,
    label: classifyNewsSentiment(score),
    drivers,
    isAvailable,
    buckets: {
      cryptoHeadlineScore: cryptoAvg,
      macroHeadlineScore: macroAvg,
      marketHeadlineScore: marketAvg,
    },
  };
}

export function computeEquitiesBreadth(items: EquityPulseItemDto[]) {
  if (!items.length) return 0;
  const greenCount = items.filter((item) => item.changePct24h > 0).length;
  return greenCount / items.length;
}

export function classifyEquitiesRisk(items: EquityPulseItemDto[]): RiskLabel {
  const greenCount = items.filter((item) => item.changePct24h > 0).length;
  const redCount = items.filter((item) => item.changePct24h < 0).length;
  if (greenCount >= 3) return "risk-on";
  if (redCount >= 3) return "risk-off";
  return "mixed";
}

export function classifyDirection(change24hPct: number): Direction {
  if (change24hPct > 0.05) return "up";
  if (change24hPct < -0.05) return "down";
  return "flat";
}
