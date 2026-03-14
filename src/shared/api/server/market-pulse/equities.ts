import { TTLCache, InFlight, fetchWithRetry } from "@/lib/server-cache";
import { MARKET_PULSE_EQUITY_INDEXES, MARKET_PULSE_TTL } from "@/src/shared/config/market-pulse";
import type { EquitiesPulseDto, EquityPulseItemDto } from "@/src/entities/market-pulse";
import { classifyEquitiesRisk, computeEquitiesBreadth } from "@/src/shared/lib/market-pulse/scoring";

const cache = new TTLCache<EquitiesPulseDto>(MARKET_PULSE_TTL.equitiesMs, 16);
const inflight = new InFlight<EquitiesPulseDto>();
const KEY = "equities-pulse:v1";
const DEBUG_MARKET_PULSE = process.env.DEBUG_MARKET_PULSE === "1";

function debugEquities(message: string, payload?: unknown) {
  if (!DEBUG_MARKET_PULSE) return;
  if (payload === undefined) {
    console.warn(`[market-pulse/equities] ${message}`);
    return;
  }
  console.warn(`[market-pulse/equities] ${message}`, payload);
}

async function responseSnippet(res: Response) {
  const text = await res.clone().text().catch(() => "");
  return text.slice(0, 500);
}

function classifyBodyError(status: number, body: string) {
  const text = body.toLowerCase();
  if (status === 429 || text.includes("rate limit")) return "rate_limited";
  if (status === 401 || text.includes("invalid api") || text.includes("invalid api key") || text.includes("invalid key")) return "invalid_api_key";
  if (status === 403 || text.includes("not available in your plan") || text.includes("upgrade your plan") || text.includes("subscription")) return "wrong_endpoint";
  if (status === 404) return "wrong_endpoint";
  if (status >= 500) return "upstream_error";
  return "provider_unavailable";
}

function toPct(value: unknown) {
  const raw = String(value ?? "").replace(/[()%\s,]/g, "").trim();
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeSymbol(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function findMatch(rows: Array<Record<string, unknown>>, target: string) {
  const normalizedTarget = normalizeSymbol(target);
  const aliases = new Set([
    normalizedTarget,
    normalizedTarget.replace(/^0+/, ""),
    normalizedTarget.replace(/^GSPC$/, "SPX"),
    normalizedTarget.replace(/^GSPC$/, "SP500"),
    normalizedTarget.replace(/^GSPC$/, "SANDP500"),
    normalizedTarget.replace(/^DJI$/, "DJIA"),
    normalizedTarget.replace(/^DJI$/, "DOWJONES"),
    normalizedTarget.replace(/^IXIC$/, "NASDAQ"),
    normalizedTarget.replace(/^IXIC$/, "NASDAQCOMPOSITE"),
    normalizedTarget.replace(/^RUT$/, "RUSSELL2000"),
  ]);

  return rows.find((row) => {
    const symbol = normalizeSymbol(row.symbol);
    const name = normalizeSymbol(row.name);
    return aliases.has(symbol) || aliases.has(name);
  });
}

function mapBatchItems(rows: Array<Record<string, unknown>>) {
  return MARKET_PULSE_EQUITY_INDEXES.map((indexDef) => {
    const match = findMatch(rows, indexDef.symbol);
    const price = toNumber(match?.price);
    const changePct24h = toPct(match?.changesPercentage) ?? toPct(match?.changePercentage) ?? null;
    return {
      key: indexDef.key,
      name: indexDef.name,
      price: price ?? 0,
      changePct24h: changePct24h ?? 0,
      isAvailable: price != null && changePct24h != null,
    } satisfies EquityPulseItemDto;
  });
}

function computeChangePctFromSeries(latestClose: number, previousClose: number) {
  if (!Number.isFinite(latestClose) || !Number.isFinite(previousClose) || previousClose === 0) return null;
  return ((latestClose - previousClose) / previousClose) * 100;
}

function parseHistoricalSeriesPayload(payload: unknown): Array<{ date: string; price: number }> {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => asObject(item))
      .filter((item): item is Record<string, unknown> => !!item)
      .map((item) => ({
        date: String(item.date ?? ""),
        price: Number(item.price ?? item.close),
      }))
      .filter((item) => Number.isFinite(item.price));
  }

  const obj = asObject(payload);
  if (!obj) return [];

  const historical = Array.isArray(obj.historical) ? obj.historical : Array.isArray(obj.data) ? obj.data : [];
  return historical
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => !!item)
    .map((item) => ({
      date: String(item.date ?? ""),
      price: Number(item.price ?? item.close),
    }))
    .filter((item) => Number.isFinite(item.price))
    .sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
}

async function fetchHistoricalItem(symbol: string, apiKey: string): Promise<{ status: number; body: string; item: EquityPulseItemDto | null }> {
  const url = new URL("https://financialmodelingprep.com/stable/historical-price-eod/light");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  debugEquities("historical request", {
    path: url.pathname,
    queryParamNames: [...url.searchParams.keys()],
    symbol,
  });

  const res = await fetchWithRetry(url.toString(), { cache: "no-store" }, { retries: 1 });
  const body = await responseSnippet(res);
  if (!res.ok) {
    debugEquities(`historical response ${res.status} for ${symbol}`);
    debugEquities("historical error body", body);
    return { status: res.status, body, item: null };
  }

  const json = (await res.json()) as unknown;
  const series = parseHistoricalSeriesPayload(json);
  debugEquities("historical payload shape", {
    symbol,
    isArray: Array.isArray(json),
    sample: Array.isArray(json)
      ? json.slice(0, 2)
      : asObject(json)
        ? {
            keys: Object.keys(asObject(json) ?? {}).slice(0, 8),
            historicalSample: Array.isArray((asObject(json) ?? {}).historical)
              ? ((asObject(json) ?? {}).historical as unknown[]).slice(0, 2)
              : null,
          }
        : null,
  });
  const latest = series[0]?.price;
  const previous = series[1]?.price;
  const changePct24h = latest != null && previous != null ? computeChangePctFromSeries(latest, previous) : null;
  const match = MARKET_PULSE_EQUITY_INDEXES.find((item) => item.symbol === symbol);

  const item: EquityPulseItemDto | null = match
    ? {
        key: match.key,
        name: match.name,
        price: latest ?? 0,
        changePct24h: changePct24h ?? 0,
        isAvailable: latest != null && changePct24h != null,
      }
    : null;

  return { status: res.status, body, item };
}

async function fetchHistoricalFallback(apiKey: string): Promise<{ items: EquityPulseItemDto[]; errorCode: string | null }> {
  const results = await Promise.all(MARKET_PULSE_EQUITY_INDEXES.map((item) => fetchHistoricalItem(item.symbol, apiKey)));
  const items = results
    .map((result) => result.item)
    .filter((item): item is EquityPulseItemDto => !!item);

  debugEquities("historical normalized items", items);

  if (items.some((item) => item.isAvailable)) {
    return { items, errorCode: null };
  }

  const statuses = results.map((result) => result.status);
  const bodies = results.map((result) => result.body).join(" | ");
  if (statuses.some((status) => status === 401)) return { items, errorCode: "invalid_api_key" };
  if (statuses.some((status) => status === 429)) return { items, errorCode: "rate_limited" };
  if (statuses.some((status) => status === 403 || status === 404)) return { items, errorCode: "unsupported_symbol" };
  if (bodies.toLowerCase().includes("not available in your plan")) return { items, errorCode: "wrong_endpoint" };
  return { items, errorCode: "empty_provider_payload" };
}

export function fallbackEquitiesPulse(errorCode = "provider_unavailable"): EquitiesPulseDto {
  const items: EquityPulseItemDto[] = MARKET_PULSE_EQUITY_INDEXES.map((item) => ({
    key: item.key,
    name: item.name,
    price: 0,
    changePct24h: 0,
    isAvailable: false,
  }));

  return {
    label: "mixed",
    breadth: 0,
    items,
    updatedAt: Date.now(),
    source: "fmp",
    isAvailable: false,
    isFallback: true,
    errorCode,
  };
}

export async function getEquitiesPulseSnapshot(): Promise<EquitiesPulseDto> {
  const apiKey = process.env.FMP_API_KEY?.trim();
  if (!apiKey) return fallbackEquitiesPulse("missing_api_key");

  const cached = cache.get(KEY);
  if (cached) return cached;
  const current = inflight.get(KEY);
  if (current) return current;

  const task = (async () => {
    const url = new URL("https://financialmodelingprep.com/stable/batch-index-quotes");
    url.searchParams.set("apikey", apiKey);
    debugEquities("request", {
      path: url.pathname,
      queryParamNames: [...url.searchParams.keys()],
      symbols: MARKET_PULSE_EQUITY_INDEXES.map((item) => item.symbol),
    });

    const res = await fetchWithRetry(url.toString(), { cache: "no-store" }, { retries: 1 });
    debugEquities(`response ${res.status} from ${url.pathname}`);
    if (!res.ok) {
      const snippet = await responseSnippet(res);
      debugEquities("error body", snippet);
      const errorCode = classifyBodyError(res.status, snippet);
      if (errorCode === "wrong_endpoint" || errorCode === "provider_unavailable") {
        debugEquities("falling back to per-index historical endpoint");
        const historical = await fetchHistoricalFallback(apiKey);
        if (!historical.errorCode) {
          const availableItems = historical.items.filter((item) => item.isAvailable);
          const dto: EquitiesPulseDto = {
            label: classifyEquitiesRisk(availableItems),
            breadth: computeEquitiesBreadth(availableItems),
            items: historical.items,
            updatedAt: Date.now(),
            source: "fmp",
            isAvailable: true,
            isFallback: false,
          };
          cache.set(KEY, dto, MARKET_PULSE_TTL.equitiesMs);
          return dto;
        }
        return fallbackEquitiesPulse(historical.errorCode);
      }
      return fallbackEquitiesPulse(errorCode);
    }
    const json = (await res.json()) as Array<Record<string, unknown>>;
    debugEquities("payload shape", {
      isArray: Array.isArray(json),
      length: Array.isArray(json) ? json.length : 0,
      sample: Array.isArray(json) ? json.slice(0, 2).map((row) => ({ symbol: row.symbol, name: row.name, changesPercentage: row.changesPercentage, change: row.change, price: row.price })) : null,
    });
    if (!Array.isArray(json)) {
      debugEquities("falling back to per-index historical endpoint because batch payload is not an array");
      const historical = await fetchHistoricalFallback(apiKey);
      if (!historical.errorCode) {
        const availableItems = historical.items.filter((item) => item.isAvailable);
        const dto: EquitiesPulseDto = {
          label: classifyEquitiesRisk(availableItems),
          breadth: computeEquitiesBreadth(availableItems),
          items: historical.items,
          updatedAt: Date.now(),
          source: "fmp",
          isAvailable: true,
          isFallback: false,
        };
        cache.set(KEY, dto, MARKET_PULSE_TTL.equitiesMs);
        return dto;
      }
      return fallbackEquitiesPulse(historical.errorCode);
    }

    const items = mapBatchItems(json);
    debugEquities("normalized items", items);

    const availableItems = items.filter((item) => item.isAvailable);
    if (!availableItems.length) {
      debugEquities("falling back to per-index historical endpoint because batch items were not usable");
      const historical = await fetchHistoricalFallback(apiKey);
      if (!historical.errorCode) {
        const historicalAvailableItems = historical.items.filter((item) => item.isAvailable);
        const dto: EquitiesPulseDto = {
          label: classifyEquitiesRisk(historicalAvailableItems),
          breadth: computeEquitiesBreadth(historicalAvailableItems),
          items: historical.items,
          updatedAt: Date.now(),
          source: "fmp",
          isAvailable: true,
          isFallback: false,
        };
        cache.set(KEY, dto, MARKET_PULSE_TTL.equitiesMs);
        return dto;
      }
      const hasRows = json.length > 0;
      return fallbackEquitiesPulse(historical.errorCode ?? (hasRows ? "unsupported_symbol" : "empty_provider_payload"));
    }

    const dto: EquitiesPulseDto = {
      label: classifyEquitiesRisk(availableItems),
      breadth: computeEquitiesBreadth(availableItems),
      items,
      updatedAt: Date.now(),
      source: "fmp",
      isAvailable: true,
      isFallback: false,
    };
    cache.set(KEY, dto, MARKET_PULSE_TTL.equitiesMs);
    return dto;
  })();

  inflight.set(KEY, task);
  return task;
}
