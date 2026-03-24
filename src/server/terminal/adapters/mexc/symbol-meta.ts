import type { TerminalSymbolMetaAdapter } from "@/src/server/terminal/adapters/contracts";
import { fetchMexcExchangeInfoSymbol } from "@/src/server/terminal/adapters/mexc/client";
import type { TerminalSymbolMetaDto, TerminalSymbolMetaResponse } from "@/src/shared/model/terminal/contracts";

function normalizeSymbol(input?: string) {
  return input?.trim().toUpperCase() ?? "";
}

function extractFilterValue(
  filters: Array<{ filterType?: string; [key: string]: unknown }> | undefined,
  filterType: string,
  key: string,
) {
  const filter = filters?.find((item) => item.filterType === filterType);
  const value = filter?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeMexcStatus(status: unknown) {
  const normalized = String(status ?? "").trim();
  if (!normalized) return "UNKNOWN";

  if (normalized === "1") return "TRADING";
  return normalized.toUpperCase();
}

function normalizeMexcSymbolMeta(input: {
  symbol: string;
  symbolInfo: {
    symbol?: string;
    status?: string;
    baseAsset?: string;
    quoteAsset?: string;
    filters?: Array<{ filterType?: string; [key: string]: unknown }>;
  };
}): TerminalSymbolMetaDto | null {
  const symbol = normalizeSymbol(input.symbolInfo.symbol ?? input.symbol);
  const baseAsset = String(input.symbolInfo.baseAsset ?? "").trim().toUpperCase();
  const quoteAsset = String(input.symbolInfo.quoteAsset ?? "").trim().toUpperCase();

  if (!symbol || !baseAsset || !quoteAsset) return null;

  return {
    exchange: "mexc",
    symbol,
    baseAsset,
    quoteAsset,
    status: normalizeMexcStatus(input.symbolInfo.status),
    filters: {
      tickSize: extractFilterValue(input.symbolInfo.filters, "PRICE_FILTER", "tickSize"),
      stepSize: extractFilterValue(input.symbolInfo.filters, "LOT_SIZE", "stepSize"),
      minQty: extractFilterValue(input.symbolInfo.filters, "LOT_SIZE", "minQty"),
      minNotional:
        extractFilterValue(input.symbolInfo.filters, "NOTIONAL", "minNotional") ??
        extractFilterValue(input.symbolInfo.filters, "MIN_NOTIONAL", "minNotional"),
    },
  };
}

export const mexcTerminalSymbolMetaAdapter: TerminalSymbolMetaAdapter = {
  async getSymbolMeta(input): Promise<TerminalSymbolMetaResponse> {
    const symbol = normalizeSymbol(input.symbol);
    if (!symbol || !/^[A-Z0-9_]{5,20}$/.test(symbol)) {
      return {
        ok: false,
        error: {
          code: "invalid_symbol",
          message: "Symbol must look like an uppercase market pair such as BTCUSDT.",
        },
      };
    }

    try {
      const symbolInfo = await fetchMexcExchangeInfoSymbol(symbol);
      if (!symbolInfo) {
        return {
          ok: false,
          error: {
            code: "symbol_not_found",
            message: `No MEXC symbol metadata was found for ${symbol}.`,
          },
        };
      }

      const normalized = normalizeMexcSymbolMeta({ symbol, symbolInfo });
      if (!normalized) {
        return {
          ok: false,
          error: {
            code: "symbol_not_found",
            message: `MEXC symbol metadata for ${symbol} was incomplete.`,
          },
        };
      }

      return {
        ok: true,
        symbol: normalized,
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "symbol_not_found",
          message: `MEXC symbol metadata is temporarily unavailable for ${symbol}.`,
        },
      };
    }
  },
};
