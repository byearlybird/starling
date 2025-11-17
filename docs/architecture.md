# Starling Architecture

Status: Draft

This document covers the design and internals of Starling, including the state-based Last-Write-Wins merge strategy, eventstamps, the event system, and module organization.

## Repository Layout

| Path | Description |
| --- | --- |
| `packages/core` | Core store implementation (`Store`, `JsonDocument`, `Eventstamp`, `Record`, `Value`, `Clock`) with event-based reactivity |
| `packages/db` | Database utilities including plugins, queries, and persistence (in development) |
| `packages/react` | React hooks for Starling stores (`createStoreHooks`) |
| `packages/solid` | SolidJS hooks for Starling stores (`createStoreHooks`) |

**Key points:**

- Follows a Functional Core, Imperative Shell design—core packages stay pure/predictable while adapters handle IO, frameworks, and persistence
- Core logic lives under `packages/core` and provides a minimal, event-based store
- Higher-level features (queries, persistence, plugins) are being moved to `packages/db`
- Framework integrations live in separate packages (`packages/react`, `packages/solid`)
- All packages are TypeScript modules bundled via `tsdown`
- Tests live alongside implementation: `packages/core/src/**/*.test.ts`

## Eventstamps

Eventstamps power Starling's conflict resolution. Each value is stamped with:

```
YYYY-MM-DDTHH:mm:ss.SSSZ|hexCounter|hexNonce
```

Example: `2025-10-26T10:00:00.000Z|0001|a7f2`

### How They Work

**Monotonic ordering**: The hex counter increments whenever the OS clock stalls (same millisecond) or goes backward. The nonce is a random 4-character hex value that serves as a final tie-breaker, ensuring every write gets a unique, sortable stamp even when timestamp and counter are identical.

**Clock forwarding**: When a client receives a remote eventstamp newer than its local clock, it fast-forwards to that time. This keeps clocks loosely synchronized across devices without requiring a time server.

**Last-Write-Wins**: During merge, the field with the higher eventstamp wins. If Client A writes `name: "Alice"` at `T1` and Client B writes `name: "Bob"` at `T2`, Bob's value persists because `T2 > T1`.

### Design Characteristics

This approach provides predictable, deterministic merging:

**Automatic conflict resolution**: No merge callbacks or conflict detection needed—the newest write always wins. This makes reasoning about state simple and keeps the mental model lightweight.

**Self-synchronizing clocks**: When devices observe newer remote eventstamps, they fast-forward their local clocks. This loosely synchronizes devices without requiring a time server or coordination protocol.

**Graceful clock handling**: The hex counter ensures monotonicity even when system clocks stall, drift backward, or multiple writes happen in the same millisecond.

**Boundaries to consider:**

For apps where devices sync regularly (personal tools, small teams), wall-clock-based ordering works well. However:

- **Clock skew influences merge outcomes**: A device with a clock running ahead will have its writes prevail over logically newer writes from devices with accurate clocks. In practice, modern devices maintain reasonable clock accuracy via NTP.

- **No explicit causality**: Starling tracks time-based ordering but doesn't capture "happened-before" relationships. Concurrent edits rely on timestamp comparison rather than causal dependencies.

- **Requires eventstamp persistence**: Devices must save the highest eventstamp they've seen to prevent clock regression after restarts. External persistence solutions should handle this automatically.

## State-Based Merging

Starling uses **state-based replication**: it syncs full document snapshots, not operation logs. When merging states, Starling compares eventstamps at the field level:

```typescript
// Client A's state
{
  name: ["Alice", "2025-10-26T10:00:00.000Z|0001|a7f2"],
  email: ["alice@old.com", "2025-10-26T10:00:00.000Z|0001|a7f2"]
}

// Client B's state (newer eventstamp for email only)
{
  email: ["alice@new.com", "2025-10-26T10:05:00.000Z|0001|b3d4"]
}

// Merged result: email wins due to higher eventstamp, name preserved from Client A
{
  name: ["Alice", "2025-10-26T10:00:00.000Z|0001|a7f2"],
  email: ["alice@new.com", "2025-10-26T10:05:00.000Z|0001|b3d4"]
}
```

**Why state-based?**

State-based replication keeps the implementation focused and efficient:

- **Simple to reason about**: Syncing is just "send current state, merge on arrival"—no operation logs to manage
- **Small codebase**: Eliminates transformation functions, causality tracking, and replay logic
- **Merge idempotency**: Applying the same state multiple times produces the same result—natural retry safety
- **Works everywhere**: Any transport that can move JSON works—HTTP, WebSocket, filesystem, USB stick

**Current implementation**: Starling ships entire snapshots over the wire. Near-term work focuses on delta compression to send only changed fields while maintaining the state-based model.

### Merge Behavior

**Objects**: Merge recursively at the field level. Each nested field carries its own eventstamp, enabling fine-grained conflict resolution:

```typescript
// Both clients edit different fields simultaneously
Client A: { name: "Alice Smith" }  // Updates name
Client B: { email: "alice@new.com" }  // Updates email

// Both changes preserved
Merged: { name: "Alice Smith", email: "alice@new.com" }
```

**Arrays**: Treated as atomic values—the entire array is replaced rather than merged element-by-element. This provides predictable behavior and avoids ambiguous merge scenarios. For collections that need concurrent edits, use keyed records:

```typescript
// Array (atomic replacement)
{ tags: ["work", "urgent"] }  // Entire array wins/loses as a unit

// Keyed record (field-level merging)
{ todos: { "id1": { text: "..." }, "id2": { text: "..." } } }  // Each todo merges independently
```

**Deletions**: Soft-deleted via `deletedAt` eventstamp in the resource metadata. Deleted resources remain in the snapshot, enabling restoration by writing newer eventstamps to their fields. This also ensures deletion events propagate correctly during sync.

### Document Format

The `JsonDocument` type represents the complete persistent state of a store, containing API version information, metadata, and an array of resource objects:

```typescript
export type JsonDocument = {
  jsonapi: {
    version: "1.1";
  };
  meta: {
    latest: string;
  };
  data: ResourceObject[];
};
```

**Design notes:**

- **`jsonapi`**: Version information for the document structure
- **`meta.latest`**: The highest eventstamp observed by the document. When merging documents, the clock forwards to the newest eventstamp to prevent collisions across sync boundaries
- **`data`**: Array of resource objects, including soft-deleted items (those with `meta.deletedAt` set). This ensures deletion events propagate during sync

Example document:

```typescript
{
  jsonapi: { version: "1.1" },
  meta: {
    latest: "2025-10-26T10:00:00.000Z|0001|a7f2"
  },
  data: [
    {
      type: "users",
      id: "user-1",
      attributes: {
        name: "Alice",
        email: "alice@example.com"
      },
      meta: {
        eventstamps: {
          name: "2025-10-26T10:00:00.000Z|0001|a7f2",
          email: "2025-10-26T10:00:00.000Z|0001|a7f2"
        },
        latest: "2025-10-26T10:00:00.000Z|0001|a7f2",
        deletedAt: null
      }
    }
  ]
}
```

### Resource Object Format

Each resource in the `data` array follows this structure:

```typescript
export type ResourceObject = {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  meta: {
    eventstamps: Record<string, unknown>;
    latest: string;
    deletedAt: string | null;
  };
};
```

**Design notes:**

- **`type`**: Resource type identifier (e.g., "users", "todos", "posts")
- **`id`**: Unique identifier for this resource
- **`attributes`**: The resource's data as a nested object structure (plain values, not wrapped)
- **`meta.eventstamps`**: Mirrored structure containing eventstamps for each attribute field
- **`meta.latest`**: The greatest eventstamp in this resource (including deletedAt if applicable)
- **`meta.deletedAt`**: Eventstamp when this resource was soft-deleted, or null if not deleted

### Merging Documents

The `mergeDocuments(into, from)` function handles document-level merging with automatic change detection:

1. **Field-level LWW**: Each resource pair merges using `mergeResources`, preserving the newest eventstamp for each field
2. **Clock forwarding**: The resulting document's latest value is the maximum of both input eventstamps
3. **Change tracking**: Returns categorized changes (added, updated, deleted) for event notifications

This design separates merge logic from store orchestration, enabling independent testing and reuse of document operations.

## Design Scope

Starling focuses on the 80/20 of sync for personal and small-team apps:

**What Starling provides:**

- **Automatic convergence**: Field-level Last-Write-Wins ensures all replicas eventually agree
- **Simple mental model**: "Newest write wins" is easy to explain and reason about
- **Embeddable**: Tiny footprint (~4KB core) with zero required dependencies
- **Framework-agnostic**: Works with React, SolidJS, Vue, Svelte, or vanilla JavaScript

**Specialized use cases:**

For real-time collaboration, strict causal ordering, or complex operational transforms, consider specialized libraries:

- **Collaborative text editing**: [Yjs](https://docs.yjs.dev/) or [Diamond Types](https://github.com/josephg/diamond-types) provide mergeable text CRDTs
- **Rich document collaboration**: [Automerge](https://automerge.org/) offers a full CRDT suite with causal consistency
- **Distributed systems with high clock skew**: Vector clock-based systems like [Riak](https://riak.com/) handle multi-datacenter scenarios

Starling can complement these tools—use it for application state while delegating collaborative data structures to specialized CRDTs.

## Event System

The core store provides a simple event subscription system for reactivity:

```typescript
type StoreEventListeners<T> = {
  add: (entries: ReadonlyArray<readonly [string, T]>) => void;
  update: (entries: ReadonlyArray<readonly [string, T]>) => void;
  delete: (keys: ReadonlyArray<string>) => void;
};
```

### Event Subscription

Subscribe to store events using the `on()` method:

```typescript
const unsubscribe = store.on('add', (entries) => {
  for (const [id, value] of entries) {
    console.log(`Added ${id}:`, value);
  }
});

// Later, clean up
unsubscribe();
```

### Event Batching

Events are batched per transaction. A `begin()` call that touches multiple records triggers at most one event per event type.

### Building Extensions

The event system is designed for building higher-level features:

- **Persistence**: Subscribe to mutation events and write to storage
- **Queries**: Subscribe to events and update filtered result sets
- **Analytics**: Track mutations for metrics
- **Sync**: Listen for remote changes and propagate them

See `packages/db` for higher-level features built on this event system.

## Module Overview

Each module handles a distinct responsibility in the state-based replication model:

| Module | Responsibility |
| --- | --- |
| [`clock/clock.ts`](../packages/core/src/clock/clock.ts) | Monotonic logical clock that increments a hex counter when the OS clock stalls, forwards itself when observing newer remote stamps, and exposes the shared clock used across resources and documents |
| [`clock/eventstamp.ts`](../packages/core/src/clock/eventstamp.ts) | Encoder/decoder for sortable `YYYY-MM-DDTHH:mm:ss.SSSZ\|counter\|nonce` strings, comparison helpers, and utilities used by resources to apply Last-Write-Wins semantics |
| [`document/resource.ts`](../packages/core/src/document/resource.ts) | Defines resource objects (`type`, `id`, `attributes`, `meta`), handles soft deletion, and merges field-level values with eventstamp comparisons |
| [`document/document.ts`](../packages/core/src/document/document.ts) | Coordinates `JsonDocument` creation and `mergeDocuments`, tracks added/updated/deleted resources for plugin hooks, and keeps document metadata (latest eventstamp) synchronized |
| [`store/store.ts`](../packages/core/src/store/store.ts) | Public `Store` API with transactions, event subscriptions, and document sync helpers such as `merge()` and `collection()` |

### Data Flow

**Local mutations:**
```
User mutation → Store → Transaction staging → Commit → Event listeners
                                    ↓
                            Eventstamp application
                                    ↓
                            Resource merge
```

**Document sync:**
```
store.merge(snapshot) → mergeDocuments(into, from) → Resource merge (mergeResources)
                              ↓                              ↓
                      Clock forwarding                 Field-level LWW
                              ↓                              ↓
                       Update readMap              Track changes (add/update/delete)
                              ↓
                        Event listeners (with tracked changes)
```

## Package Exports

Starling ships as a monorepo with minimal exports:

### `@byearlybird/starling` (Core)

**Exports**: `Store`, `StoreConfig`, `StoreSetTransaction`, `StoreEventListeners`, `StoreEventType`, `ResourceObject`, `JsonDocument`, `AnyObject`
**Dependencies**: Zero runtime dependencies

Provides the minimal core store implementation with CRUD operations, transactions, state-based sync, and event subscriptions.

### `@byearlybird/starling-db`

**Status**: In development
**Planned exports**: Plugins, queries, persistence adapters

Higher-level database utilities that build on the core store's event system.

## Testing Strategy

- **Unit tests**: Cover core modules (`clock`, `eventstamp`, `value`, `record`, `document`, `collection`, `store`)
- **Integration tests**: Verify event subscription and emission works correctly
- **Sync tests**: Verify merge behavior and state replication
- **Property-based tests**: Validate eventstamp monotonicity and merge commutativity

Tests live alongside implementation: `packages/core/src/**/*.test.ts`
