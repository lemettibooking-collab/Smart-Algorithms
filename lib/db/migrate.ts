const DDL = [
  `
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL
  )
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_events_symbol_ts ON events(symbol, ts DESC)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts DESC)
  `,
  `
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expire_ts INTEGER NOT NULL,
    updated_ts INTEGER NOT NULL
  )
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_cache_expire_ts ON cache(expire_ts)
  `,
  `
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_ts INTEGER NOT NULL
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS terminal_paper_orders (
    id TEXT PRIMARY KEY,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    price TEXT,
    orig_qty TEXT NOT NULL,
    executed_qty TEXT NOT NULL,
    mode TEXT NOT NULL,
    dedupe_signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  )
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_terminal_paper_orders_exchange_symbol_status_created
  ON terminal_paper_orders(exchange, symbol, status, created_at_ms DESC)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_terminal_paper_orders_exchange_symbol_created
  ON terminal_paper_orders(exchange, symbol, created_at_ms DESC)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_terminal_paper_orders_signature_created
  ON terminal_paper_orders(dedupe_signature, created_at_ms DESC)
  `,
  `
  CREATE TABLE IF NOT EXISTS terminal_paper_balances (
    exchange TEXT NOT NULL,
    asset TEXT NOT NULL,
    free TEXT NOT NULL,
    locked TEXT NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY(exchange, asset)
  )
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_terminal_paper_balances_exchange
  ON terminal_paper_balances(exchange)
  `,
  `
  CREATE TABLE IF NOT EXISTS terminal_paper_fills (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    base_asset TEXT NOT NULL,
    quote_asset TEXT NOT NULL,
    qty TEXT NOT NULL,
    price TEXT NOT NULL,
    notional TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
  )
  `,
  `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_terminal_paper_fills_order_id
  ON terminal_paper_fills(order_id)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_terminal_paper_fills_exchange_symbol_created
  ON terminal_paper_fills(exchange, symbol, created_at_ms ASC)
  `,
];

function ensureColumn(
  db: import("better-sqlite3").Database,
  tableName: string,
  columnName: string,
  alterSql: string,
) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>;
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(alterSql);
}

export function migrateIfNeeded(db: import("better-sqlite3").Database): void {
  db.exec("BEGIN");
  try {
    for (const sql of DDL) {
      db.exec(sql);
    }
    ensureColumn(db, "terminal_paper_fills", "fee_amount", "ALTER TABLE terminal_paper_fills ADD COLUMN fee_amount TEXT NOT NULL DEFAULT '0'");
    ensureColumn(db, "terminal_paper_fills", "fee_asset", "ALTER TABLE terminal_paper_fills ADD COLUMN fee_asset TEXT");
    ensureColumn(db, "terminal_paper_fills", "liquidity", "ALTER TABLE terminal_paper_fills ADD COLUMN liquidity TEXT");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
