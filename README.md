# Starling

Local-first data sync for JavaScript apps.

Starling keeps replicas in sync using field-level Last-Write-Wins powered by hybrid logical clocks. Documents converge automatically—no manual merge logic required.

## Packages

| Package | Description |
| --- | --- |
| `@byearlybird/starling-db` | Database with typed collections, schemas, and transactions |
| `@byearlybird/starling` | Low-level CRDT primitives for custom sync implementations |

## Highlights

- Typed collections with schema validation
- Transactions with snapshot isolation
- Field-level Last-Write-Wins conflict resolution
- State-based document merging (no operation logs)
- Framework-agnostic – works anywhere JavaScript runs

## Installation

```bash
bun add @byearlybird/starling-db zod
```

## Quick Start

```ts
import { z } from "zod";
import { createDatabase } from "@byearlybird/starling-db";

// Define your schema
const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  completed: z.boolean().default(false),
});

// Create a database with typed collections
const db = createDatabase({
  name: "my-app",
  schema: {
    tasks: { schema: taskSchema, getId: (task) => task.id },
  },
});

// CRUD operations
db.tasks.add({ id: "1", title: "Learn Starling", completed: false });
db.tasks.update("1", { completed: true });
const task = db.tasks.get("1");

// Transactions with snapshot isolation
db.begin((tx) => {
  tx.tasks.add({ id: "2", title: "Build an app", completed: false });
  tx.tasks.update("1", { completed: false });
});

// Merge remote data (conflict resolution is automatic)
db.tasks.merge(remoteDocument);
```

See `packages/db/README.md` for the full API including queries, mutation events, and plugins.

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

## Core Primitives (`@byearlybird/starling`)

For custom sync implementations, the core package exposes low-level primitives:

```bash
bun add @byearlybird/starling
```

```ts
import { createMap } from "@byearlybird/starling";

// CRDT map with field-level LWW
const todos = createMap<{ text: string; completed: boolean }>("todos");

todos.set("todo-1", { text: "Learn Starling", completed: false });
todos.set("todo-1", { completed: true }); // Partial update

// Export for persistence or sync
const doc = todos.toDocument();

// Merge remote state
const result = todos.merge(remoteDoc);
```

The core API includes:
- `createMap` / `createMapFromDocument` – CRDT map with field-level LWW
- `createClock` / `createClockFromEventstamp` – hybrid logical clocks
- `makeDocument` / `mergeDocuments` – document creation and merging

## Project Status

- `@byearlybird/starling` (core) is stable but may have minor API changes as usage feedback comes in.
- `@byearlybird/starling-db` is under active development.

## Development

See `CONTRIBUTING.md` for local development, testing, and documentation guidelines.

## License

MIT (see `LICENSE`)

## Credits

💖 Made [@byearlybird](https://github.com/byearlybird)

Very much inspired by [Tinybase](https://tinybase.org/) and so many other excellent libraries in the local-first community, Starling aims to implement a simple sync solution for personal apps, inspired by the method described in [James Long's CRDTs for Mortals talk](https://www.youtube.com/watch?v=DEcwa68f-jY).

Thanks for checking out Starling!