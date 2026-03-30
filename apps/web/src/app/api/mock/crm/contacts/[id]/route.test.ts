import { describe, expect, it } from "vitest";
import { GET, PATCH } from "./route";

const authHeaders = {
  authorization: "Bearer test-secret",
};

const contactParams = (id: string) => Promise.resolve({ id });

describe("GET /api/mock/crm/contacts/[id]", () => {
  it("returns not found for unknown contacts", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/mock/crm/contacts/missing", {
        headers: authHeaders,
      }),
      { params: contactParams("missing") },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "not_found",
      message: 'The contact "missing" was not found.',
    });
  });
});

describe("PATCH /api/mock/crm/contacts/[id]", () => {
  it("returns a merged updated contact without persisting changes", async () => {
    const patchResponse = await PATCH(
      new Request("https://app.example.com/api/mock/crm/contacts/contact_ava_stone", {
        method: "PATCH",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company: "Updated Co",
          status: "customer",
        }),
      }),
      { params: contactParams("contact_ava_stone") },
    );
    const patchBody = await patchResponse.json();

    expect(patchResponse.status).toBe(200);
    expect(patchBody).toMatchObject({
      id: "contact_ava_stone",
      company: "Updated Co",
      status: "customer",
      updatedAt: "2026-03-30T12:00:00.000Z",
    });

    const getResponse = await GET(
      new Request("https://app.example.com/api/mock/crm/contacts/contact_ava_stone", {
        headers: authHeaders,
      }),
      { params: contactParams("contact_ava_stone") },
    );
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody).toMatchObject({
      id: "contact_ava_stone",
      company: "Acme Inc",
      status: "lead",
      updatedAt: "2026-01-15T10:00:00.000Z",
    });
  });

  it("returns validation errors for empty patches", async () => {
    const response = await PATCH(
      new Request("https://app.example.com/api/mock/crm/contacts/contact_ava_stone", {
        method: "PATCH",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      { params: contactParams("contact_ava_stone") },
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      error: "validation_error",
      issues: [{ path: "body", message: "At least one field must be provided." }],
    });
  });
});
