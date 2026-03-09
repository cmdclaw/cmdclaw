import { Autumn } from "autumn-js";
import { env } from "@/env";

let autumnClientSingleton: Autumn | null = null;

export function getAutumnClient(): Autumn | null {
  if (!env.AUTUMN_SECRET_KEY) {
    return null;
  }

  if (!autumnClientSingleton) {
    autumnClientSingleton = new Autumn({
      secretKey: env.AUTUMN_SECRET_KEY,
      logLevel: env.NODE_ENV === "production" ? "warn" : "info",
    });
  }

  return autumnClientSingleton;
}
