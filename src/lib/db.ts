import { Pool, type PoolClient } from "pg";

// numeric -> number (beloppen är små nog för double med 2 decimaler)
import pg from "pg";
pg.types.setTypeParser(1700, Number);
pg.types.setTypeParser(1082, (v: string) => v); // date som "YYYY-MM-DD"

const globalForPg = globalThis as unknown as { pool?: Pool };
export const pool = globalForPg.pool ?? new Pool({ connectionString: process.env.DATABASE_URL });
globalForPg.pool = pool;

export const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  (await pool.query(text, params)).rows as T[];

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
