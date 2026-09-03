/**
 * @fileoverview Drizzle client bound to the D1 `DB` binding.
 */

import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

import * as schema from "./schema";

export type Db = DrizzleD1Database<typeof schema>;

/**
 * Build a Drizzle client over the Worker's D1 binding.
 *
 * Cheap to call per request — it wraps the binding, it does not open a
 * connection.
 *
 * @param env - Worker env carrying the `DB` D1 binding
 */
export function getDb(env: { DB: D1Database }): Db {
  return drizzle(env.DB, { schema });
}

export { schema };
