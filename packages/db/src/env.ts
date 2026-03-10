import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
});

const FALLBACK_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres";

let cachedEnv: z.infer<typeof schema> | null = null;

function resolveEnv(): z.infer<typeof schema> {
  if (cachedEnv) {
    return cachedEnv;
  }

  if (process.env.SKIP_ENV_VALIDATION) {
    cachedEnv = {
      DATABASE_URL: process.env.DATABASE_URL ?? FALLBACK_DATABASE_URL,
    };
    return cachedEnv;
  }

  cachedEnv = schema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
  });
  return cachedEnv;
}

export function getDatabaseUrl(): string {
  return resolveEnv().DATABASE_URL;
}

export const env = new Proxy({} as z.infer<typeof schema>, {
  get(_target, property, receiver) {
    return Reflect.get(resolveEnv(), property, receiver);
  },
});
