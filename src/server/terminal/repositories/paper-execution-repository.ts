import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type {
  TerminalExchange,
  TerminalOrderDraft,
  TerminalOrderDto,
  TerminalOrderStatus,
  TerminalOrderType,
} from "@/src/shared/model/terminal/contracts";
import type { Database } from "better-sqlite3";

const ACTIVE_STATUSES: TerminalOrderStatus[] = ["NEW", "PARTIALLY_FILLED"];

type PaperOrderRow = {
  id: string;
  exchange: string;
  symbol: string;
  side: string;
  type: string;
  status: string;
  price: string | null;
  orig_qty: string;
  executed_qty: string;
  mode: string;
  dedupe_signature: string;
  created_at: string;
  created_at_ms: number;
  updated_at_ms: number;
};

type CreatePaperOrderInput = {
  draft: TerminalOrderDraft;
  dedupeSignature: string;
  status?: TerminalOrderStatus;
  executedQty?: string;
  orderPrice?: string | null;
  createdAtMs?: number;
};

function toOrderDto(row: PaperOrderRow): TerminalOrderDto {
  return {
    id: row.id,
    exchange: row.exchange as TerminalExchange,
    symbol: row.symbol,
    side: row.side as TerminalOrderDto["side"],
    type: row.type as TerminalOrderType,
    status: row.status as TerminalOrderStatus,
    price: row.price,
    origQty: row.orig_qty,
    executedQty: row.executed_qty,
    createdAt: row.created_at,
  };
}

function getActiveStatusPlaceholders() {
  return ACTIVE_STATUSES.map(() => "?").join(", ");
}

export function createPaperOrder(input: CreatePaperOrderInput, dbArg?: Database): TerminalOrderDto {
  const db = dbArg ?? getDb();
  const now = input.createdAtMs ?? Date.now();
  const orderId = `demo-${now.toString(36)}-${randomUUID().slice(0, 8)}`;
  const createdAt = new Date(now).toISOString();
  const status = input.status ?? "NEW";
  const orderPrice = input.orderPrice ?? (input.draft.type === "LIMIT" ? input.draft.price ?? null : null);
  const executedQty = input.executedQty ?? (status === "FILLED" ? input.draft.quantity : "0");

  db.prepare(
    `INSERT INTO terminal_paper_orders(
      id,
      exchange,
      symbol,
      side,
      type,
      status,
      price,
      orig_qty,
      executed_qty,
      mode,
      dedupe_signature,
      created_at,
      created_at_ms,
      updated_at_ms
    ) VALUES(
      @id,
      @exchange,
      @symbol,
      @side,
      @type,
      @status,
      @price,
      @orig_qty,
      @executed_qty,
      @mode,
      @dedupe_signature,
      @created_at,
      @created_at_ms,
      @updated_at_ms
    )`
  ).run({
    id: orderId,
    exchange: input.draft.exchange,
    symbol: input.draft.symbol,
    side: input.draft.side,
    type: input.draft.type,
    status,
    price: orderPrice,
    orig_qty: input.draft.quantity,
    executed_qty: executedQty,
    mode: input.draft.mode,
    dedupe_signature: input.dedupeSignature,
    created_at: createdAt,
    created_at_ms: now,
    updated_at_ms: now,
  });

  return {
    id: orderId,
    exchange: input.draft.exchange,
    symbol: input.draft.symbol,
    side: input.draft.side,
    type: input.draft.type,
    status,
    price: orderPrice,
    origQty: input.draft.quantity,
    executedQty,
    createdAt,
  };
}

export function findRecentActiveOrderBySignature(signature: string, minCreatedAtMs: number): TerminalOrderDto | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, exchange, symbol, side, type, status, price, orig_qty, executed_qty, mode, dedupe_signature, created_at, created_at_ms, updated_at_ms
       FROM terminal_paper_orders
       WHERE dedupe_signature = ?
         AND created_at_ms >= ?
         AND status NOT IN ('CANCELED', 'REJECTED', 'EXPIRED')
       ORDER BY created_at_ms DESC
       LIMIT 1`
    )
    .get(signature, minCreatedAtMs) as PaperOrderRow | undefined;

  return row ? toOrderDto(row) : null;
}

export function findActiveOrderById(params: {
  orderId: string;
  exchange: TerminalExchange;
  symbol: string;
}): TerminalOrderDto | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, exchange, symbol, side, type, status, price, orig_qty, executed_qty, mode, dedupe_signature, created_at, created_at_ms, updated_at_ms
       FROM terminal_paper_orders
       WHERE id = ?
         AND exchange = ?
         AND symbol = ?
         AND status IN (${getActiveStatusPlaceholders()})
       LIMIT 1`
    )
    .get(params.orderId, params.exchange, params.symbol, ...ACTIVE_STATUSES) as PaperOrderRow | undefined;

  return row ? toOrderDto(row) : null;
}

export function updatePaperOrderStatus(
  params: {
    orderId: string;
    status: TerminalOrderStatus;
  },
  dbArg?: Database,
): TerminalOrderDto | null {
  const db = dbArg ?? getDb();
  const now = Date.now();

  db.prepare("UPDATE terminal_paper_orders SET status = ?, updated_at_ms = ? WHERE id = ?").run(params.status, now, params.orderId);

  const row = db
    .prepare(
      `SELECT id, exchange, symbol, side, type, status, price, orig_qty, executed_qty, mode, dedupe_signature, created_at, created_at_ms, updated_at_ms
       FROM terminal_paper_orders
       WHERE id = ?
       LIMIT 1`
    )
    .get(params.orderId) as PaperOrderRow | undefined;

  return row ? toOrderDto(row) : null;
}

export function fillPaperOrderIfActive(
  params: {
    orderId: string;
    executedQty: string;
    orderPrice: string;
  },
  dbArg?: Database,
): TerminalOrderDto | null {
  const db = dbArg ?? getDb();
  const now = Date.now();
  const update = db.prepare(
    `UPDATE terminal_paper_orders
     SET status = 'FILLED', executed_qty = ?, price = ?, updated_at_ms = ?
     WHERE id = ?
       AND status IN (${getActiveStatusPlaceholders()})`,
  );
  const result = update.run(
    params.executedQty,
    params.orderPrice,
    now,
    params.orderId,
    ...ACTIVE_STATUSES,
  ) as { changes?: number };
  if (result.changes === 0) return null;

  const row = db
    .prepare(
      `SELECT id, exchange, symbol, side, type, status, price, orig_qty, executed_qty, mode, dedupe_signature, created_at, created_at_ms, updated_at_ms
       FROM terminal_paper_orders
       WHERE id = ?
       LIMIT 1`,
    )
    .get(params.orderId) as PaperOrderRow | undefined;

  return row ? toOrderDto(row) : null;
}

export function cancelActiveOrdersBySymbol(
  params: {
    exchange: TerminalExchange;
    symbol: string;
  },
  dbArg?: Database,
): TerminalOrderDto[] {
  const db = dbArg ?? getDb();
  const rows = db
    .prepare(
      `SELECT id, exchange, symbol, side, type, status, price, orig_qty, executed_qty, mode, dedupe_signature, created_at, created_at_ms, updated_at_ms
       FROM terminal_paper_orders
       WHERE exchange = ?
         AND symbol = ?
         AND status IN (${getActiveStatusPlaceholders()})
       ORDER BY created_at_ms DESC`
    )
    .all(params.exchange, params.symbol, ...ACTIVE_STATUSES) as PaperOrderRow[];

  if (rows.length === 0) return [];

  const now = Date.now();
  const updateStatus = db.prepare("UPDATE terminal_paper_orders SET status = ?, updated_at_ms = ? WHERE id = ?");
  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) {
      updateStatus.run("CANCELED", now, id);
    }
  });
  tx(rows.map((row) => row.id));

  return rows.map((row) =>
    toOrderDto({
      ...row,
      status: "CANCELED",
      updated_at_ms: now,
    }),
  );
}

export function listOpenPaperOrders(params: {
  exchange: TerminalExchange;
  symbol?: string;
}): TerminalOrderDto[] {
  const db = getDb();
  const hasSymbol = Boolean(params.symbol);
  const sql = `
    SELECT id, exchange, symbol, side, type, status, price, orig_qty, executed_qty, mode, dedupe_signature, created_at, created_at_ms, updated_at_ms
    FROM terminal_paper_orders
    WHERE exchange = ?
      ${hasSymbol ? "AND symbol = ?" : ""}
      AND status IN (${getActiveStatusPlaceholders()})
    ORDER BY created_at_ms DESC
  `;
  const rows = (hasSymbol
    ? db.prepare(sql).all(params.exchange, params.symbol, ...ACTIVE_STATUSES)
    : db.prepare(sql).all(params.exchange, ...ACTIVE_STATUSES)) as PaperOrderRow[];

  return rows.map(toOrderDto);
}

export function listPaperOrderHistory(params: {
  exchange: TerminalExchange;
  symbol?: string;
  limit: number;
}): TerminalOrderDto[] {
  const db = getDb();
  const hasSymbol = Boolean(params.symbol);
  const sql = `
    SELECT id, exchange, symbol, side, type, status, price, orig_qty, executed_qty, mode, dedupe_signature, created_at, created_at_ms, updated_at_ms
    FROM terminal_paper_orders
    WHERE exchange = ?
      ${hasSymbol ? "AND symbol = ?" : ""}
    ORDER BY created_at_ms DESC
    LIMIT ?
  `;
  const rows = (hasSymbol
    ? db.prepare(sql).all(params.exchange, params.symbol, params.limit)
    : db.prepare(sql).all(params.exchange, params.limit)) as PaperOrderRow[];

  return rows.map(toOrderDto);
}
