# @byearlybird/starling

Lightweight CRDT primitives for local-first sync in JavaScript apps.

Starling provides the core building blocks for state-based replication with field-level Last-Write-Wins (LWW) conflict resolution, powered by hybrid logical clocks. Use it directly to build custom sync flows, or pair it with higher-level packages for database-style APIs.

## Highlights

- Field-level Last-Write-Wins conflict resolution
- Hybrid logical clock with eventstamps
- State-based document merging (no operation logs)
- Framework-agnostic – works anywhere JavaScript runs
- Zero runtime dependencies

## Installation

```bash
bun add @byearlybird/starling
```

## Core Concepts

The `@byearlybird/starling` package exposes a small set of primitives:

- `createClock` / `createClockFromEventstamp` – hybrid logical clocks for generating monotonic eventstamps
- `makeDocument` / `mergeDocuments` – JSON:API-style documents and merge logic
- `createMap` / `createMapFromDocument` – a CRDT map for resources with field-level LWW
- Types: `JsonDocument`, `ResourceObject`, `AnyObject`

If you need a higher-level database abstraction with collections, schema validation, and transactions, see:

- `@byearlybird/starling-db` – database utilities built on top of these primitives

## Quick Start

Work with a single collection of resources using `createMap`:

```ts
import { createMap } from "@byearlybird/starling";

type Todo = { text: string; completed: boolean };

// Create a resource map for managing todos
const todos = createMap<Todo>("todos");

// Add resources
todos.set("todo-1", { text: "Learn Starling", completed: false });
todos.set("todo-2", { text: "Build an app", completed: false });

// Update with partial data (field-level merge)
todos.set("todo-1", { completed: true });

// Soft delete (marks the resource as deleted)
todos.delete("todo-2");

// Export to a JsonDocument for persistence or sync
const localDoc = todos.toDocument();
```

Merge a remote snapshot into your local map:

```ts
import type { JsonDocument } from "@byearlybird/starling";

// Load from storage or receive from the network
declare const remoteDoc: JsonDocument<Todo>;

const result = todos.merge(remoteDoc);

// Inspect what changed
for (const [id, resource] of result.changes.added) {
  console.log("Added:", id, resource.attributes);
}
for (const [id, resource] of result.changes.updated) {
  console.log("Updated:", id, resource.attributes);
}
for (const id of result.changes.deleted) {
  console.log("Deleted:", id);
}
```

## How Sync Works

Starling’s merge model is designed for the common case: multiple clients editing the same data without custom conflict-resolution logic.

### Field-Level Last-Write-Wins

Conflict resolution recursively merges each field of a plain JavaScript object, applying Last-Write-Wins at the field level—newer eventstamps win. If Client A updates `user.name` and Client B updates `user.email`, both changes are preserved.

### Eventstamps

Eventstamps capture a single operation using a hybrid logical clock. They combine an ISO8601 timestamp with a hex counter and random nonce (`YYYY-MM-DDTHH:mm:ss.SSSZ|counter|nonce`). This ensures that even if two clients have identical system clocks—or one clock drifts backward—each write gets a unique, comparable timestamp.

The latest eventstamp is persisted and shared with each data store so clocks can be safely forwarded when merging remote data.

### Data Shape

Starling works with **plain objects**:

```ts
// Good: nested records
{ name: "Alice", settings: { theme: "dark", notifications: true } }

// Good: scalars and arrays
{ count: 42, active: true, tags: ["work", "urgent"] }
```

Arrays are treated atomically. If two clients modify the same array field, LWW applies to the entire array—no element-level merging. For lists that need concurrent edits (for example, todo items), prefer keyed records:

```ts
// Avoid: array of embedded items
{ todos: [{ text: "..." }, { text: "..." }] }

// Prefer: record keyed by id
{ todos: { "id1": { text: "..." }, "id2": { text: "..." } } }
```

### When to Use Something Else

If you need mergeable array operations, semantic operations, or sophisticated string merging, consider CRDT libraries like [Automerge](https://automerge.org/) or [Yjs](https://docs.yjs.dev/). Starling is intentionally small and focuses on object-shaped application state.

## Database Utilities (`@byearlybird/starling-db`)

The companion package `@byearlybird/starling-db` builds on the core primitives to provide:

- Typed collections based on schemas
- CRUD operations and transactions
- Batched mutation events at collection and database level

Its API centers on `createDatabase`, `CollectionHandle`, and `TransactionContext`. See `packages/db/README.md` for details. Query helpers and persistence adapters are planned but not yet implemented in this repository.

## Demos

This repo includes demo apps under `apps/` that show how Starling can be used in React and with a simple Bun-based server:

- `apps/demo-starling-react` – React app using `@byearlybird/starling-db` with IndexedDB and HTTP sync
- `apps/demo-starling-server` – Bun server for syncing data across clients

## Project Status

- The core CRDT API is small and intended to be stable, but may change in minor ways as more usage feedback comes in.
- Higher-level database features live in `@byearlybird/starling-db` and are under active development.

## Development

See `CONTRIBUTING.md` for local development, testing, and documentation guidelines.

## License

MIT (see `LICENSE`)

## Credits

💖 Made [@byearlybird](https://github.com/byearlybird)

Very much inspired by [Tinybase](https://tinybase.org/) and so many other excellent libraries in the local-first community, Starling aims to implement a simple sync solution for personal apps, inspired by the method described in [James Long's CRDTs for Mortals talk](https://www.youtube.com/watch?v=DEcwa68f-jY).

Thanks for checking out Starling!