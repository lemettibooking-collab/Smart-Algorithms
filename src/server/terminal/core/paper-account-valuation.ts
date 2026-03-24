import { binanceTerminalMarketDataAdapter } from "@/src/server/terminal/adapters/binance/market-data";
import { mexcTerminalMarketDataAdapter } from "@/src/server/terminal/adapters/mexc/market-data";
import { listPaperBalances } from "@/src/server/terminal/repositories/paper-account-repository";
import type {
  TerminalAccountValuationAssetDto,
  TerminalAccountValuationDto,
  TerminalAccountValuationResponse,
  TerminalExchange,
} from "@/src/shared/model/terminal/contracts";

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number) {
  const normalized = Number(value.toFixed(12));
  if (!Number.isFinite(normalized) || normalized <= 0) return "0";
  return normalized.toFixed(12).replace(/\.?0+$/, "");
}

export function mapValuationAssetsToBalances(assets: TerminalAccountValuationAssetDto[]) {
  return assets.map((asset) => ({
    asset: asset.asset,
    free: asset.free,
    locked: asset.locked,
    usdValue: asset.usdValue,
  }));
}

async function getUsdPrice(exchange: TerminalExchange, asset: string) {
  if (asset === "USDT") {
    return {
      priceUsd: 1,
      pricingSymbol: "USDT",
      updatedAt: Date.now(),
    };
  }

  const pricingSymbol = `${asset}USDT`;
  const adapter = exchange === "mexc" ? mexcTerminalMarketDataAdapter : binanceTerminalMarketDataAdapter;
  const market = await adapter.getScalpMarket({
    exchange,
    symbol: pricingSymbol,
  });

  if (!market.ok) {
    return {
      priceUsd: null,
      pricingSymbol,
      updatedAt: null,
    };
  }

  if (market.health.source !== "exchange_snapshot" || market.health.fallbackUsed) {
    return {
      priceUsd: null,
      pricingSymbol,
      updatedAt: market.health.updatedAt,
    };
  }

  const midPrice = Number(market.market.midPrice);
  return {
    priceUsd: Number.isFinite(midPrice) && midPrice > 0 ? midPrice : null,
    pricingSymbol,
    updatedAt: market.market.updatedAt,
  };
}

export async function getTerminalAssetUsdPrice(exchange: TerminalExchange, asset: string) {
  return getUsdPrice(exchange, asset);
}

export async function getTerminalSymbolMarkPrice(exchange: TerminalExchange, symbol: string) {
  const adapter = exchange === "mexc" ? mexcTerminalMarketDataAdapter : binanceTerminalMarketDataAdapter;
  const market = await adapter.getScalpMarket({
    exchange,
    symbol,
  });

  if (!market.ok || market.health.source !== "exchange_snapshot" || market.health.fallbackUsed) {
    return {
      price: null,
      updatedAt: market.ok ? market.health.updatedAt : null,
    };
  }

  const midPrice = Number(market.market.midPrice);
  return {
    price: Number.isFinite(midPrice) && midPrice > 0 ? midPrice : null,
    updatedAt: market.market.updatedAt,
  };
}

export async function getPaperAccountValuation(input: {
  exchange: TerminalExchange;
}): Promise<TerminalAccountValuationResponse> {
  const balances = listPaperBalances(input.exchange);

  const assets = await Promise.all(
    balances.map(async (balance) => {
      const free = toNumber(balance.free);
      const locked = toNumber(balance.locked);
      const total = free + locked;
      const { priceUsd, pricingSymbol, updatedAt } = await getUsdPrice(input.exchange, balance.asset);
      const usdValue = priceUsd == null ? null : Number((total * priceUsd).toFixed(2));

      return {
        asset: balance.asset,
        free: balance.free,
        locked: balance.locked,
        total: formatAmount(total),
        priceUsd,
        usdValue,
        pricingSymbol,
        updatedAt,
      } satisfies TerminalAccountValuationAssetDto;
    }),
  );

  const updatedAt = assets.reduce((latest, asset) => {
    const assetUpdatedAt = asset.updatedAt ?? 0;
    return assetUpdatedAt > latest ? assetUpdatedAt : latest;
  }, 0);
  const equityUsd = Number(
    assets
      .reduce((total, asset) => total + (asset.usdValue ?? 0), 0)
      .toFixed(2),
  );

  return {
    ok: true,
    account: {
      exchange: input.exchange,
      equityUsd,
      assets,
      updatedAt: updatedAt || Date.now(),
    } satisfies TerminalAccountValuationDto,
  };
}
