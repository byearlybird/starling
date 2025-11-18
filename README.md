# @byearlybird/starling

**Lightweight CRDT primitives for local-first sync in JavaScript apps.**

Starling provides the core building blocks for state-based replication with field-level Last-Write-Wins conflict resolution, powered by hybrid logical clocks. Use it directly to build custom sync solutions, or use higher-level packages for complete data store functionality.

## Highlights

- Field-level Last-Write-Wins conflict resolution
- Hybrid logical clock with eventstamps
- State-based document merging (no operation logs)
- Framework agnostic -- works with anything that JavaScript runs
- ~4KB core build with zero required runtime dependencies

## Installation

```bash
bun add @byearlybird/starling
```

## Core Package

The `@byearlybird/starling` core package provides:

- **Clock** - Hybrid logical clock for generating monotonic eventstamps
- **Document** - JsonDocument format and merging primitives
- **ResourceMap** - CRDT data structure for managing resources with field-level LWW

For a complete data store with CRUD operations, transactions, and event subscriptions, see:
- **[@byearlybird/starling-db](packages/db)** - Database utilities including store implementation, queries, and persistence (in development)

## Quick Start

```typescript
import { ResourceMap } from "@byearlybird/starling";

// Create a resource map for managing todos
const todos = new ResourceMap<{ text: string; completed: boolean }>("todos");

// Add resources
todos.set("todo-1", { text: "Learn Starling", completed: false });
todos.set("todo-2", { text: "Build an app", completed: false });

// Update with partial data (field-level merge)
todos.set("todo-1", { completed: true });

// Soft delete
todos.delete("todo-2");

// Export to document for persistence or sync
const document = todos.toDocument();

// Merge documents from other replicas
const otherDocument = /* ... load from storage or receive from network ... */;
const merged = ResourceMap.fromDocument("todos", otherDocument);
```

## How Sync Works

Starling's sync model is designed to handle the common case: multiple clients editing the same data without manual merge logic.

### Field-Level Last-Write-Wins

Conflict resolution recursively merges each field of a plain JavaScript object, applying Last-Write-Wins at the field level—newer eventstamps win. This means if Client A updates `user.name` and Client B updates `user.email`, both changes are preserved.

### Eventstamps

Eventstamps capture a single operation using a Hybrid Logical Clock. They combine ISO8601 timestamps with a hex counter and random nonce (`YYYY-MM-DDTHH:mm:ss.SSSZ|counter|nonce`). This ensures that even if two clients have identical system clocks—or one clock drifts backward—each write gets a unique, comparable timestamp. The counter increments locally when the timestamp doesn't advance, guaranteeing monotonicity. In the event that a conflict occurs, the nonce acts as a tie-breaker.

To address clock drift, the latest eventstamp is persisted and shared with each data store, so nodes may fast forward clocks to match.

### Data Type Support

Starling works with **Records** (plain JavaScript objects):

```typescript
✅ Good: { name: "Alice", settings: { theme: "dark", notifications: true } }
✅ Good: { count: 42, active: true, tags: ["work", "urgent"] }
```

**Arrays are treated atomically**: If two clients modify the same array field, Last-Write-Wins applies to the entire array—there's no element-level merging. For lists that need concurrent edits (e.g., todo items), use keyed records instead:

```typescript
❌ Avoid: { todos: [{ text: "..." }, { text: "..." }] }
✅ Better: { todos: { "id1": { text: "..." }, "id2": { text: "..." } } }
```

### When to Use Something Else

If you need support for mergeable array operations, semantic operations, or sophisticated string merging, consider using CRDT libraries like [Automerge](https://automerge.org/) or [Yjs](https://docs.yjs.dev/) with, or instead of, Starling.

## Core API

The core package provides low-level primitives for building sync solutions:

### ResourceMap

`ResourceMap` is a CRDT data structure that manages resources with field-level Last-Write-Wins semantics:

```typescript
import { ResourceMap } from "@byearlybird/starling";

const map = new ResourceMap<YourType>("collection-name");

// Add or update resources
map.set(id, value);
map.set(id, partialValue); // Merges with existing

// Get resources
const resource = map.get(id);
const hasResource = map.has(id);

// Iterate
for (const [id, resource] of map.entries()) {
  console.log(id, resource.attributes);
}

// Soft delete
map.delete(id);

// Export/import documents
const document = map.toDocument();
const restored = ResourceMap.fromDocument("collection-name", document);
```

### Document Merging

Merge documents from different replicas:

```typescript
import { mergeDocuments } from "@byearlybird/starling";

const result = mergeDocuments(localDocument, remoteDocument);

// Access merged document
console.log(result.document);

// Track changes for notifications
console.log(result.changes.added);    // Map of newly added resources
console.log(result.changes.updated);  // Map of updated resources
console.log(result.changes.deleted);  // Set of deleted resource IDs
```

### Hybrid Logical Clock

Generate monotonic eventstamps:

```typescript
import { Clock } from "@byearlybird/starling";

const clock = new Clock();

// Generate eventstamps
const stamp1 = clock.now();  // "2025-01-01T00:00:00.000Z|0001|a7f2"
const stamp2 = clock.now();  // Always greater than stamp1

// Forward clock when observing remote eventstamps
clock.forward(remoteEventstamp);
```

## Building on Top

The core package provides minimal primitives for sync. For higher-level features:

- **[@byearlybird/starling-db](packages/db)** - Store implementation with CRUD operations, transactions, queries, and persistence (in development)

Build your own solutions using the core primitives:

```typescript
import { ResourceMap, mergeDocuments } from "@byearlybird/starling";

// Example: Custom sync layer
class SyncManager<T> {
  private local: ResourceMap<T>;

  constructor(collectionName: string) {
    this.local = new ResourceMap<T>(collectionName);
  }

  async sync(remote: JsonDocument<T>): Promise<void> {
    const localDoc = this.local.toDocument();
    const result = mergeDocuments(localDoc, remote);

    // Replace local state with merged result
    this.local = ResourceMap.fromDocument(
      this.local.type,
      result.document
    );

    // Handle changes
    for (const [id, resource] of result.changes.added) {
      console.log('Added:', id, resource.attributes);
    }
    for (const [id, resource] of result.changes.updated) {
      console.log('Updated:', id, resource.attributes);
    }
    for (const id of result.changes.deleted) {
      console.log('Deleted:', id);
    }
  }
}
```

## Examples

![Demo GIF](demo.GIF)

Three demo apps show Starling in action:

- **[React Todo App](apps/demo-starling-react)** - Cross-device sync with localStorage + HTTP
- **[SolidJS Todo App](apps/demo-starling-solid)** - Same sync setup, different framework
- **[Server](apps/demo-starling-server)** - Simple Bun server that merges and persists updates

Run them locally:

```bash
# Start React demo
bun run demo:react

# Or start SolidJS demo
bun run demo:solid
```

## Project Status

- Starling core is in **alpha**. The core API is stable but may have minor changes as additional testing occurs.
- The scope and guiding philosophy are firm: provide lightweight, minimal CRDT primitives for sync with field-level Last-Write-Wins, letting higher-level packages handle store management, queries, persistence, and framework integrations.
- The core package focuses on document merging, resource management, and hybrid logical clocks. Higher-level features like CRUD operations, transactions, queries, and persistence are being moved to separate packages.
- Near-term work focuses on the `@byearlybird/starling-db` package for store implementation, queries, and persistence.

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT (see [`LICENSE`](LICENSE))

## Credits

💖 Made [@byearlybird](https://github.com/byearlybird)

Very much inspired by [Tinybase](https://tinybase.org/) and so many other excellent libraries in the local-first community, Starling aims to implement a simple sync solution for personal apps, inspired by the method described in [James Long's CRDTs for Mortals talk](https://www.dotconferences.com/2019/12/james-long-crdts-for-mortals).

Thanks for checking out Starling!
