// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { openNewChat } from "./open-new-chat";

describe("openNewChat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resets the current chat and routes to the new chat page", () => {
    const push = vi.fn();
    const listener = vi.fn();
    window.addEventListener("new-chat", listener);

    try {
      openNewChat({ push });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith("/chat");
    } finally {
      window.removeEventListener("new-chat", listener);
    }
  });
});
