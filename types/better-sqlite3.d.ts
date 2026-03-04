declare module "better-sqlite3" {
  export interface Statement<Row = unknown> {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): Row | undefined;
    all(...params: unknown[]): Row[];
  }

  export interface Database {
    pragma(sql: string): unknown;
    prepare(sql: string): Statement;
    exec(sql: string): this;
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
  }

  interface DatabaseConstructor {
    new (path: string | Uint8Array, options?: unknown): Database;
    prototype: Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
