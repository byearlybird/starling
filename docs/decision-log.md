# Architecture Decision Log

This log captures accepted architecture decisions for Starling. Each entry summarizes the context, decision, rationale, and alternatives considered.

---

## Decision 001 — Key-Based Serialization

**Context**

Two serialization strategies for persisted and exported data were considered: key-based (object-style) and positional (array-style).

**Decision**

Adopt key-based serialization for all stored and exported data.

**Rationale**

Key-based serialization makes data self-documenting:

- **Human-readable**: Developers can inspect persisted payloads without decoding schemas
- **Tooling-friendly**: LLMs and automation scripts can parse exported data without position mappings
- **Evolution-ready**: Adding fields doesn't break existing parsers

**Alternatives Considered**

- **Array-based serialization** — Offers ~20-30% smaller payloads but requires schema documentation to interpret. The compact representation sacrifices debuggability and makes schema evolution brittle (adding a field shifts all subsequent positions).

---

## Decision 002 — JSON:API Serialization Format

**Context**

Starling needed a standardized, interoperable format for document and collection serialization that:
1. Is widely recognized and documented
2. Works across disk storage, sync messages, network transport, and export/import
3. Clearly separates user data from system metadata
4. Supports extensibility and tooling integration

**Decision**

Adopt JSON:API as the canonical serialized format for all documents and collections.

**Document structure** (resource object):
```typescript
{
  type: "resource",           // Resource type identifier
  id: "doc-1",                // Document ID
  attributes: { /* CRDT */ }, // User data with eventstamps
  meta: {                     // System metadata
    "~deletedAt": null
  }
}
```

**Document structure** (JSON:API document):
```typescript
{
  data: [/* resource objects */],  // Array of documents
  meta: {
    "~eventstamp": "..."            // Clock synchronization
  }
}
```

**Rationale**

JSON:API provides a well-established standard with significant benefits:

- **Industry standard**: [JSON:API specification](https://jsonapi.org/) is widely adopted, well-documented, and understood by developers
- **Clear structure**: Separates concerns cleanly—`type`/`id` for identity, `attributes` for data, `meta` for system fields
- **Tooling ecosystem**: Existing libraries, validators, and API clients work with this format out-of-the-box
- **Extensibility**: The spec defines clear extension points (`meta`, `links`, `relationships`) for future features
- **Human-readable**: Clear field names (`data`, `meta`, `attributes`) make debugging and inspection straightforward
- **Transport-agnostic**: Works equally well for disk storage, HTTP APIs, WebSocket messages, and file exports

**Migration from Tilde Prefix**

This decision supersedes an earlier internal format using tilde prefixes (`~id`, `~data`, `~deletedAt`). The JSON:API format provides superior:
- **Interoperability**: Standard format works with existing tools and ecosystems
- **Clarity**: Explicit nesting (`meta.deletedAt`) vs. flat namespace (`~deletedAt`)
- **Extensibility**: Defined extension points for future system metadata

**Alternatives Considered**

- **Keep tilde prefix** — Custom format works but lacks ecosystem support and requires documentation
- **GraphQL format** — More complex, focused on query language rather than data serialization
- **Custom nested format** — Could work but reinvents the wheel and requires custom tooling

---

## Decision 003 — Last-Write-Wins with Hybrid Logical Clock

**Context**

Starling needed a conflict resolution strategy that:
1. Works with plain JSON (no complex CRDT types)
2. Requires minimal per-field metadata
3. Provides deterministic outcomes across devices

**Decision**

Use Last-Write-Wins (LWW) at the field level, with eventstamps (wall clock + hex counter) providing monotonic ordering. Starling uses **state-based replication**—it ships document snapshots, not operation logs.

**Rationale**

This approach balances simplicity and correctness:

- **Simple mental model**: "Newest write wins" is easy to explain and reason about
- **State-based, not operation-based**: Syncing sends document state, not edit histories. This eliminates the need to track, store, and replay operation logs
- **Works with plain objects**: Per JSON:API spec, documents must be objects (not primitives). Field values can be any JSON type with eventstamps tracked per field
- **Handles clock stalls**: The hex counter increments when the wall clock doesn't advance, and a random nonce provides a final tie-breaker, effectively eliminating the risk of ties
- **Embeddable**: Minimal overhead (~34 bytes per field for the eventstamp)

**Trade-offs**

This design makes specific compromises:

1. **Clock skew affects outcomes**: If Client A's clock is 5 minutes ahead, its writes always win—even if they're logically older. This is acceptable for personal/small-team apps where devices sync regularly.

2. **Silent overwrites**: Concurrent edits to the same field result in one value winning. There's no "conflict detected" callback. Users must structure data to minimize collisions (e.g., keyed records instead of arrays).

3. **Eventstamp persistence required**: Each device must persist the highest eventstamp it's seen. Without this, a device coming back online with a stale clock could lose writes (the `unstorage` plugin handles this automatically).

**Alternatives Considered**

- **Operational Transformation (OT)** — An operation-based approach that provides intent-preserving merges (e.g., two users editing different parts of a text document). Requires complex transformation functions, operation logs, and causality tracking.

**When This Breaks Down**

LWW is insufficient for:
- **Real-time collaborative text editing** (use OT or CRDTs)
- **Distributed systems with high clock skew** (use vector clocks)
- **Scenarios requiring conflict detection** (use CRDTs with multi-value registers)

For these cases, we recommend libraries like [Automerge](https://automerge.org/), [Yjs](https://docs.yjs.dev/), or [Diamond Types](https://github.com/josephg/diamond-types).

---
