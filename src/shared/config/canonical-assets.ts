import type { CanonicalAssetFlags } from "@/src/shared/lib/market-universe-types";

type CanonicalAssetOverride = {
  assetId?: string;
  displayName?: string;
  aliases?: string[];
  flags?: Partial<CanonicalAssetFlags>;
  tags?: string[];
};

const DEFAULT_FLAGS: CanonicalAssetFlags = {
  stable: false,
  leveraged: false,
  wrapped: false,
  synthetic: false,
  ignoreFromMarketMetrics: false,
};

const CANONICAL_ASSET_REGISTRY: Record<string, CanonicalAssetOverride> = {
  BTC: { aliases: ["XBT"], displayName: "Bitcoin" },
  ETH: { displayName: "Ethereum" },
  SOL: { displayName: "Solana" },
  USDT: { displayName: "Tether", flags: { stable: true, ignoreFromMarketMetrics: true } },
  USDC: { displayName: "USD Coin", flags: { stable: true, ignoreFromMarketMetrics: true } },
  BUSD: { displayName: "Binance USD", flags: { stable: true, ignoreFromMarketMetrics: true } },
  FDUSD: { displayName: "First Digital USD", flags: { stable: true, ignoreFromMarketMetrics: true } },
  TUSD: { displayName: "TrueUSD", flags: { stable: true, ignoreFromMarketMetrics: true } },
  DAI: { displayName: "Dai", flags: { stable: true, ignoreFromMarketMetrics: true } },
  USDP: { displayName: "Pax Dollar", flags: { stable: true, ignoreFromMarketMetrics: true } },
  USDE: { displayName: "Ethena USDe", flags: { stable: true, ignoreFromMarketMetrics: true } },
  PYUSD: { displayName: "PayPal USD", flags: { stable: true, ignoreFromMarketMetrics: true } },
  EURC: { displayName: "Euro Coin", flags: { stable: true, ignoreFromMarketMetrics: true } },
  WBTC: { displayName: "Wrapped Bitcoin", flags: { wrapped: true } },
  WETH: { displayName: "Wrapped Ether", flags: { wrapped: true } },
  WBNB: { displayName: "Wrapped BNB", flags: { wrapped: true } },
  WSOL: { displayName: "Wrapped SOL", flags: { wrapped: true } },
  STETH: { displayName: "Lido Staked Ether", flags: { wrapped: true, synthetic: true } },
  WSTETH: { displayName: "Wrapped Staked Ether", flags: { wrapped: true, synthetic: true } },
};

const aliasToBase = new Map<string, string>();
for (const [baseAsset, override] of Object.entries(CANONICAL_ASSET_REGISTRY)) {
  aliasToBase.set(baseAsset, baseAsset);
  for (const alias of override.aliases ?? []) aliasToBase.set(alias.toUpperCase(), baseAsset);
}

export function resolveCanonicalBaseAsset(baseAsset: string) {
  const clean = String(baseAsset ?? "").trim().toUpperCase();
  return aliasToBase.get(clean) ?? clean;
}

export function getCanonicalAssetOverride(baseAsset: string) {
  const canonicalBase = resolveCanonicalBaseAsset(baseAsset);
  return CANONICAL_ASSET_REGISTRY[canonicalBase] ?? null;
}

export function mergeCanonicalAssetFlags(baseAsset: string, inferred: CanonicalAssetFlags): CanonicalAssetFlags {
  const override = getCanonicalAssetOverride(baseAsset);
  return {
    ...DEFAULT_FLAGS,
    ...inferred,
    ...override?.flags,
  };
}

export function getCanonicalAssetDisplayName(baseAsset: string) {
  return getCanonicalAssetOverride(baseAsset)?.displayName ?? resolveCanonicalBaseAsset(baseAsset);
}

export function getCanonicalAssetTags(baseAsset: string) {
  return getCanonicalAssetOverride(baseAsset)?.tags ?? [];
}
