import { getTerminalMarketDataAdapter } from "@/src/server/terminal/adapters";
import { getTerminalTransportMarket } from "@/src/server/terminal/transport";
import type { TerminalAccountSnapshot } from "@/src/server/terminal/account/domain/terminal-account-snapshot";
import type { TerminalAccountScope } from "@/src/server/terminal/account/domain/terminal-account-scope";
import type { TerminalAccountVersion } from "@/src/server/terminal/account/infrastructure/terminal-account-version-repo";
import { getPaperAccountValuation, mapValuationAssetsToBalances } from "@/src/server/terminal/core/paper-account-valuation";
import { getPaperPnlSummary } from "@/src/server/terminal/core/paper-pnl";
import { getTerminalOrderHistory, getTerminalOpenOrders } from "@/src/server/terminal/repositories/terminal-order-execution";

function toIso(value: number | null | undefined) {
  return value && Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function toAccountHealthState(
  value: string | null | undefined,
): "connected" | "stale" | "disconnected" {
  if (value === "connected") return "connected";
  if (value === "stale") return "stale";
  return "disconnected";
}

function pickHealthSymbol(params: {
  positions: TerminalAccountSnapshot["positions"];
  openOrders: TerminalAccountSnapshot["openOrders"];
  history: TerminalAccountSnapshot["history"];
}) {
  const activePosition = params.positions.find((position) => Number(position.quantity) > 0);
  if (activePosition?.symbol) return activePosition.symbol;

  if (params.openOrders[0]?.symbol) return params.openOrders[0].symbol;
  if (params.history[0]?.symbol) return params.history[0].symbol;
  return "BTCUSDT";
}

function sumUsdValue(params: {
  assets: Array<{
    free: string;
    locked: string;
    priceUsd: number | null;
  }>;
}) {
  return params.assets.reduce(
    (totals, asset) => {
      const free = Number(asset.free);
      const locked = Number(asset.locked);
      const priceUsd = asset.priceUsd;

      if (!Number.isFinite(free) || !Number.isFinite(locked) || priceUsd == null || !Number.isFinite(priceUsd)) {
        return totals;
      }

      totals.cash += free * priceUsd;
      totals.locked += locked * priceUsd;
      return totals;
    },
    { cash: 0, locked: 0 },
  );
}

export async function buildTerminalAccountSnapshot(input: {
  scope: TerminalAccountScope;
  version: TerminalAccountVersion;
}): Promise<TerminalAccountSnapshot> {
  const [valuation, pnl, openOrdersResponse, historyResponse] = await Promise.all([
    getPaperAccountValuation({ exchange: input.scope.exchange }),
    getPaperPnlSummary({ exchange: input.scope.exchange }),
    getTerminalOpenOrders({ exchange: input.scope.exchange }),
    getTerminalOrderHistory({ exchange: input.scope.exchange, limit: 100 }),
  ]);

  if (!valuation.ok) {
    throw new Error(valuation.error.message);
  }
  if (!pnl.ok) {
    throw new Error(pnl.error.message);
  }
  if (!openOrdersResponse.ok) {
    throw new Error(openOrdersResponse.error.message);
  }
  if (!historyResponse.ok) {
    throw new Error(historyResponse.error.message);
  }

  const balances = mapValuationAssetsToBalances(valuation.account.assets);
  const openOrders = openOrdersResponse.orders;
  const history = historyResponse.orders;
  const positions = pnl.pnl.positions;

  const healthSymbol = pickHealthSymbol({
    positions,
    openOrders,
    history,
  });

  const marketAdapter = getTerminalMarketDataAdapter();
  const marketHealthResponse = await getTerminalTransportMarket({
    exchange: input.scope.exchange,
    symbol: healthSymbol,
    snapshotLoader: ({ exchange, symbol }) =>
      marketAdapter.getScalpMarket({
        exchange,
        symbol,
      }),
  });

  const equityBreakdown = sumUsdValue({
    assets: valuation.account.assets,
  });

  return {
    scope: input.scope,
    version: input.version.version,
    updatedAt: new Date(Math.max(input.version.updatedAt, valuation.account.updatedAt, pnl.pnl.updatedAt)).toISOString(),
    refreshReason: input.version.lastReason,
    marketHealth: {
      state: marketHealthResponse.ok ? toAccountHealthState(marketHealthResponse.health.connectionState) : "disconnected",
      asOf: marketHealthResponse.ok ? toIso(marketHealthResponse.health.updatedAt) : null,
    },
    balances,
    openOrders,
    history,
    positions,
    pnl: {
      realized: pnl.pnl.realizedPnlUsd,
      unrealized: pnl.pnl.unrealizedPnlUsd,
    },
    equity: {
      total: valuation.account.equityUsd,
      cash: Number(equityBreakdown.cash.toFixed(2)),
      locked: Number(equityBreakdown.locked.toFixed(2)),
    },
  };
}
