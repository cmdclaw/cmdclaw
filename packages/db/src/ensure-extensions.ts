import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "./env";

async function ensureExtensions() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
  } finally {
    await pool.end();
  }
}

ensureExtensions().catch((error) => {
  console.error("Failed to ensure required database extensions");
  console.error(error);
  process.exit(1);
});
