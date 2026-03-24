import { getDb } from "@/lib/db";
import type { TerminalBalanceDto, TerminalExchange } from "@/src/shared/model/terminal/contracts";
import type { Database } from "better-sqlite3";

type PaperBalanceRow = {
  exchange: string;
  asset: string;
  free: string;
  locked: string;
  updated_at_ms: number;
};

type BalanceDelta = {
  asset: string;
  freeDelta?: number;
  lockedDelta?: number;
};

const PAPER_BALANCE_SEEDS: Record<TerminalExchange, Array<{ asset: string; free: string; locked: string }>> = {
  binance: [
    { asset: "USDT", free: "10000", locked: "0" },
    { asset: "BTC", free: "0.15", locked: "0" },
    { asset: "ETH", free: "2.5", locked: "0" },
    { asset: "SOL", free: "250", locked: "0" },
  ],
  mexc: [
    { asset: "USDT", free: "10000", locked: "0" },
    { asset: "BTC", free: "0.15", locked: "0" },
    { asset: "ETH", free: "2.5", locked: "0" },
    { asset: "SOL", free: "250", locked: "0" },
  ],
};

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number) {
  const normalized = Number(value.toFixed(12));
  if (!Number.isFinite(normalized) || normalized <= 0) return "0";
  return normalized.toFixed(12).replace(/\.?0+$/, "");
}

function toBalanceDto(row: PaperBalanceRow): TerminalBalanceDto {
  const free = toNumber(row.free);
  const locked = toNumber(row.locked);
  const total = free + locked;

  return {
    asset: row.asset,
    free: formatAmount(free),
    locked: formatAmount(locked),
    usdValue: row.asset === "USDT" ? Number(total.toFixed(2)) : null,
  };
}

export function ensurePaperAccountSeeded(exchange: TerminalExchange, dbArg?: Database) {
  const db = dbArg ?? getDb();
  const now = Date.now();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO terminal_paper_balances(exchange, asset, free, locked, updated_at_ms)
     VALUES(@exchange, @asset, @free, @locked, @updated_at_ms)`,
  );

  const seed = () => {
    for (const seed of PAPER_BALANCE_SEEDS[exchange]) {
      insert.run({
        exchange,
        asset: seed.asset,
        free: seed.free,
        locked: seed.locked,
        updated_at_ms: now,
      });
    }
  };

  if (dbArg) {
    seed();
    return;
  }

  db.transaction(seed)();
}

export function listPaperBalances(exchange: TerminalExchange, dbArg?: Database): TerminalBalanceDto[] {
  ensurePaperAccountSeeded(exchange, dbArg);
  const db = dbArg ?? getDb();
  const rows = db
    .prepare(
      `SELECT exchange, asset, free, locked, updated_at_ms
       FROM terminal_paper_balances
       WHERE exchange = ?
       ORDER BY
         CASE asset
           WHEN 'USDT' THEN 0
           WHEN 'BTC' THEN 1
           WHEN 'ETH' THEN 2
           WHEN 'SOL' THEN 3
           ELSE 9
         END,
         asset ASC`,
    )
    .all(exchange) as PaperBalanceRow[];

  return rows.map(toBalanceDto);
}

export function getPaperBalanceSnapshot(exchange: TerminalExchange, dbArg?: Database) {
  ensurePaperAccountSeeded(exchange, dbArg);
  const db = dbArg ?? getDb();
  const rows = db
    .prepare(
      `SELECT exchange, asset, free, locked, updated_at_ms
       FROM terminal_paper_balances
       WHERE exchange = ?`,
    )
    .all(exchange) as PaperBalanceRow[];

  const snapshot = new Map<string, { free: number; locked: number }>();
  for (const row of rows) {
    snapshot.set(row.asset, {
      free: toNumber(row.free),
      locked: toNumber(row.locked),
    });
  }

  return snapshot;
}

export function applyPaperBalanceDeltas(params: {
  exchange: TerminalExchange;
  deltas: BalanceDelta[];
}, dbArg?: Database) {
  ensurePaperAccountSeeded(params.exchange, dbArg);
  const db = dbArg ?? getDb();
  const now = Date.now();
  const select = db.prepare(
    `SELECT exchange, asset, free, locked, updated_at_ms
     FROM terminal_paper_balances
     WHERE exchange = ? AND asset = ?
     LIMIT 1`,
  );
  const insert = db.prepare(
    `INSERT OR IGNORE INTO terminal_paper_balances(exchange, asset, free, locked, updated_at_ms)
     VALUES(?, ?, '0', '0', ?)`,
  );
  const update = db.prepare(
    `UPDATE terminal_paper_balances
     SET free = ?, locked = ?, updated_at_ms = ?
     WHERE exchange = ? AND asset = ?`,
  );

  const apply = () => {
    for (const delta of params.deltas) {
      const asset = String(delta.asset ?? "").trim().toUpperCase();
      if (!asset) continue;

      insert.run(params.exchange, asset, now);
      const row = select.get(params.exchange, asset) as PaperBalanceRow | undefined;
      const nextFree = Math.max(0, toNumber(row?.free) + (delta.freeDelta ?? 0));
      const nextLocked = Math.max(0, toNumber(row?.locked) + (delta.lockedDelta ?? 0));

      update.run(formatAmount(nextFree), formatAmount(nextLocked), now, params.exchange, asset);
    }
  };

  if (dbArg) {
    apply();
    return;
  }

  db.transaction(apply)();
}
