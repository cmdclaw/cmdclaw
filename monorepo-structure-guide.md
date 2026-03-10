# Practical Monorepo Structure Guide (Bun + Turbo)

This guide summarizes practical patterns for structuring a TypeScript
monorepo using **Bun workspaces** and **Turborepo**.

------------------------------------------------------------------------

# Recommended Top-Level Structure

    my-project/
      apps/
        web/
        raycast/
        worker/
        cli/
        bg/
      packages/
        shared/
        db/
        convex/
        ui/
        config/
      package.json
      bun.lock
      turbo.json
      tsconfig.json

------------------------------------------------------------------------

# What Goes in `apps/`

Put every **deployable or runnable product** here.

Examples:

-   `apps/web` --- website
-   `apps/raycast` --- Raycast extension
-   `apps/worker` --- Cloudflare worker
-   `apps/cli` --- CLI tool published to npm
-   `apps/bg` --- background worker or cron service

Rule:

If it **runs independently or deploys independently**, it should usually
be an app.

------------------------------------------------------------------------

# What Goes in `packages/`

Put **shared reusable modules** here.

Examples:

-   `packages/convex` --- shared Convex types and API definitions
-   `packages/db` --- database connection, schema, types
-   `packages/shared` --- utilities used across apps
-   `packages/ui` --- reusable UI components
-   `packages/config` --- shared configs (tsconfig, eslint, prettier)

Rule:

If **multiple apps import it**, it should be a package.

------------------------------------------------------------------------

# Root `package.json`

The root package is used mainly for **workspace configuration and global
scripts**.

Example:

``` json
{
  "name": "my-project",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo dev --ui=tui",
    "build": "turbo build",
    "check": "turbo check",
    "format": "turbo format",
    "dev:web": "turbo dev --filter=@my/web",
    "build:web": "turbo build --filter=@my/web",
    "check:cli": "turbo check --filter=@my/cli"
  }
}
```

------------------------------------------------------------------------

# Package Naming Convention

Give each workspace a real package name.

Examples:

    @my/web
    @my/db
    @my/shared
    @my/convex

Then import using package names instead of relative paths:

``` ts
import { api } from "@my/convex"
import { db } from "@my/db"
```

Avoid:

    ../../../../convex/generated/api

------------------------------------------------------------------------

# Export a Clear Public API

Each package should define its **public surface**.

Example structure:

    packages/db/
      src/
        connection.ts
        schema.ts
        types.ts
        index.ts
      package.json

`index.ts`:

``` ts
export * from "./connection"
export * from "./schema"
export * from "./types"
```

This forces you to define what other apps can depend on.

------------------------------------------------------------------------

# Good Default Monorepo Split

A simple structure that works for most projects:

    apps/
      web/
      worker/
      cli/

    packages/
      shared/
      db/
      ui/
      config/

------------------------------------------------------------------------

# How to Decide App vs Package

Make it an **app** if:

-   It has its own runtime
-   It deploys independently
-   It has its own dev server
-   It can run standalone

Make it a **package** if:

-   It is imported by other workspaces
-   It contains reusable logic
-   It should not be deployed independently

------------------------------------------------------------------------

# Turborepo Philosophy

Turbo is used for:

-   Running all dev servers together
-   Running filtered commands
-   Dependency aware builds
-   Build caching

Example command:

    turbo check --filter=@my/cli

Turbo will automatically run checks for dependencies first.

------------------------------------------------------------------------

# Example `turbo.json`

``` json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "build/**"]
    },
    "check": {
      "dependsOn": ["^check"]
    },
    "format": {}
  }
}
```

------------------------------------------------------------------------

# Typical Workspace Structure

Example workspace:

    apps/web/
      src/
      package.json
      tsconfig.json

Example `package.json`:

``` json
{
  "name": "@my/web",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "check": "tsc --noEmit",
    "format": "prettier --write ."
  },
  "dependencies": {
    "@my/db": "*",
    "@my/shared": "*"
  }
}
```

------------------------------------------------------------------------

# Full SaaS Monorepo Example

    apps/
      web/
      api/
      worker/
      extension/

    packages/
      db/
      auth/
      shared/
      sdk/
      ui/
      config/

------------------------------------------------------------------------

# Development Workflow

Typical commands:

    bun install
    bun run dev
    bun run dev:web
    bun run check:web
    bun run format:web

This keeps iteration fast and scoped.

------------------------------------------------------------------------

# Best Practices

1.  Keep all product components in one repo.
2.  Share typed packages rather than copying code.
3.  Export intentional public APIs.
4.  Prefer package imports over relative paths.
5.  Give each workspace its own scripts.
6.  Use Turbo filters heavily.
7.  Deploy apps independently.
8.  Put database logic in a dedicated package.
9.  Put shared API types in one package.
10. Use the root only for orchestration.

------------------------------------------------------------------------

# Minimal Starter Template

    my-project/
      apps/
        web/
        worker/
      packages/
        shared/
        db/
      package.json
      turbo.json

------------------------------------------------------------------------

# Recommended Default Layout

    apps/
      web
      api
      worker

    packages/
      shared
      db
      ui
      config

This structure scales well for most TypeScript products.
