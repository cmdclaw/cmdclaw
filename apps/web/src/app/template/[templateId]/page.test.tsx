import { beforeEach, describe, expect, it, vi } from "vitest";
import { callFollowUpTemplate } from "@/test/template-catalog-fixtures";

const { getTemplateCatalogEntryByIdMock, notFoundMock } = vi.hoisted(() => ({
  getTemplateCatalogEntryByIdMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/services/template-catalog", () => ({
  getTemplateCatalogEntryById: getTemplateCatalogEntryByIdMock,
}));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    notFound: notFoundMock,
  };
});

import TemplatePage, { generateMetadata } from "./page";

describe("TemplatePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds metadata from the DB-backed template", async () => {
    getTemplateCatalogEntryByIdMock.mockResolvedValue(callFollowUpTemplate);

    await expect(
      generateMetadata({ params: Promise.resolve({ templateId: callFollowUpTemplate.id }) }),
    ).resolves.toEqual({
      title: "Send polished follow-ups right after every call | CmdClaw",
      description: callFollowUpTemplate.description,
    });
  });

  it("uses notFound when the template does not exist", async () => {
    getTemplateCatalogEntryByIdMock.mockResolvedValue(null);

    await expect(
      TemplatePage({ params: Promise.resolve({ templateId: "missing-template" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });
});
