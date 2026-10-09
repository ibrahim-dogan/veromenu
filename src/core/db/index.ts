import "server-only";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

// Reuse the connection across hot reloads in dev.
const g = globalThis as unknown as { __vmSql?: postgres.Sql; __vmDb?: DB };

export const sql: postgres.Sql =
  g.__vmSql ?? postgres(process.env.DATABASE_URL!, { max: 10, idle_timeout: 30 });
export const db: DB = g.__vmDb ?? drizzle(sql, { schema, casing: "snake_case" });

if (process.env.NODE_ENV !== "production") {
  g.__vmSql = sql;
  g.__vmDb = db;
}

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;
export { schema };
