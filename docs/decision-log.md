# Architecture Decision Log

This log captures accepted architecture decisions for Starling. Each entry summarizes the context, decision, rationale, and alternatives that were considered.

## Decision 001 — Key-Based Serialization

### Context
We evaluated two serialization strategies for persisted and exported data: key-based (object-style) and positional (array-style).

### Decision
Adopt key-based serialization for all stored and exported data.

### Rationale
- Improves readability and debuggability for humans reviewing persisted payloads.
- Keeps exported data interpretable by end users without additional tooling.
- Enhances comprehension for large language models used in automation and analysis tasks.
- Facilitates schema evolution and long-term maintainability.

### Alternatives Considered
- **Array-based serialization** — Rejected because the compact representation sacrifices clarity when inspecting or extending records.

## Decision 002 — Private Key Naming Convention

### Context
Internal metadata fields (for example IDs and timestamps) must remain compact while being clearly distinguishable from user-defined data.

### Decision
Prefix all private or system-reserved keys with a tilde (`~`), such as `~id`, `~deletedAt`, or `~version`.

### Rationale
- Tilde-prefixed keys appear at the bottom of IntelliSense suggestions, keeping user-focused fields prominent.
- A single-character prefix preserves JSON compactness.
- The tilde is visually distinct, making reserved fields easy to identify during reviews.
- Avoids reusing underscores, which are already common in user-defined identifiers.

### Alternatives Considered
- **Underscore or other alphanumeric prefixes** — Rejected because they blend with typical user-defined keys and provide less visual separation.

## Decision 003 — Last-Write-Wins with Hybrid Logical Clock

### Context
The core store needed a conflict strategy that stayed easy to reason about and required minimal metadata per field.

### Decision
Adopt a Last-Write-Wins merge model using eventstamps derived from the wall clock plus a hex counter (a lightweight hybrid logical clock).

### Rationale
- Keeps the complexity low.
- Works with plain JSON documents.
- Enables deterministic ordering when the wall clock stalls by incrementing the counter.

### Consequences
- Clock skew directly affects merge outcomes; whichever peer reports the newest timestamp wins.
- Concurrent writes can overwrite each other silently because the newer eventstamp  replaces the previous value—there is no merge callback.
- We must persist and forward the latest observed eventstamp (currently handled by the `unstorage` plugin) to keep devices in sync.

### Alternatives Considered
- **Full CRDT per field** — Would give stronger convergence guarantees (for example OR-Sets or multi-value registers) and preserve intent, but the complexity of this library would grow quite a bit. Preferring to leave this to some of the other great CRDT libraries out there.
- **Vector clocks or Lamport timestamps** — Provide causal ordering when paired with peer identifiers, but every document would need to track and merge per-peer counters. That means wider payloads, heavier merge logic, and extra coordination around peer IDs, which runs counter to the goal of keeping the store small and embeddable.
