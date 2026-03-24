import type {
  TerminalOrderDraft,
  TerminalOrderValidationField,
  TerminalOrderValidationIssue,
  TerminalOrderValidationResult,
  TerminalSymbolMetaDto,
} from "@/src/shared/model/terminal/contracts";

function pushIssue(
  issues: TerminalOrderValidationIssue[],
  code: string,
  message: string,
  field?: TerminalOrderValidationField,
) {
  issues.push({ code, message, field });
}

function isDecimalString(value: string) {
  return /^\d+(?:\.\d+)?$/.test(value);
}

function decimalPlaces(value: string) {
  const [, fraction = ""] = value.split(".");
  return fraction.length;
}

function toScaledInt(value: string, scale: number) {
  const [whole, fraction = ""] = value.split(".");
  const padded = `${whole}${fraction.padEnd(scale, "0")}`;
  const parsed = Number(padded || "0");
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isAlignedToIncrement(value: string, increment?: string) {
  if (!increment) return true;
  if (!isDecimalString(value) || !isDecimalString(increment)) return false;
  const scale = Math.max(decimalPlaces(value), decimalPlaces(increment));
  const incrementScaled = toScaledInt(increment, scale);
  if (!Number.isFinite(incrementScaled) || incrementScaled === 0) return false;
  const valueScaled = toScaledInt(value, scale);
  return Number.isFinite(valueScaled) && valueScaled % incrementScaled === 0;
}

function isAtLeast(value: string, minimum?: string) {
  if (!minimum) return true;
  if (!isDecimalString(value) || !isDecimalString(minimum)) return false;
  const scale = Math.max(decimalPlaces(value), decimalPlaces(minimum));
  const valueScaled = toScaledInt(value, scale);
  const minimumScaled = toScaledInt(minimum, scale);
  return Number.isFinite(valueScaled) && Number.isFinite(minimumScaled) && valueScaled >= minimumScaled;
}

function parsePositiveNumber(value: string) {
  if (!isDecimalString(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function validateTerminalOrderDraft(
  draft: TerminalOrderDraft,
  symbolMeta?: TerminalSymbolMetaDto | null,
): TerminalOrderValidationResult {
  const issues: TerminalOrderValidationIssue[] = [];
  const symbol = draft.symbol.trim().toUpperCase();
  const quantity = draft.quantity.trim();
  const price = draft.price?.trim() ?? "";

  if (draft.exchange !== "binance" && draft.exchange !== "mexc") {
    pushIssue(issues, "unsupported_exchange", "Only binance and mexc paper orders are supported in the terminal shell right now.", "symbol");
  }

  if (!symbol || !/^[A-Z0-9]{5,20}$/.test(symbol)) {
    pushIssue(issues, "invalid_symbol", "Enter a valid symbol like BTCUSDT.", "symbol");
  }

  if (!symbolMeta || symbolMeta.symbol !== symbol || symbolMeta.exchange !== draft.exchange) {
    pushIssue(issues, "symbol_meta_unavailable", "Symbol meta is unavailable for the current pair.", "symbol");
  }

  if (draft.side !== "BUY" && draft.side !== "SELL") {
    pushIssue(issues, "invalid_side", "Select a valid order side.", "side");
  }

  if (draft.type !== "MARKET" && draft.type !== "LIMIT") {
    pushIssue(issues, "invalid_type", "Select a valid order type.", "type");
  }

  if (!quantity) {
    pushIssue(issues, "quantity_required", "Quantity is required.", "quantity");
  } else {
    const parsedQuantity = parsePositiveNumber(quantity);
    if (parsedQuantity == null) {
      pushIssue(issues, "quantity_invalid", "Quantity must be a positive number.", "quantity");
    } else {
      if (!isAtLeast(quantity, symbolMeta?.filters.minQty)) {
        pushIssue(issues, "quantity_too_small", `Quantity must be at least ${symbolMeta?.filters.minQty}.`, "quantity");
      }
      if (!isAlignedToIncrement(quantity, symbolMeta?.filters.stepSize)) {
        pushIssue(issues, "quantity_step_mismatch", `Quantity must align to step size ${symbolMeta?.filters.stepSize}.`, "quantity");
      }
    }
  }

  if (draft.type === "LIMIT") {
    if (!price) {
      pushIssue(issues, "price_required", "Price is required for limit orders.", "price");
    } else {
      const parsedPrice = parsePositiveNumber(price);
      if (parsedPrice == null) {
        pushIssue(issues, "price_invalid", "Price must be a positive number.", "price");
      } else {
        if (!isAlignedToIncrement(price, symbolMeta?.filters.tickSize)) {
          pushIssue(issues, "price_tick_mismatch", `Price must align to tick size ${symbolMeta?.filters.tickSize}.`, "price");
        }
        const parsedQuantity = parsePositiveNumber(quantity);
        const minNotional = symbolMeta?.filters.minNotional ? Number(symbolMeta.filters.minNotional) : null;
        if (parsedQuantity != null && minNotional != null && Number.isFinite(minNotional) && parsedQuantity * parsedPrice < minNotional) {
          pushIssue(issues, "notional_too_small", `Order value must be at least ${symbolMeta?.filters.minNotional}.`, "quantity");
        }
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
