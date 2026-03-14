import { TTLCache, InFlight, fetchWithRetry } from "@/lib/server-cache";
import { MARKETAUX_NEWS_CONFIG, MARKET_PULSE_TTL } from "@/src/shared/config/market-pulse";
import type { NewsSentimentDto } from "@/src/entities/market-pulse";
import { classifyNewsSentiment } from "@/src/shared/lib/market-pulse/scoring";

const cache = new TTLCache<NewsSentimentDto>(MARKET_PULSE_TTL.newsSentimentMs, 16);
const inflight = new InFlight<NewsSentimentDto>();
const KEY = "news-sentiment:v1";
const DEBUG_MARKET_PULSE = process.env.DEBUG_MARKET_PULSE === "1";

type MarketauxEntity = {
  symbol?: string | null;
  name?: string | null;
  match_score?: number | null;
  sentiment_score?: number | null;
  highlights?: Array<{
    highlight?: string;
    sentiment?: number | null;
    highlighted_in?: string;
  }>;
};

type MarketauxArticle = {
  uuid: string;
  title?: string | null;
  snippet?: string | null;
  published_at?: string | null;
  source?: string | null;
  entities?: MarketauxEntity[];
};

type MarketauxNewsResponse = {
  meta?: {
    found?: number;
    returned?: number;
    limit?: number;
    page?: number;
  };
  data?: MarketauxArticle[];
};

type ChannelKey = "crypto" | "macro" | "market";
type QueryStage = "primary" | "fallback";

type ChannelResult = {
  key: ChannelKey;
  stage: QueryStage;
  articles: MarketauxArticle[];
  score: number | null;
  driver: string | null;
  articleCount: number;
  discardedArticleCount: number;
  hasEntities: boolean;
  usableEntities: number;
  lexicalUsed: boolean;
  lexicalNonZero: boolean;
  errorCode?: string;
};

function debugNews(message: string, payload?: unknown) {
  if (!DEBUG_MARKET_PULSE) return;
  if (payload === undefined) {
    console.warn(`[market-pulse/news] ${message}`);
    return;
  }
  console.warn(`[market-pulse/news] ${message}`, payload);
}

async function responseSnippet(res: Response) {
  const text = await res.clone().text().catch(() => "");
  return text.slice(0, 500);
}

function classifyBodyError(status: number, body: string) {
  const text = body.toLowerCase();
  if (status === 429 || text.includes("rate limit") || text.includes("too many requests")) return "rate_limited";
  if (text.includes("usage limit") || text.includes("monthly limit") || text.includes("plan quota")) return "usage_limit_reached";
  if (status === 401 || status === 403 || text.includes("invalid api") || text.includes("api key") || text.includes("api token")) return "invalid_api_key";
  if (status >= 500) return "upstream_error";
  return "provider_unavailable";
}

function formatMarketauxUtc(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function hoursAgoIso(hours: number) {
  return formatMarketauxUtc(new Date(Date.now() - hours * 60 * 60 * 1000));
}

function buildMarketauxUrl(apiToken: string, channel: ChannelKey, stage: QueryStage) {
  const url = new URL("https://api.marketaux.com/v1/news/all");
  url.searchParams.set("api_token", apiToken);
  url.searchParams.set("language", MARKETAUX_NEWS_CONFIG.language);
  url.searchParams.set("limit", String(MARKETAUX_NEWS_CONFIG.requestLimit));

  if (channel === "crypto") {
    url.searchParams.set(
      "published_after",
      hoursAgoIso(stage === "primary" ? MARKETAUX_NEWS_CONFIG.cryptoHoursBack : MARKETAUX_NEWS_CONFIG.cryptoFallbackHoursBack)
    );
    url.searchParams.set("search", stage === "primary" ? MARKETAUX_NEWS_CONFIG.cryptoSearch : MARKETAUX_NEWS_CONFIG.cryptoFallbackSearch);
    return url;
  }

  if (channel === "macro") {
    url.searchParams.set("search", stage === "primary" ? MARKETAUX_NEWS_CONFIG.macroSearch : MARKETAUX_NEWS_CONFIG.macroFallbackSearch);
    url.searchParams.set(
      "published_after",
      hoursAgoIso(stage === "primary" ? MARKETAUX_NEWS_CONFIG.macroHoursBack : MARKETAUX_NEWS_CONFIG.macroFallbackHoursBack)
    );
    return url;
  }

  url.searchParams.set(
    "published_after",
    hoursAgoIso(stage === "primary" ? MARKETAUX_NEWS_CONFIG.marketHoursBack : MARKETAUX_NEWS_CONFIG.marketFallbackHoursBack)
  );
  url.searchParams.set("search", stage === "primary" ? MARKETAUX_NEWS_CONFIG.marketSearch : MARKETAUX_NEWS_CONFIG.marketFallbackSearch);
  return url;
}

function buildRelaxedMarketauxUrl(apiToken: string, channel: ChannelKey) {
  const url = new URL("https://api.marketaux.com/v1/news/all");
  url.searchParams.set("api_token", apiToken);
  url.searchParams.set("language", MARKETAUX_NEWS_CONFIG.language);
  url.searchParams.set("limit", String(MARKETAUX_NEWS_CONFIG.requestLimit));
  url.searchParams.set(
    "published_after",
    hoursAgoIso(
      channel === "macro"
        ? MARKETAUX_NEWS_CONFIG.macroFallbackHoursBack
        : channel === "market"
          ? MARKETAUX_NEWS_CONFIG.marketFallbackHoursBack
          : MARKETAUX_NEWS_CONFIG.cryptoFallbackHoursBack
    )
  );
  url.searchParams.set(
    "search",
    channel === "crypto"
      ? "crypto"
      : channel === "macro"
        ? "economy"
        : "market"
  );
  return url;
}

function asArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeScore(value: number) {
  return clamp(value * 100, -100, 100);
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function keywordScore(text: string, positive: Array<[RegExp, number]>, negative: Array<[RegExp, number]>) {
  let score = 0;
  for (const [pattern, weight] of positive) {
    if (pattern.test(text)) score += weight;
  }
  for (const [pattern, weight] of negative) {
    if (pattern.test(text)) score -= weight;
  }
  return clamp(score, -1, 1);
}

function shortLine(value: string, max = 68) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

function cleanDriverText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[;:,.\-–—\s]+$/g, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function articleText(article: MarketauxArticle) {
  return `${article.title ?? ""} ${article.snippet ?? ""}`.toLowerCase();
}

function isRelevantArticle(channel: ChannelKey, article: MarketauxArticle) {
  const text = articleText(article);
  if (channel === "crypto") return /(bitcoin|btc|ethereum|eth|crypto|cryptocurrency|etf)/.test(text);
  if (channel === "macro") return /(inflation|cpi|fed|fomc|rates|yield|jobs|economy|recession|dovish|hawkish)/.test(text);
  return /(stocks|equities|market|risk|rally|selloff|nasdaq|s&p|dow|russell|volatility)/.test(text);
}

function macroLexicalScore(article: MarketauxArticle) {
  const text = articleText(article);
  return keywordScore(
    text,
    [
      [/(cooling inflation|soft landing|rate cuts|disinflation|easing|dovish|growth)/, 0.35],
      [/(fed holds|jobs steady|yields ease|cpi slows|recovery)/, 0.2],
    ],
    [
      [/(inflation shock|inflation spike|sticky inflation|rate hike|higher for longer|recession|war|tariffs)/, 0.35],
      [/(yields jump|jobs weaken|defaults rise|hawkish|panic|fears)/, 0.2],
    ]
  );
}

function cryptoLexicalScore(article: MarketauxArticle) {
  const text = articleText(article);
  return keywordScore(
    text,
    [
      [/(etf approval|etf inflows|approval|inflows|breakout|surge|rally|recovery|bullish|growth)/, 0.35],
      [/(adoption|accumulation|upgrade|rebound|break higher)/, 0.2],
    ],
    [
      [/(liquidation|bankrupt|hack|exploit|crash|slump|crackdown|lawsuit|selloff|dump)/, 0.35],
      [/(outflow|panic|fears|default)/, 0.2],
    ]
  );
}

function marketLexicalScore(article: MarketauxArticle) {
  const text = articleText(article);
  return keywordScore(
    text,
    [
      [/(rally|rebound|record high|gains|risk-on|upside|bullish|recovery)/, 0.35],
      [/(beats expectations|breakout|surge)/, 0.2],
    ],
    [
      [/(selloff|correction|slump|risk-off|downgrade|volatility spike|drawdown|crash)/, 0.35],
      [/(fears|panic|tariffs|war)/, 0.2],
    ]
  );
}

function extractEntityScores(article: MarketauxArticle, predicate?: (entity: MarketauxEntity) => boolean) {
  return asArray(article.entities)
    .filter((entity) => entity.sentiment_score != null && Number.isFinite(Number(entity.sentiment_score)))
    .filter((entity) => (predicate ? predicate(entity) : true))
    .map((entity) => {
      const sentiment = Number(entity.sentiment_score);
      const matchScore = Number(entity.match_score ?? 1);
      const weight = Math.max(0.25, Number.isFinite(matchScore) ? matchScore : 1) * Math.max(0.25, Math.abs(sentiment));
      return { sentiment, weight };
    });
}

function weightedAverage(values: Array<{ sentiment: number; weight: number }>) {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return null;
  return values.reduce((sum, item) => sum + item.sentiment * item.weight, 0) / totalWeight;
}

function fallbackDriver(channel: ChannelKey, score: number) {
  if (channel === "crypto") return score >= 0 ? "Crypto|Crypto sentiment mixed" : "Crypto|Crypto tone turns cautious";
  if (channel === "macro") return score >= 0 ? "Macro|Macro backdrop looks constructive" : "Macro|Macro backdrop remains cautious";
  return score >= 0 ? "Market|Risk assets find support" : "Market|Risk assets pressured by equities weakness";
}

function summarizeDriver(channel: ChannelKey, article: MarketauxArticle | undefined, score: number | null) {
  const text = cleanDriverText(shortLine(`${article?.title ?? ""} ${article?.snippet ?? ""}`, 120)).toLowerCase();
  const positive = (score ?? 0) >= 0;

  if (channel === "crypto") {
    if (/(etf|inflow)/.test(text)) return "Crypto|ETF flow headlines supportive";
    if (/(hack|exploit|lawsuit|liquidation|outflow|crackdown|bankrupt)/.test(text)) return "Crypto|Crypto risk headlines weigh on sentiment";
    if (/(breakout|surge|rally|bullish|recovery)/.test(text)) return "Crypto|Crypto momentum headlines supportive";
    return fallbackDriver("crypto", score ?? 0);
  }

  if (channel === "macro") {
    if (/(cooling inflation|soft landing|rate cuts|disinflation|dovish|easing)/.test(text)) return "Macro|Cooling inflation narrative supports risk";
    if (/(higher for longer|hawkish|recession|inflation shock|tariffs|war)/.test(text)) return "Macro|Macro backdrop remains cautious";
    if (/(fed|rates|yield|jobs|economy)/.test(text)) return positive ? "Macro|Macro signals stay balanced" : "Macro|Fed delay narrative weighs on risk appetite";
    return fallbackDriver("macro", score ?? 0);
  }

  if (/(selloff|correction|slump|downgrade|volatility|drawdown)/.test(text)) return "Market|Risk assets pressured by equities weakness";
  if (/(rally|rebound|record high|gains|risk-on|upside)/.test(text)) return "Market|Risk assets find support";
  if (/(stocks|equities|market|nasdaq|s&p|dow)/.test(text)) return positive ? "Market|Broad market tone remains supportive" : "Market|Equity tone weighs on sentiment";
  return fallbackDriver("market", score ?? 0);
}

function channelScore(channel: ChannelKey, articles: MarketauxArticle[]) {
  const relevantArticles = articles.filter((article) => isRelevantArticle(channel, article) || asArray(article.entities).length > 0);
  const lexicalArticles = relevantArticles.length ? relevantArticles : articles.filter((article) => articleText(article).trim().length > 0);
  const discardedArticleCount = Math.max(0, articles.length - lexicalArticles.length);

  if (!lexicalArticles.length) {
    return {
      score: null,
      driver: null,
      hasEntities: false,
      usableEntities: 0,
      lexicalUsed: false,
      lexicalNonZero: false,
      articleCount: 0,
      discardedArticleCount,
    };
  }

  if (channel === "crypto") {
    const values = relevantArticles.flatMap((article) =>
      extractEntityScores(article, (entity) => {
        const symbol = String(entity.symbol ?? "").toUpperCase();
        return MARKETAUX_NEWS_CONFIG.cryptoSymbols.includes(symbol as (typeof MARKETAUX_NEWS_CONFIG.cryptoSymbols)[number]);
      })
    );
    const lexicalAverage = average(lexicalArticles.map((article) => cryptoLexicalScore(article)));
    const score = weightedAverage(values) ?? lexicalAverage;
    return {
      score: score == null ? null : normalizeScore(score),
      driver: score == null ? null : summarizeDriver("crypto", relevantArticles[0] ?? lexicalArticles[0], score),
      hasEntities: lexicalArticles.some((article) => asArray(article.entities).length > 0),
      usableEntities: values.length,
      lexicalUsed: values.length === 0,
      lexicalNonZero: values.length === 0 && lexicalAverage != null && Math.abs(lexicalAverage) > 0.001,
      articleCount: lexicalArticles.length,
      discardedArticleCount,
    };
  }

  if (channel === "market") {
    const values = relevantArticles.flatMap((article) =>
      extractEntityScores(article, (entity) => {
        const symbol = String(entity.symbol ?? "").toUpperCase();
        const name = String(entity.name ?? "").toLowerCase();
        return /(spx|sp500|nasdaq|dow|russell|nyse|qqq|spy|dia|iwm)/.test(symbol) || /(s&p|nasdaq|dow|russell|equity|stocks?)/.test(name);
      })
    );
    const lexicalAverage = average(lexicalArticles.map((article) => marketLexicalScore(article)));
    const score = weightedAverage(values) ?? lexicalAverage;
    return {
      score: score == null ? null : normalizeScore(score),
      driver: score == null ? null : summarizeDriver("market", relevantArticles[0] ?? lexicalArticles[0], score),
      hasEntities: lexicalArticles.some((article) => asArray(article.entities).length > 0),
      usableEntities: values.length,
      lexicalUsed: values.length === 0,
      lexicalNonZero: values.length === 0 && lexicalAverage != null && Math.abs(lexicalAverage) > 0.001,
      articleCount: lexicalArticles.length,
      discardedArticleCount,
    };
  }

  const values = relevantArticles.flatMap((article) => extractEntityScores(article));
  const lexicalAverage = average(lexicalArticles.map((article) => macroLexicalScore(article)));
  const score = weightedAverage(values) ?? lexicalAverage;
  return {
    score: score == null ? null : normalizeScore(score),
    driver: score == null ? null : summarizeDriver("macro", relevantArticles[0] ?? lexicalArticles[0], score),
    hasEntities: lexicalArticles.some((article) => asArray(article.entities).length > 0),
    usableEntities: values.length,
    lexicalUsed: values.length === 0,
    lexicalNonZero: values.length === 0 && lexicalAverage != null && Math.abs(lexicalAverage) > 0.001,
    articleCount: lexicalArticles.length,
    discardedArticleCount,
  };
}

async function fetchChannelStage(apiToken: string, channel: ChannelKey, stage: QueryStage): Promise<ChannelResult> {
  const url = buildMarketauxUrl(apiToken, channel, stage);
  debugNews("fetch start", { channel, stage });
  debugNews("request params", {
    channel,
    stage,
    path: url.pathname,
    queryParamNames: [...url.searchParams.keys()],
    query: {
      symbols: url.searchParams.get("symbols"),
      search: url.searchParams.get("search"),
      entity_types: url.searchParams.get("entity_types"),
      countries: url.searchParams.get("countries"),
      must_have_entities: url.searchParams.get("must_have_entities"),
      published_after: url.searchParams.get("published_after"),
      limit: url.searchParams.get("limit"),
    },
  });

  const res = await fetchWithRetry(url.toString(), { cache: "no-store" }, { retries: 1 });
  debugNews(`response ${res.status} from ${url.pathname} for ${channel}:${stage}`);
  if (!res.ok) {
    const snippet = await responseSnippet(res);
    debugNews("error body", { channel, stage, status: res.status, body: snippet });
    debugNews("fetch result", { channel, stage, articleCount: 0 });
    return {
      key: channel,
      stage,
      articles: [],
      score: null,
      driver: null,
      articleCount: 0,
      discardedArticleCount: 0,
      hasEntities: false,
      usableEntities: 0,
      lexicalUsed: false,
      lexicalNonZero: false,
      errorCode: classifyBodyError(res.status, snippet),
    };
  }

  const json = (await res.json()) as MarketauxNewsResponse;
  let articles = asArray(json.data);
  if (!articles.length && stage === "fallback") {
    const relaxedUrl = buildRelaxedMarketauxUrl(apiToken, channel);
    const relaxedRes = await fetchWithRetry(relaxedUrl.toString(), { cache: "no-store" }, { retries: 1 });
    if (relaxedRes.ok) {
      const relaxedJson = (await relaxedRes.json()) as MarketauxNewsResponse;
      articles = asArray(relaxedJson.data);
    } else {
      const snippet = await responseSnippet(relaxedRes);
      debugNews("error body", { channel, stage: "relaxed", status: relaxedRes.status, body: snippet });
    }
  }
  debugNews("fetch result", { channel, stage, articleCount: articles.length });
  const scored = channelScore(channel, articles);
  debugNews("channel payload summary", {
    channel,
    stage,
    articleCount: articles.length,
    relevantArticleCount: scored.articleCount,
    discardedArticleCount: scored.discardedArticleCount,
    hasEntities: scored.hasEntities,
    usableEntities: scored.usableEntities,
    lexicalUsed: scored.lexicalUsed,
    lexicalNonZero: scored.lexicalNonZero,
    score: scored.score,
  });

  return {
    key: channel,
    stage,
    articles,
    score: scored.score,
    driver: scored.driver,
    articleCount: scored.articleCount,
    discardedArticleCount: scored.discardedArticleCount,
    hasEntities: scored.hasEntities,
    usableEntities: scored.usableEntities,
    lexicalUsed: scored.lexicalUsed,
    lexicalNonZero: scored.lexicalNonZero,
  };
}

async function fetchChannel(apiToken: string, channel: ChannelKey): Promise<ChannelResult> {
  const primary = await fetchChannelStage(apiToken, channel, "primary");
  if (primary.errorCode) return primary;
  if (primary.score != null) return primary;

  const fallback = await fetchChannelStage(apiToken, channel, "fallback");
  if (fallback.score != null || fallback.errorCode) return fallback;
  if (fallback.articles.length > 0) {
    return {
      ...fallback,
      score: 0,
      driver: fallbackDriver(channel, 0),
    };
  }
  return primary;
}

export function fallbackNewsSentiment(errorCode = "provider_unavailable"): NewsSentimentDto {
  return {
    score: 0,
    label: "neutral",
    drivers: ["No usable sentiment data."],
    updatedAt: Date.now(),
    source: "marketaux",
    isAvailable: false,
    isFallback: true,
    errorCode,
  };
}

function cacheFallback(errorCode: string) {
  const fallback = fallbackNewsSentiment(errorCode);
  const ttl = errorCode === "rate_limited" || errorCode === "usage_limit_reached" ? MARKET_PULSE_TTL.newsSentimentCooldownMs : MARKET_PULSE_TTL.newsSentimentMs;
  cache.set(KEY, fallback, ttl);
  return fallback;
}

export async function getNewsSentimentSnapshot(): Promise<NewsSentimentDto> {
  debugNews("provider invoked");
  const apiToken = process.env.MARKETAUX_API_TOKEN?.trim();
  if (!apiToken) {
    return fallbackNewsSentiment("missing_api_key");
  }

  const cached = cache.get(KEY);
  if (cached) return cached;
  const current = inflight.get(KEY);
  if (current) return current;

  const task = (async () => {
    const channels = await Promise.all([
      fetchChannel(apiToken, "crypto"),
      fetchChannel(apiToken, "macro"),
      fetchChannel(apiToken, "market"),
    ]);

    const weightedChannels = [
      { key: "crypto", weight: 0.5 },
      { key: "macro", weight: 0.3 },
      { key: "market", weight: 0.2 },
    ] as const;

    const usable = weightedChannels
      .map((meta) => ({ meta, channel: channels.find((channel) => channel.key === meta.key) }))
      .filter((item): item is { meta: (typeof weightedChannels)[number]; channel: ChannelResult } => !!item.channel && item.channel.score != null);

    debugNews("scoring", {
      cryptoHeadlineScore: channels.find((channel) => channel.key === "crypto")?.score ?? null,
      macroHeadlineScore: channels.find((channel) => channel.key === "macro")?.score ?? null,
      marketHeadlineScore: channels.find((channel) => channel.key === "market")?.score ?? null,
      availableChannels: usable.map((item) => `${item.meta.key}:${item.channel.stage}`),
      finalAvailability: usable.length > 0,
      channelDiagnostics: channels.map((channel) => ({
        key: channel.key,
        stage: channel.stage,
        articleCount: channel.articleCount,
        discardedArticleCount: channel.discardedArticleCount,
        hasEntities: channel.hasEntities,
        usableEntities: channel.usableEntities,
        lexicalUsed: channel.lexicalUsed,
        lexicalNonZero: channel.lexicalNonZero,
        score: channel.score,
      })),
    });

    if (!usable.length) {
      const errorCodes = channels.map((channel) => channel.errorCode).filter(Boolean);
      const errorCode = errorCodes.includes("usage_limit_reached")
        ? "usage_limit_reached"
        : errorCodes.includes("rate_limited")
          ? "rate_limited"
          : errorCodes.includes("invalid_api_key")
            ? "invalid_api_key"
            : errorCodes.includes("upstream_error")
              ? "upstream_error"
              : channels.some((channel) => channel.articles.length > 0)
                ? "unusable_provider_payload"
                : "empty_provider_payload";
      debugNews("scoring", {
        availableChannels: [],
        finalAvailability: false,
        finalScore: null,
        errorCode,
      });
      return cacheFallback(errorCode);
    }

    const totalWeight = usable.reduce((sum, item) => sum + item.meta.weight, 0);
    const score = clamp(
      usable.reduce((sum, item) => sum + (item.channel.score ?? 0) * item.meta.weight, 0) / Math.max(totalWeight, 1),
      -100,
      100
    );
    const drivers = usable
      .map((item) => item.channel.driver)
      .filter((driver): driver is string => !!driver)
      .slice(0, 2);

    debugNews("scoring", {
      availableChannels: usable.map((item) => item.meta.key),
      finalAvailability: true,
      finalScore: score,
      errorCode: null,
    });
    const dto: NewsSentimentDto = {
      score,
      label: classifyNewsSentiment(score),
      drivers: drivers.length ? drivers : fallbackNewsSentiment().drivers,
      updatedAt: Date.now(),
      source: "marketaux",
      isAvailable: true,
      isFallback: false,
    };
    cache.set(KEY, dto, MARKET_PULSE_TTL.newsSentimentMs);
    return dto;
  })();

  inflight.set(KEY, task);
  return task;
}
