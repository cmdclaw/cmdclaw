import { fileURLToPath } from "node:url";
import { defineConfig, defineProject, mergeConfig } from "vitest/config";

import webConfig from "./apps/web/vitest.config";
import coreConfig from "./packages/core/vitest.config";

function workspacePath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

export default defineConfig({
  test: {
    open: false,
    api: {
      host: "127.0.0.1",
      port: 51204,
      strictPort: true,
    },
    projects: [
      mergeConfig(
        webConfig,
        defineProject({
          root: workspacePath("./apps/web"),
          test: {
            name: "web",
          },
        }),
      ),
      mergeConfig(
        coreConfig,
        defineProject({
          root: workspacePath("./packages/core"),
          test: {
            name: "core",
          },
        }),
      ),
      defineProject({
        root: workspacePath("./apps/cli"),
        test: {
          name: "cli",
        },
      }),
      defineProject({
        root: workspacePath("./apps/mcp"),
        test: {
          name: "mcp",
        },
      }),
      defineProject({
        root: workspacePath("./packages/client"),
        test: {
          name: "client",
        },
      }),
    ],
  },
});
