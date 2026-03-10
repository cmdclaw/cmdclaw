import { config } from "dotenv";
import { afterAll, afterEach, beforeAll } from "vitest";
import { mswServer } from "./msw/server";

for (const envFile of [
  ".env.test.local",
  ".env.test",
  ".env",
  "../../apps/web/.env.test.local",
  "../../apps/web/.env.test",
  "../../apps/web/.env",
]) {
  config({ path: envFile, override: false });
}

beforeAll(() => {
  mswServer.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  mswServer.resetHandlers();
});

afterAll(() => {
  mswServer.close();
});
