# Starling

Local-first data sync for JavaScript apps.

Starling keeps replicas in sync using field-level Last-Write-Wins powered by hybrid logical clocks. Documents converge automatically—no manual merge logic required.

## Package Structure

Starling is distributed as a single package with subpath exports:

- `@byearlybird/starling` — Database with typed collections, transactions, and IndexedDB storage (main export)
- `@byearlybird/starling/core` — Low-level CRDT primitives for custom sync implementations
- `@byearlybird/starling/plugin-http` — HTTP sync utilities

## Highlights

- Typed collections with schema validation
- Transactions with snapshot isolation
- Field-level Last-Write-Wins conflict resolution
- State-based document merging (no operation logs)
- Framework-agnostic – works anywhere JavaScript runs

## Installation

```bash
bun add @byearlybird/starling zod
```

## Quick Start

```ts
import { z } from "zod";
import { createDatabase } from "@byearlybird/starling";

// Define your schema
const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  completed: z.boolean().default(false),
});

// Create a database with typed collections (async, opens IndexedDB)
const db = await createDatabase({
  name: "my-app",
  schema: {
    tasks: { schema: taskSchema, getId: (task) => task.id },
  },
});

// CRUD operations (all async)
await db.tasks.add({ id: "1", title: "Learn Starling", completed: false });
await db.tasks.update("1", { completed: true });
const task = await db.tasks.get("1");

// Transactions with snapshot isolation
await db.begin(async (tx) => {
  tx.tasks.add({ id: "2", title: "Build an app", completed: false });
  tx.tasks.update("1", { completed: false });
});

// Merge remote data (conflict resolution is automatic)
await db.tasks.merge(remoteDocument);
```

### Additional Features

**Queries** - Reactive queries with automatic re-computation:
```ts
const query = db.query(async (q) =>
  await q.tasks.find((task) => task.completed)
);

// Access current result
console.log(query.result);

// Subscribe to changes
const unsubscribe = query.subscribe((tasks) => {
  console.log("Completed tasks updated:", tasks);
});
```

**Mutation Events** - React to data changes:
```ts
db.on("mutation", (event) => {
  console.log(`${event.collection}: ${event.added.length} added, ${event.updated.length} updated`);
});
```

**HTTP Sync** - Optional HTTP synchronization:
```ts
import { syncHttp } from "@byearlybird/starling/plugin-http";

const db = await createDatabase({ name: "my-app", schema });

// Set up HTTP sync (returns cleanup function)
const stopSync = await syncHttp(db, {
  baseUrl: "https://api.example.com",
  onRequest: () => ({
    headers: { Authorization: `Bearer ${token}` }
  })
});

// Later, to stop syncing:
stopSync();
```

## How Sync Works

Starling's merge model is designed for the common case: multiple clients editing the same data without custom conflict-resolution logic.

### Field-Level Last-Write-Wins

When two devices edit the same record, Starling compares each field individually—the most recent write wins. If Client A updates `user.name` and Client B updates `user.email`, both changes are preserved. Only conflicting fields (same field, different values) use the timestamp to pick a winner.

### Eventstamps

Every write is tagged with an "eventstamp"—a timestamp that's guaranteed to be unique and always increasing, even if two devices write at the exact same moment. The format is `YYYY-MM-DDTHH:mm:ss.SSSZ|counter|nonce` (for example, `2025-01-15T10:30:00.000Z|0001|a7f2`).

When devices sync, they share their latest eventstamp so clocks stay roughly aligned across your app.

### Data Shape

Starling works with **plain objects**:

```ts
// Good: nested records
{ name: "Alice", settings: { theme: "dark", notifications: true } }

// Good: scalars and arrays
{ count: 42, active: true, tags: ["work", "urgent"] }
```

Arrays are treated as a single value—if two clients modify the same array, the most recent version wins entirely (no element-by-element merging). For lists that need concurrent edits (for example, todo items), use objects with IDs as keys instead:

```ts
// Avoid: array of embedded items
{ todos: [{ text: "..." }, { text: "..." }] }

// Prefer: record keyed by id
{ todos: { "id1": { text: "..." }, "id2": { text: "..." } } }
```

### When to Use Something Else

If you need collaborative text editing, mergeable arrays, or more sophisticated conflict handling, consider libraries like [Automerge](https://automerge.org/) or [Yjs](https://docs.yjs.dev/). Starling is intentionally small and focuses on object-shaped application state.

## Core Primitives (`@byearlybird/starling/core`)

For custom sync implementations, you can import low-level primitives from the `/core` subpath:

```ts
import { createMap } from "@byearlybird/starling/core";

// Mergeable map with field-level Last-Write-Wins
const todos = createMap<{ text: string; completed: boolean }>("todos");

todos.set("todo-1", { text: "Learn Starling", completed: false });
todos.set("todo-1", { completed: true }); // Partial update

// Export for persistence or sync
const doc = todos.toDocument();

// Merge remote state
const result = todos.merge(remoteDoc);
```

The core API includes:
- `createMap` / `createMapFromDocument` – mergeable map with automatic conflict resolution
- `createClock` / `createClockFromEventstamp` – clock utilities for eventstamps
- `makeDocument` / `mergeDocuments` – document creation and merging

## Project Status

Starling is in **beta**—the API is mostly stable but may have minor changes based on feedback. The core primitives (`/core`) are well-tested, while the database layer and plugins continue to evolve.

## Development

See `CONTRIBUTING.md` for local development, testing, and documentation guidelines.

## License

MIT (see `LICENSE`)

## Credits

💖 Made [@byearlybird](https://github.com/byearlybird)

Inspired by [Tinybase](https://tinybase.org/) and many other excellent libraries in the local-first community, Starling implements a simple sync solution for personal apps based on the approach described in [James Long's "CRDTs for Mortals" talk](https://www.youtube.com/watch?v=DEcwa68f-jY)—a great intro if you're new to local-first development.

Thanks for checking out Starling!