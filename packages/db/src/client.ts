import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseUrl } from "./env";
import * as schema from "./schema";

const createDb = (pool: Pool) => drizzle(pool, { schema });

type DbClient = ReturnType<typeof createDb>;

let pool: Pool | null = null;
let dbClient: DbClient | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getDatabaseUrl() });
  }

  return pool;
}

function getDb(): DbClient {
  if (!dbClient) {
    dbClient = createDb(getPool());
  }

  return dbClient;
}

export const db = new Proxy({} as DbClient, {
  get(_target, property, receiver) {
    return Reflect.get(getDb() as object, property, receiver);
  },
});

export const closePool = async () => {
  const currentPool = pool;
  pool = null;
  dbClient = null;
  await currentPool?.end();
};
