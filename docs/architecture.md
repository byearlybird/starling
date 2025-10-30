# Starling Architecture

This document covers the design and internals of Starling, including eventstamps, CRDT-like merging, the plugin system, and module organization.

## Repository Layout

| Path | Notes |
| --- | --- |
| `packages/core` | Core CRDT store (`Store`, `Document`, `Eventstamp`, `Record`, `Value`, `KV`, `Clock`) plus exhaustive unit tests. |
| `packages/core/src/plugins/query` | Reactive query plugin that listens to store hooks to keep filtered `Map`s in sync. |
| `packages/core/src/plugins/unstorage` | Persistence plugin that replays snapshots on boot and debounces writes. |

Additional pointers:

- Core logic lives under `packages/core`; official plugins live alongside the store in `packages/core/src/plugins/*`.
- All packages are TypeScript modules bundled via `tsdown`.
- Tests inhabit `packages/core/src/**/*.test.ts`, including plugin coverage.

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
  hooks: {
    onInit: (store: Store<T>) => Promise<void> | void;
    onDispose: () => Promise<void> | void;
    onAdd?: (entries: ReadonlyArray<readonly [string, T]>) => void;
    onUpdate?: (entries: ReadonlyArray<readonly [string, T]>) => void;
    onDelete?: (keys: ReadonlyArray<string>) => void;
  };
  methods?: M;
};

// Usage
const store = await createStore<T>()
  .use(plugin1)
  .use(plugin2)
  .init();
```

Plugins can opt into whichever hooks they need and may expose additional store methods by returning them via the optional `methods` object (for example, `queryPlugin` adds a `query()` helper).

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

- **`@byearlybird/starling`** – Core library (store lifecycle, transactions, plugin orchestration)
  - Exports: `createStore`, `Store`, `Plugin`, `PluginHooks`, `PluginMethods`, `EncodedDocument`
  - Zero dependencies

- **`@byearlybird/starling/plugin-query`** – Query plugin for reactive filtered views
  - Exports: `queryPlugin`

- **`@byearlybird/starling/plugin-unstorage`** – Persistence plugin
  - Exports: `unstoragePlugin`
  - Peer dependency: `unstorage@^1.17.1`
