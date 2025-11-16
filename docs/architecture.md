# Starling Architecture

Status: Draft

This document covers the design and internals of Starling, including the state-based Last-Write-Wins merge strategy, eventstamps, the plugin system, and module organization.

## Repository Layout

| Path | Description |
| --- | --- |
| `packages/core` | Core store implementation (`Store`, `Document`, `Eventstamp`, `Record`, `Value`, `Collection`, `Clock`) with built-in reactive queries, plus unit tests |
| `packages/core/src/plugins/unstorage` | Persistence plugin that hydrates on boot and debounces writes |
| `packages/react` | React hooks for Starling stores (`createStoreHooks`) |
| `packages/solid` | SolidJS hooks for Starling stores (`createStoreHooks`) |

**Key points:**

- Core logic lives under `packages/core`; reactive queries are built into the `Store` class
- Official plugins are co-located in `packages/core/src/plugins/*`
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

- **Requires eventstamp persistence**: Devices must save the highest eventstamp they've seen to prevent clock regression after restarts. The `unstorage` plugin handles this automatically.

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

**Deletions**: Soft-deleted via `~deletedAt` eventstamp. Deleted documents remain in the snapshot, enabling restoration by writing newer eventstamps to their fields. This also ensures deletion events propagate correctly during sync.

### Collection Format

The `Collection` type represents the complete persistent state of a store, following the tilde convention for system-reserved keys:

```typescript
export type Collection = {
  "~docs": EncodedDocument[];
  "~eventstamp": string;
};
```

**Design notes:**

- **`~docs`**: Array of encoded documents, including soft-deleted items (those with `~deletedAt` set). This ensures deletion events propagate during sync.
- **`~eventstamp`**: The highest eventstamp observed by the collection. When merging collections, the clock forwards to the newest eventstamp to prevent collisions across sync boundaries.

Example collection:

```typescript
{
  "~docs": [
    {
      "~id": "user-1",
      "~data": {
        "name": ["Alice", "2025-10-26T10:00:00.000Z|0001|a7f2"],
        "email": ["alice@example.com", "2025-10-26T10:00:00.000Z|0001|a7f2"]
      },
      "~deletedAt": null
    }
  ],
  "~eventstamp": "2025-10-26T10:00:00.000Z|0001|a7f2"
}
```

The tilde prefix (`~`) distinguishes system metadata from user-defined data, maintaining consistency with other system-reserved keys like `~id` and `~deletedAt` in encoded documents.

### Merging Collections

The `mergeCollections(into, from)` function handles collection-level merging with automatic change detection:

1. **Field-level LWW**: Each document pair merges using `mergeDocs`, preserving the newest eventstamp for each field
2. **Clock forwarding**: The resulting collection's eventstamp is the maximum of both input eventstamps
3. **Change tracking**: Returns categorized changes (added, updated, deleted) for plugin hook notifications

This design separates merge logic from store orchestration, enabling independent testing and reuse of collection operations.

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

## Plugin System

Stores are extensible via plugins that provide lifecycle and mutation hooks:

```typescript
type Plugin<T> = {
  onInit: (store: Store<T>) => Promise<void> | void;
  onDispose: () => Promise<void> | void;
  onAdd?: (entries: ReadonlyArray<readonly [string, T]>) => void;
  onUpdate?: (entries: ReadonlyArray<readonly [string, T]>) => void;
  onDelete?: (keys: ReadonlyArray<string>) => void;
};
```

### Hook Execution

Plugins tap into the store lifecycle at specific points:

- **`onInit`**: Setup phase during `store.init()` (hydrate snapshots, start pollers, establish connections)
- **`onDispose`**: Cleanup phase during `store.dispose()` (flush pending work, close connections)
- **Mutation hooks** (`onAdd`, `onUpdate`, `onDelete`): React to changes after transactions commit, receiving batched entries by mutation type

Mutation hooks are **optional**—implement only what your plugin needs. For example, a read-only analytics plugin might only use `onInit` and `onAdd`.

### Plugin Surface

Plugins interact with the store exclusively through lifecycle and mutation hooks. The core API already exposes querying and every mutation primitive, so plugins focus on persistence, analytics, or side effects without mutating the store prototype.

### Plugin Composition

Plugins stack cleanly—each operates independently:

```typescript
const store = await new Store<Todo>()
  .use(unstoragePlugin("todos", localStorageBackend))
  .use(unstoragePlugin("todos", httpBackend, { pollIntervalMs: 5000 }))
  .init();
```

**Execution order:**
1. `onInit` hooks run sequentially (first registered, first executed)
2. Mutation hooks run sequentially after each transaction commits
3. `onDispose` hooks run sequentially during teardown

## Module Overview

Each module handles a distinct responsibility in the state-based replication model:

| Module | Responsibility |
| --- | --- |
| [`clock.ts`](../packages/core/src/clock.ts) | Monotonic logical clock that increments a hex counter when the OS clock stalls, generates random nonces for tie-breaking, and forwards itself when observing newer remote stamps |
| [`eventstamp.ts`](../packages/core/src/crdt/eventstamp.ts) | Encoder/decoder for sortable `YYYY-MM-DDTHH:mm:ss.SSSZ\|counter\|nonce` strings |
| [`value.ts`](../packages/core/src/crdt/value.ts) | Wraps field values with eventstamps and merges values by comparing stamps |
| [`record.ts`](../packages/core/src/crdt/record.ts) | Recursively encodes/decodes nested objects, merging each field independently |
| [`document.ts`](../packages/core/src/crdt/document.ts) | Attaches system metadata (`~id`, `~deletedAt`) and handles soft-deletion |
| [`collection.ts`](../packages/core/src/crdt/collection.ts) | Manages sets of documents with clock synchronization, provides field-level LWW merge logic via `mergeCollections`, and tracks changes for hook notifications |
| [`store.ts`](../packages/core/src/store.ts) | User-facing API, built-in reactive queries, plugin orchestration, transaction management, and internal map storage with transactional staging |

### Data Flow

**Local mutations:**
```
User mutation → Store → Transaction staging → Commit → Plugin hooks
                                    ↓
                            Eventstamp application
                                    ↓
                            Document/Record/Value merge
```

**Collection sync:**
```
store.merge(snapshot) → mergeCollections(into, from) → Document merge (mergeDocs)
                              ↓                              ↓
                      Clock forwarding                 Field-level LWW
                              ↓                              ↓
                       Update readMap              Track changes (add/update/delete)
                              ↓
                        Plugin hooks (with tracked changes)
```

## Package Exports

Starling ships as a monorepo with subpath exports:

### `@byearlybird/starling` (Core)

**Exports**: `Store`, `StoreConfig`, `StoreSetTransaction`, `Plugin`, `Query`, `QueryConfig`, `EncodedDocument`, `processDocument`  
**Dependencies**: Zero runtime dependencies

Provides the core store implementation, built-in queries, and plugin hooks.

### `@byearlybird/starling/plugin-unstorage`

**Exports**: `unstoragePlugin`  
**Peer dependency**: `unstorage@^1.17.1`

Persistence layer supporting any `unstorage` backend (localStorage, HTTP, filesystem, etc.). Automatically persists the latest eventstamp to prevent clock regression.

## Testing Strategy

- **Unit tests**: Cover core modules (`clock`, `eventstamp`, `value`, `record`, `document`, `collection`, `store`)
- **Integration tests**: Verify plugin hooks fire correctly and multi-plugin composition works
- **Query tests**: Verify reactive query behavior, hydration, and change tracking
- **Property-based tests**: Validate eventstamp monotonicity and merge commutativity

Tests live alongside implementation: `packages/core/src/**/*.test.ts`