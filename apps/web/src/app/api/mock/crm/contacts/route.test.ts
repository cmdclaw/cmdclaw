import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

const authHeaders = {
  authorization: "Bearer test-secret",
};

describe("GET /api/mock/crm/contacts", () => {
  it("returns fixture-backed contacts and supports filtering", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/mock/crm/contacts?status=lead", {
        headers: authHeaders,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.data[0]).toMatchObject({
      id: "contact_ava_stone",
      status: "lead",
    });
  });

  it("returns unauthorized when the bearer token is missing", async () => {
    const response = await GET(new Request("https://app.example.com/api/mock/crm/contacts"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthorized",
      message: "Authorization header must be Bearer test-secret.",
    });
  });
});

describe("POST /api/mock/crm/contacts", () => {
  it("returns a synthetic created contact", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/mock/crm/contacts", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "new.person@example.com",
          firstName: "New",
          lastName: "Person",
          company: "Example Co",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      email: "new.person@example.com",
      firstName: "New",
      lastName: "Person",
      company: "Example Co",
      status: "lead",
      createdAt: "2026-03-30T09:00:00.000Z",
      updatedAt: "2026-03-30T09:00:00.000Z",
    });
    expect(body.id).toMatch(/^contact_[a-f0-9]{10}$/);
  });

  it("returns validation errors for invalid payloads", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/mock/crm/contacts", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "not-an-email",
          firstName: "",
          lastName: "Person",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("validation_error");
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "email" }),
        expect.objectContaining({ path: "firstName" }),
      ]),
    );
  });
});
