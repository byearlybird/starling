# Contributing to Starling

Thanks for helping improve Starling! This document captures the basics for checking out the repo, running tests, and keeping docs/code consistent.

## Prerequisites

- [Bun](https://bun.sh/) 1.0+ (used for scripts, builds, and tests)
- Node.js 18+ (for editor tooling, though Bun drives most commands)

Install dependencies from the workspace root:

```bash
bun install
```

## Repository Notes

- Core logic lives under `packages/core`; plugin packages live in `packages/plugins/*`.
- All packages are TypeScript modules bundled via `tsdown`.
- Tests inhabit `packages/core/src/*.test.ts`. Plugins currently rely on targeted integration tests that you can author beside the plugin code.

## Running Tests

```bash
bun test

# Watch mode
bun test --watch

# Specific test file
bun test packages/core/src/store.test.ts
```

- The `core` suite exercises every CRDT primitive; run it whenever you touch merge logic, transaction behavior, or store hooks.
- When changing plugins, add scenario-specific tests (e.g., using Bun's `test()` runner) near the plugin code or in a `tests/` directory.

## Linting and Formatting

```bash
# Check code
bun biome check .

# Format code
bun biome format --write .

# Lint code
bun biome lint .
```

Formatting is automated, but please skim the diffs for unintended rewrites—especially in generated `.d.ts` files.

## Builds

```bash
# Build core package
bun run build:core

# Build plugin packages
cd packages/plugins/query && bun run build.ts
cd packages/plugins/unstorage && bun run build.ts
```

Use `bun run build` at the workspace root to build every package in sequence.

## Publishing to npm

Each package exposes `build`/`prepublishOnly` scripts plus `publishConfig.access = "public"` so `bun publish` rebuilds automatically. From the repo root you can run:

- `bun run publish:core`
- `bun run publish:plugins:query`
- `bun run publish:plugins:unstorage`

Those commands publish individual packages after you bump their versions (e.g., `bun pm version patch` or `bun pm version minor` inside the package you are releasing). To ship everything together, run `bun run release`—it builds the workspace and then publishes each package in dependency order. Make sure you are authenticated via `bun login` and have your npm OTP ready before running these scripts.

## Documentation

- Keep README sections focused on user-facing workflows. Implementation details, changelogs, and contributor tips belong here or in package-specific docs.
- Update the plugin READMEs when you add new options or operational details so consumers can discover them without diving into code.

## Pull Request Checklist

- [ ] Tests pass locally (`bun test`).
- [ ] Docs updated when behavior or configuration changes.
- [ ] `bun biome check .` succeeds (lint + format).
- [ ] Builds complete for affected packages.
