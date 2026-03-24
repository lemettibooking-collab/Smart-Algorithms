import { getDb } from "@/lib/db";
import type { RefreshReason } from "@/src/server/terminal/account/domain/terminal-account.types";
import type { ScopeKey } from "@/src/server/terminal/account/domain/terminal-account-scope";

type TerminalAccountVersionRow = {
  scope_key: ScopeKey;
  version: number;
  updated_at: number;
  last_reason: RefreshReason;
};

export type TerminalAccountVersion = {
  scopeKey: ScopeKey;
  version: number;
  updatedAt: number;
  lastReason: RefreshReason;
};

let ensured = false;

function toVersion(row: TerminalAccountVersionRow): TerminalAccountVersion {
  return {
    scopeKey: row.scope_key,
    version: row.version,
    updatedAt: row.updated_at,
    lastReason: row.last_reason,
  };
}

function ensureTable() {
  if (ensured) return;

  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS terminal_account_versions (
      scope_key TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_reason TEXT NOT NULL
    )
  `);

  ensured = true;
}

export const terminalAccountVersionRepo = {
  ensure(scopeKey: ScopeKey, reason: RefreshReason = "initial"): TerminalAccountVersion {
    ensureTable();

    const db = getDb();
    const now = Date.now();
    db.prepare(
      `INSERT OR IGNORE INTO terminal_account_versions(scope_key, version, updated_at, last_reason)
       VALUES(?, 1, ?, ?)`,
    ).run(scopeKey, now, reason);

    const row = db
      .prepare(
        `SELECT scope_key, version, updated_at, last_reason
         FROM terminal_account_versions
         WHERE scope_key = ?
         LIMIT 1`,
      )
      .get(scopeKey) as TerminalAccountVersionRow | undefined;

    return row ? toVersion(row) : { scopeKey, version: 1, updatedAt: now, lastReason: reason };
  },

  get(scopeKey: ScopeKey): TerminalAccountVersion | null {
    ensureTable();

    const db = getDb();
    const row = db
      .prepare(
        `SELECT scope_key, version, updated_at, last_reason
         FROM terminal_account_versions
         WHERE scope_key = ?
         LIMIT 1`,
      )
      .get(scopeKey) as TerminalAccountVersionRow | undefined;

    return row ? toVersion(row) : null;
  },

  bump(scopeKey: ScopeKey, reason: RefreshReason): TerminalAccountVersion {
    ensureTable();

    const db = getDb();
    const now = Date.now();
    db.prepare(
      `INSERT INTO terminal_account_versions(scope_key, version, updated_at, last_reason)
       VALUES(?, 1, ?, ?)
       ON CONFLICT(scope_key) DO UPDATE SET
         version = terminal_account_versions.version + 1,
         updated_at = excluded.updated_at,
         last_reason = excluded.last_reason`,
    ).run(scopeKey, now, reason);

    const row = db
      .prepare(
        `SELECT scope_key, version, updated_at, last_reason
         FROM terminal_account_versions
         WHERE scope_key = ?
         LIMIT 1`,
      )
      .get(scopeKey) as TerminalAccountVersionRow | undefined;

    return row ? toVersion(row) : { scopeKey, version: 1, updatedAt: now, lastReason: reason };
  },
};
