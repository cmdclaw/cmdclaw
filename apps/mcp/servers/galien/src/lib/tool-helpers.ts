import { z } from "zod";
import { requestGalien, splitGalienRequestParts, type GalienQueryValue } from "./galien-client";

export const galienScalarSchema = z.union([z.string(), z.number(), z.boolean()]);
export const galienQueryValueSchema = z.union([galienScalarSchema, z.array(galienScalarSchema)]);

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
