import { z } from "zod";
import {
  requestGalien,
  requestGalienForCurrentUser,
  splitGalienRequestParts,
  type GalienQueryValue,
} from "./galien-client";

export const galienScalarSchema = z.union([z.string(), z.number(), z.boolean()]);
export const galienQueryValueSchema = z.union([galienScalarSchema, z.array(galienScalarSchema)]);
export const galienIsoDateTimeSchema = z
  .string()
  .describe(
    "ISO 8601 UTC datetime with milliseconds, for example 2026-04-28T00:00:00.000Z. Date-only values like 2026-04-28 are rejected by Galien.",
  );

export async function requestGalienGet(
  path: string,
  params: Record<string, GalienQueryValue | undefined>,
) {
  const requestParts = splitGalienRequestParts(path, params);
  return requestGalien({
    method: "GET",
    path,
    ...requestParts,
  });
}

export async function requestCurrentGalienUserGet(
  path: string,
  params: Record<string, GalienQueryValue | undefined>,
) {
  const requestParts = splitGalienRequestParts(path, params);

  return requestGalienForCurrentUser({
    method: "GET",
    path,
    ...requestParts,
  });
}
