import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { TerminalExchange, TerminalOrderSide } from "@/src/shared/model/terminal/contracts";
import type { PaperExecutionLiquidity } from "@/src/server/terminal/core/paper-execution-config";
import type { Database } from "better-sqlite3";

export type PaperFillLedgerEntry = {
  id: string;
  orderId: string;
  exchange: TerminalExchange;
  symbol: string;
  side: TerminalOrderSide;
  baseAsset: string;
  quoteAsset: string;
  qty: string;
  price: string;
  notional: string;
  feeAmount: string;
  feeAsset: string | null;
  liquidity: PaperExecutionLiquidity | null;
  createdAt: string;
  createdAtMs: number;
};

type PaperFillRow = {
  id: string;
  order_id: string;
  exchange: string;
  symbol: string;
  side: string;
  base_asset: string;
  quote_asset: string;
  qty: string;
  price: string;
  notional: string;
  fee_amount: string | null;
  fee_asset: string | null;
  liquidity: string | null;
  created_at: string;
  created_at_ms: number;
};

function toEntry(row: PaperFillRow): PaperFillLedgerEntry {
  return {
    id: row.id,
    orderId: row.order_id,
    exchange: row.exchange as TerminalExchange,
    symbol: row.symbol,
    side: row.side as TerminalOrderSide,
    baseAsset: row.base_asset,
    quoteAsset: row.quote_asset,
    qty: row.qty,
    price: row.price,
    notional: row.notional,
    feeAmount: row.fee_amount ?? "0",
    feeAsset: row.fee_asset ?? null,
    liquidity: (row.liquidity as PaperExecutionLiquidity | null) ?? null,
    createdAt: row.created_at,
    createdAtMs: row.created_at_ms,
  };
}

export function createPaperFillLedgerEntry(
  input: {
    orderId: string;
    exchange: TerminalExchange;
    symbol: string;
    side: TerminalOrderSide;
    baseAsset: string;
    quoteAsset: string;
    qty: string;
    price: string;
    notional: string;
    feeAmount?: string;
    feeAsset?: string | null;
    liquidity?: PaperExecutionLiquidity;
    createdAtMs?: number;
  },
  dbArg?: Database,
): PaperFillLedgerEntry | null {
  const db = dbArg ?? getDb();
  const createdAtMs = input.createdAtMs ?? Date.now();
  const id = `fill-${createdAtMs.toString(36)}-${randomUUID().slice(0, 8)}`;
  const createdAt = new Date(createdAtMs).toISOString();

  const result = db
    .prepare(
      `INSERT OR IGNORE INTO terminal_paper_fills(
        id,
        order_id,
        exchange,
        symbol,
        side,
        base_asset,
        quote_asset,
        qty,
        price,
        notional,
        fee_amount,
        fee_asset,
        liquidity,
        created_at,
        created_at_ms
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.orderId,
      input.exchange,
      input.symbol,
      input.side,
      input.baseAsset,
      input.quoteAsset,
      input.qty,
      input.price,
      input.notional,
      input.feeAmount ?? "0",
      input.feeAsset ?? null,
      input.liquidity ?? null,
      createdAt,
      createdAtMs,
    ) as { changes?: number };

  if (result.changes === 0) {
    return null;
  }

  return {
    id,
    orderId: input.orderId,
    exchange: input.exchange,
    symbol: input.symbol,
    side: input.side,
    baseAsset: input.baseAsset,
    quoteAsset: input.quoteAsset,
    qty: input.qty,
    price: input.price,
    notional: input.notional,
    feeAmount: input.feeAmount ?? "0",
    feeAsset: input.feeAsset ?? null,
    liquidity: input.liquidity ?? null,
    createdAt,
    createdAtMs,
  };
}

export function listPaperFillLedger(params: {
  exchange: TerminalExchange;
  symbol?: string;
}): PaperFillLedgerEntry[] {
  const db = getDb();
  const hasSymbol = Boolean(params.symbol);
  const sql = `
    SELECT id, order_id, exchange, symbol, side, base_asset, quote_asset, qty, price, notional, fee_amount, fee_asset, liquidity, created_at, created_at_ms
    FROM terminal_paper_fills
    WHERE exchange = ?
      ${hasSymbol ? "AND symbol = ?" : ""}
    ORDER BY created_at_ms ASC
  `;
  const rows = (hasSymbol
    ? db.prepare(sql).all(params.exchange, params.symbol)
    : db.prepare(sql).all(params.exchange)) as PaperFillRow[];

  return rows.map(toEntry);
}
