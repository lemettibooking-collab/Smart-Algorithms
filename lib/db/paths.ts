import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "app.db");

export function ensureDataDir(): string {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  return DATA_DIR;
}

export function getDbPath(): string {
  ensureDataDir();
  return DB_FILE;
}
