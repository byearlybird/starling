# Contributing to Starling

Thanks for helping improve Starling! This document captures the basics for checking out the repo, running tests, and keeping docs/code consistent.

## Prerequisites

- [Bun](https://bun.sh/) 1.0+ (used for scripts, builds, and tests)
- Node.js 18+ (for editor tooling, though Bun drives most commands)

Install dependencies from the workspace root:

```bash
bun install
```

## Repository Layout

| Path | Notes |
| --- | --- |
| `packages/core` | Core CRDT store (`Store`, `Document`, `Eventstamp`, `Record`, `Value`, `KV`, `Clock`) plus exhaustive unit tests. |
| `packages/plugins/query` | Reactive query manager (`createQueryManager`) that listens to store hooks to keep filtered `Map`s in sync. |
| `packages/plugins/unstorage` | Persistence bridge (`unstoragePlugin`) that replays snapshots on boot and debounces writes. |

Additional pointers:

- Core logic lives under `packages/core`; plugin packages live in `packages/plugins/*`.
- All packages are TypeScript modules bundled via `tsdown`.
- Tests inhabit `packages/core/src/*.test.ts`. Plugins currently rely on targeted integration tests that you can author beside the plugin code.

## Architecture Overview

### Eventstamps

Every value in Starling is encoded with eventstamps for conflict resolution. The eventstamp format is:

```
YYYY-MM-DDTHH:mm:ss.SSSZ|hexCounter
```

Example: `2025-10-26T10:00:00.000Z|00000001`

This enables:

- **Monotonic timestamps**: Later events always have higher eventstamps
- **Conflict resolution**: When two clients update the same field, the update with the higher eventstamp wins (Last-Write-Wins)
- **Distributed consistency**: Multiple clients can sync without coordination

### CRDT-like Merging

When merging states, Starling compares eventstamps at the field level:

```typescript
// Client A updates
{ name: "Alice", email: "alice@old.com" }

// Client B updates (newer eventstamp for email only)
{ email: "alice@new.com" }

// Merged result: email takes precedence due to higher eventstamp
{ name: "Alice", email: "alice@new.com" }
```

### Plugin System

Stores are extensible via plugins that provide lifecycle hooks and optional methods:

```typescript
type Plugin<T, M extends PluginMethods = {}> = {
  init: (store: Store<T>) => Promise<void> | void;
  dispose: () => Promise<void> | void;
  hooks?: StoreHooks<T>;
  methods?: M;
};

// Usage
const store = Store.create<T>()
  .use(plugin1)
  .use(plugin2);

await store.init();
```

**Key changes from the old plugin system:**
- Plugins now return objects directly instead of factory functions
- `init` receives the store as a parameter
- Optional `methods` object gets injected directly into the store (e.g., `queryPlugin` adds a `query()` method)

### Modules at a Glance

- [`clock.ts`](packages/core/src/clock.ts) – monotonic logical clock that increments a hex counter whenever the OS clock stalls and can `forward` itself when it sees newer remote stamps.
- [`eventstamp.ts`](packages/core/src/eventstamp.ts) – encoder/decoder for the sortable `YYYY-MM-DDTHH:mm:ss.sssZ|counter` strings.
- [`value.ts`](packages/core/src/value.ts) – wraps primitives with their eventstamp and merges values by comparing stamps.
- [`record.ts`](packages/core/src/record.ts) – walks nested objects, encoding/decoding each field and recursively merging sub-records.
- [`document.ts`](packages/core/src/document.ts) – attaches metadata (`~id`, `~deletedAt`) and knows how to tombstone or merge entire documents.
- [`kv.ts`](packages/core/src/kv.ts) – immutable map plus transactional staging used by the store to guarantee atomic commits.
- [`store.ts`](packages/core/src/store.ts) – user-facing API layer plus plugin orchestration and hook batching.

## Package Exports

Starling is organized as a monorepo with three packages:

- **`@byearlybird/starling`** – Core library (stores, CRDT operations, transactions)
  - Exports: `Store`, `Document`, `Eventstamp`, `Clock`, `KV`, `Record`, `Value`
  - Zero dependencies

- **`@byearlybird/starling-plugin-query`** – Query plugin for reactive filtered views
  - Exports: `queryPlugin`

- **`@byearlybird/starling-plugin-unstorage`** – Persistence plugin
  - Exports: `unstoragePlugin`
  - Peer dependency: `unstorage@^1.17.1`

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

Use `bun run build:all` at the workspace root to build every package in sequence.

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
