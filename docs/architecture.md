# Starling Architecture

Status: Draft

This document covers the design and internals of Starling, including the state-based Last-Write-Wins merge strategy, eventstamps, the event system, and module organization.

## Repository Layout

| Path | Description |
| --- | --- |
| `packages/core` | Core CRDT primitives (`JsonDocument`, `ResourceObject`, `createMap`, `createClock`) for state-based replication |
| `packages/db` | Database utilities with typed collections, transactions, and mutation events built on the core primitives |
| `packages/react` | React hooks (legacy; targets pre-1.0 API) |
| `packages/solid` | SolidJS hooks (legacy; targets pre-1.0 API) |

**Key points:**

- Follows a Functional Core, Imperative Shell design—core packages stay predictable while adapters handle IO, frameworks, and persistence.
- Core logic lives under `packages/core` and provides minimal CRDT primitives for document merging and resource management.
- Higher-level database features (collections, transactions, mutation events) live in `packages/db`.
- All packages are TypeScript modules bundled via `tsdown`.
- Tests live alongside implementation: `packages/core/src/**/*.test.ts`.

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

State-based replication keeps the implementation simple:

- Syncing is just "send current state, merge on arrival"
- No operation logs, transformation functions, or causality tracking
- Merge idempotency provides natural retry safety
- Works with any transport that can move JSON

Starling ships entire snapshots. Delta optimizations could be added later while maintaining the state-based model.

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

The `mergeDocuments(into, from)` function handles document-level merging:

1. Merges each resource pair using field-level LWW via `mergeResources`
2. Forwards the clock to the maximum eventstamp from both documents
3. Returns categorized changes (added, updated, deleted) for event notifications

This separates merge logic from higher-level implementations, enabling independent testing and reuse.

## Design Scope

Starling targets personal and small-team apps with these principles:

- Automatic convergence via field-level LWW
- Simple mental model: newest write wins
- Small, embeddable core (zero dependencies)
- Framework-agnostic

For real-time collaborative editing or complex operational transforms, use specialized CRDT libraries (Automerge, Yjs). Starling can manage application state alongside those tools.

## Module Overview

Each module handles a distinct responsibility in the state-based replication model:

| Module | Responsibility |
| --- | --- |
| [`clock/clock.ts`](../packages/core/src/clock/clock.ts) | Monotonic logical clock that increments a hex counter when the OS clock stalls, forwards itself when observing newer remote stamps, and exposes the shared clock used across resources and documents |
| [`clock/eventstamp.ts`](../packages/core/src/clock/eventstamp.ts) | Encoder/decoder for sortable `YYYY-MM-DDTHH:mm:ss.SSSZ\|counter\|nonce` strings, comparison helpers, and utilities used by resources to apply Last-Write-Wins semantics |
| [`document/resource.ts`](../packages/core/src/document/resource.ts) | Defines resource objects (`type`, `id`, `attributes`, `meta`), handles soft deletion, and merges field-level values with eventstamp comparisons |
| [`document/document.ts`](../packages/core/src/document/document.ts) | Coordinates `JsonDocument` creation and `mergeDocuments`, tracks added/updated/deleted resources, and keeps document metadata (latest eventstamp) synchronized |
| [`resource-map/resource-map.ts`](../packages/core/src/resource-map/resource-map.ts) | CRDT data structure providing a map-like interface for managing resources with field-level LWW semantics, document export/import, and soft deletion |

### Data Flow

**ResourceMap mutations:**
```
map.set(id, value) → Generate eventstamp → Merge with existing resource
                            ↓
                    Update internal state
```

**Document merging:**
```
mergeDocuments(into, from) → Resource merge (mergeResources)
              ↓                              ↓
      Clock forwarding                 Field-level LWW
              ↓                              ↓
    Update meta.latest              Track changes (add/update/delete)
              ↓
    Return merged document + changes
```

## Package Exports

Starling ships as a monorepo with minimal exports.

### `@byearlybird/starling` (core)

**Exports:**
- Clocks: `createClock`, `createClockFromEventstamp`
- Documents: `makeDocument`, `mergeDocuments`, `JsonDocument`, `ResourceObject`
- Resource maps: `createMap`, `createMapFromDocument`

### `@byearlybird/starling-db`

**Exports:**
- Database: `createDatabase`, `Database`, `DbConfig`
- Collections: `CollectionHandle`, `TransactionContext`
- Events: `DatabaseMutationEvent`

Provides typed collections with CRUD operations, transactions, and mutation events built on core primitives.

## Testing Strategy

- **Unit tests**: Cover core modules (`clock`, `eventstamp`, `document`, `resource`, `resource-map`)
- **Merge tests**: Verify field-level LWW behavior and document merging
- **Sync tests**: Verify merge behavior and state replication
- **Property-based tests**: Validate eventstamp monotonicity and merge commutativity

Tests live alongside implementation: `packages/core/src/**/*.test.ts`
