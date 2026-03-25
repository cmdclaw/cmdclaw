import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "./env";

const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool);

async function backfillConversationUsage() {
  console.log("⏳ Backfilling conversation usage counters...");
  const startedAt = Date.now();

  const result = await db.execute(sql`
    WITH usage_totals AS (
      SELECT
        message.conversation_id AS conversation_id,
        COALESCE(SUM(COALESCE(message.input_tokens, 0)), 0)::integer AS usage_input_tokens,
        COALESCE(SUM(COALESCE(message.output_tokens, 0)), 0)::integer AS usage_output_tokens,
        COALESCE(
          SUM(COALESCE(message.input_tokens, 0) + COALESCE(message.output_tokens, 0)),
          0
        )::integer AS usage_total_tokens,
        COUNT(*)::integer AS usage_assistant_message_count
      FROM message
      WHERE message.role = 'assistant'
      GROUP BY message.conversation_id
    ),
    computed_usage AS (
      SELECT
        conversation.id AS conversation_id,
        COALESCE(usage_totals.usage_input_tokens, 0)::integer AS usage_input_tokens,
        COALESCE(usage_totals.usage_output_tokens, 0)::integer AS usage_output_tokens,
        COALESCE(usage_totals.usage_total_tokens, 0)::integer AS usage_total_tokens,
        COALESCE(usage_totals.usage_assistant_message_count, 0)::integer AS usage_assistant_message_count
      FROM conversation
      LEFT JOIN usage_totals ON usage_totals.conversation_id = conversation.id
    )
    UPDATE conversation
    SET
      usage_input_tokens = computed_usage.usage_input_tokens,
      usage_output_tokens = computed_usage.usage_output_tokens,
      usage_total_tokens = computed_usage.usage_total_tokens,
      usage_assistant_message_count = computed_usage.usage_assistant_message_count
    FROM computed_usage
    WHERE conversation.id = computed_usage.conversation_id
  `);

  const finishedAt = Date.now();
  console.log(
    `✅ Conversation usage backfill completed in ${finishedAt - startedAt}ms (${result.rowCount ?? 0} rows updated)`,
  );
}

backfillConversationUsage()
  .catch((error) => {
    console.error("❌ Failed to backfill conversation usage counters");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
