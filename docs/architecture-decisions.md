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

