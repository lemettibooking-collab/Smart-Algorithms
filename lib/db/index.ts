import { createRequire } from "node:module";
import { getDbPath } from "@/lib/db/paths";
import { migrateIfNeeded } from "@/lib/db/migrate";

type BetterSqliteDb = import("better-sqlite3").Database;
type BetterSqliteCtor = new (path: string | Uint8Array, options?: unknown) => BetterSqliteDb;
const requireFn = createRequire(import.meta.url);

let dbSingleton: BetterSqliteDb | null = null;

export function getDb(): BetterSqliteDb {
  if (dbSingleton) return dbSingleton;

  const mod = requireFn("better-sqlite3") as unknown;
  const Ctor =
    typeof mod === "function"
      ? (mod as BetterSqliteCtor)
      : ((mod as { default?: BetterSqliteCtor }).default as BetterSqliteCtor | undefined);
  if (!Ctor) {
    throw new Error("better-sqlite3 module is not available");
  }

  const db = new Ctor(getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");

  migrateIfNeeded(db);
  dbSingleton = db;
  return db;
}
