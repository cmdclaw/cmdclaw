// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callFollowUpTemplate, templateCatalogFixture } from "@/test/template-catalog-fixtures";

void jestDomVitest;

const {
  exportCatalogMutateAsyncMock,
  importCatalogMutateAsyncMock,
  deleteTemplateMutateAsyncMock,
  setFeaturedMutateAsyncMock,
} = vi.hoisted(() => ({
  exportCatalogMutateAsyncMock: vi.fn(),
  importCatalogMutateAsyncMock: vi.fn(),
  deleteTemplateMutateAsyncMock: vi.fn(),
  setFeaturedMutateAsyncMock: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <span data-alt={alt} />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    type = "button",
    onClick,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type={type} onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
    "aria-label": ariaLabel,
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) => {
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        onCheckedChange(event.target.checked);
      },
      [onCheckedChange],
    );

    return (
      <input
        type="checkbox"
        role="switch"
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
      />
    );
  },
}));

vi.mock("@/orpc/hooks", () => ({
  useAdminTemplateCatalogList: () => ({
    data: [callFollowUpTemplate],
    isLoading: false,
    error: null,
  }),
  useAdminExportTemplateCatalog: () => ({
    mutateAsync: exportCatalogMutateAsyncMock,
    isPending: false,
  }),
  useAdminImportTemplateCatalog: () => ({
    mutateAsync: importCatalogMutateAsyncMock,
    isPending: false,
  }),
  useAdminDeleteTemplateCatalogEntry: () => ({
    mutateAsync: deleteTemplateMutateAsyncMock,
    isPending: false,
  }),
  useAdminSetTemplateCatalogFeatured: () => ({
    mutateAsync: setFeaturedMutateAsyncMock,
    isPending: false,
  }),
}));

import AdminTemplatesPage from "./page";

describe("AdminTemplatesPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    exportCatalogMutateAsyncMock.mockResolvedValue(templateCatalogFixture);
    importCatalogMutateAsyncMock.mockResolvedValue({
      importedCount: 1,
      createdCount: 0,
      updatedCount: 1,
    });
    deleteTemplateMutateAsyncMock.mockResolvedValue({ id: callFollowUpTemplate.id });
    setFeaturedMutateAsyncMock.mockResolvedValue({
      id: callFollowUpTemplate.id,
      featured: false,
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:templates");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  it("exports the catalog as json", async () => {
    const clickMock = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const appendSpy = vi.spyOn(document.body, "append").mockImplementation(() => undefined);
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
    ) => {
      if (tagName === "a") {
        return {
          href: "",
          download: "",
          click: clickMock,
          remove: vi.fn(),
        } as unknown as HTMLAnchorElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);

    render(<AdminTemplatesPage />);

    fireEvent.click(screen.getByRole("button", { name: /export json/i }));

    await waitFor(() => {
      expect(exportCatalogMutateAsyncMock).toHaveBeenCalledTimes(1);
      expect(clickMock).toHaveBeenCalledTimes(1);
    });

    createElementSpy.mockRestore();
    appendSpy.mockRestore();
  });

  it("imports a json catalog file", async () => {
    render(<AdminTemplatesPage />);

    const file = new File([JSON.stringify(templateCatalogFixture)], "templates.json", {
      type: "application/json",
    });

    fireEvent.change(screen.getByLabelText(/import template catalog json file/i), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(importCatalogMutateAsyncMock).toHaveBeenCalledWith({
        definitionJson: JSON.stringify(templateCatalogFixture),
      });
    });
  });

  it("deletes a template from the list", async () => {
    render(<AdminTemplatesPage />);

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      expect(deleteTemplateMutateAsyncMock).toHaveBeenCalledWith({
        id: callFollowUpTemplate.id,
      });
    });
  });

  it("toggles featured state", async () => {
    render(<AdminTemplatesPage />);

    fireEvent.click(screen.getByRole("switch", { name: /toggle featured for send polished/i }));

    await waitFor(() => {
      expect(setFeaturedMutateAsyncMock).toHaveBeenCalledWith({
        id: callFollowUpTemplate.id,
        featured: false,
      });
    });
  });
});
