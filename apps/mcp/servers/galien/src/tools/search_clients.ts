import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { requestGalienGet, validateGalienToolParams } from "../lib/tool-helpers";

const GALIEN_CLIENT_PAGE_SIZE = 1000;
const GALIEN_CLIENT_SCAN_LIMIT = 5000;

const clientSchema = z.object({
  id: z.number().optional(),
  cipCode: z.union([z.string(), z.number()]).nullish(),
  name: z.string().nullish(),
  address1: z.string().nullish(),
  address2: z.string().nullish(),
  zipCode: z.union([z.string(), z.number()]).nullish(),
  city: z.string().nullish(),
  phoneNumber: z.union([z.string(), z.number()]).nullish(),
}).passthrough();

const clientsResponseSchema = z.object({
  total: z.number().optional(),
  data: z.array(clientSchema).optional(),
}).passthrough();

export const schema = {
  query: z.string().min(1).describe(
    "Text to search for in client/pharmacy name, CIP code, address, zip code, city, or phone number.",
  ),
  size: z.number().int().positive().max(100).optional().describe(
    "Maximum number of matching clients/pharmacies to return. Defaults to 20.",
  ),
  offset: z.number().int().nonnegative().optional().describe(
    "Number of matching clients/pharmacies to skip. Defaults to 0.",
  ),
};

export const metadata: ToolMetadata = {
  name: "search_clients",
  description:
    "Search clients/pharmacies by text. This fetches the accessible client list and filters locally because Galien preprod currently ignores bare search params and rejects documented filters.",
  annotations: {
    title: "Search Clients",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function searchableClientText(client: z.infer<typeof clientSchema>) {
  return normalizeSearchText([
    client.name,
    client.cipCode,
    client.address1,
    client.address2,
    client.zipCode,
    client.city,
    client.phoneNumber,
  ].filter(Boolean).join(" "));
}

function matchesQuery(client: z.infer<typeof clientSchema>, query: string) {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  const haystack = searchableClientText(client);
  return tokens.every((token) => haystack.includes(token));
}

async function fetchAccessibleClients(extra?: ToolExtraArguments) {
  const clients: Array<z.infer<typeof clientSchema>> = [];
  let total: number | undefined;

  for (let offset = 0; offset < GALIEN_CLIENT_SCAN_LIMIT; offset += GALIEN_CLIENT_PAGE_SIZE) {
    const result = await requestGalienGet(
      "/api/v1/clients",
      {
        size: GALIEN_CLIENT_PAGE_SIZE,
        offset,
      },
      extra,
    );
    const response = clientsResponseSchema.parse(result.data);
    const page = response.data ?? [];

    total = response.total;
    clients.push(...page);

    if (page.length < GALIEN_CLIENT_PAGE_SIZE || clients.length >= (total ?? 0)) {
      break;
    }
  }

  return {
    clients,
    total,
    scanLimit: GALIEN_CLIENT_SCAN_LIMIT,
  };
}

export default async function searchClients(
  params: InferSchema<typeof schema>,
  extra?: ToolExtraArguments,
) {
  const validatedParams = validateGalienToolParams(schema, params);
  const size = validatedParams.size ?? 20;
  const offset = validatedParams.offset ?? 0;
  const { clients, total, scanLimit } = await fetchAccessibleClients(extra);
  const matches = clients.filter((client) => matchesQuery(client, validatedParams.query));

  return toMcpToolResult({
    query: validatedParams.query,
    size,
    offset,
    total: matches.length,
    scanned: clients.length,
    availableTotal: total,
    scanLimit,
    data: matches.slice(offset, offset + size),
  });
}
