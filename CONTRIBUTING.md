# Contributing to Starling

Thanks for helping improve Starling! This document captures the basics for checking out the repo, running tests, and keeping docs/code consistent.

## Prerequisites

- [Bun](https://bun.sh/) 1.0+ (used for scripts, builds, and tests)
- Node.js 18+ (for editor tooling, though Bun drives most commands)

Install dependencies from the workspace root:

```bash
bun install
```

## Repository Structure

For a detailed overview of the repository layout, architecture, eventstamps, CRDT-like merging, and module organization, see [Architecture](docs/architecture.md).

## Running Tests

```bash
bun test

# Watch mode
bun test --watch

# Specific test file
bun test packages/core/src/store.test.ts
```

- The `core` suite exercises every CRDT primitive; run it whenever you touch merge logic, transaction behavior, or store hooks.
- When changing / creating plugins, add scenario-specific tests (e.g., using Bun's `test()` runner) in the same directory as the plugin.

## Linting and Formatting

```bash
# Check code
bun biome check .

# Format code
bun biome format --write .

# Lint code
bun biome lint .
```

## Builds

```bash
# Build core package (includes plugin entrypoints)
bun run build:core
```

Use `bun run build:all` at the workspace root to build every package in sequence.

## Version Bumps

To prepare a package for release, bump its version from inside the package directory:

```bash
cd packages/core
bun pm version patch    # Bump patch version
bun pm version minor    # Bump minor version
bun pm version major    # Bump major version
```

Publishing to npm is restricted to project maintainers.

## Documentation

- Keep README sections focused on user-facing workflows. Implementation details, changelogs, and contributor tips belong here or in package-specific docs.
- Update the plugin docs in `docs/plugins/*` when you add new options or operational details so consumers can discover them without diving into code.

## Pull Request Checklist

- [ ] Tests pass locally (`bun test`).
- [ ] Docs updated when behavior or configuration changes.
- [ ] `bun biome check .` succeeds (lint + format).
- [ ] Builds complete for affected packages.
