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
];

export function migrateIfNeeded(db: import("better-sqlite3").Database): void {
  db.exec("BEGIN");
  try {
    for (const sql of DDL) {
      db.exec(sql);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
