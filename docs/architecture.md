# Starling Architecture

This document covers the design and internals of Starling, including eventstamps, CRDT-like merging, the plugin system, and module organization.

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

## Eventstamps

Every value in Starling is encoded with eventstamps for conflict resolution. The eventstamp format is:

```
YYYY-MM-DDTHH:mm:ss.SSSZ|hexCounter
```

Example: `2025-10-26T10:00:00.000Z|00000001`

This enables:

- **Monotonic timestamps**: Later events always have higher eventstamps
- **Conflict resolution**: When two clients update the same field, the update with the higher eventstamp wins (Last-Write-Wins)
- **Distributed consistency**: Multiple clients can sync without coordination

## CRDT-like Merging

When merging states, Starling compares eventstamps at the field level:

```typescript
// Client A updates
{ name: "Alice", email: "alice@old.com" }

// Client B updates (newer eventstamp for email only)
{ email: "alice@new.com" }

// Merged result: email takes precedence due to higher eventstamp
{ name: "Alice", email: "alice@new.com" }
```

## Plugin System

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

## Modules at a Glance

- [`clock.ts`](../packages/core/src/clock.ts) – monotonic logical clock that increments a hex counter whenever the OS clock stalls and can `forward` itself when it sees newer remote stamps.
- [`eventstamp.ts`](../packages/core/src/eventstamp.ts) – encoder/decoder for the sortable `YYYY-MM-DDTHH:mm:ss.sssZ|counter` strings.
- [`value.ts`](../packages/core/src/value.ts) – wraps primitives with their eventstamp and merges values by comparing stamps.
- [`record.ts`](../packages/core/src/record.ts) – walks nested objects, encoding/decoding each field and recursively merging sub-records.
- [`document.ts`](../packages/core/src/document.ts) – attaches metadata (`~id`, `~deletedAt`) and knows how to tombstone or merge entire documents.
- [`kv.ts`](../packages/core/src/kv.ts) – immutable map plus transactional staging used by the store to guarantee atomic commits.
- [`store.ts`](../packages/core/src/store.ts) – user-facing API layer plus plugin orchestration and hook batching.

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
