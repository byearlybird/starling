# @byearlybird/starling-solid

SolidJS hooks for Starling stores.

> **Status:** This package still targets the earlier `Store` + plugin API from Starling 0.6.x (for example, `createStore`, `queryPlugin`). The core library in this repo now focuses on CRDT primitives and `@byearlybird/starling-db`. Until a new Store API is available, treat this package as experimental/legacy.

## Installation

```bash
bun add @byearlybird/starling @byearlybird/starling-solid
```

## Overview

`@byearlybird/starling-solid` exposes a single factory:

- `createStoreHooks(store)` – returns `{ StoreProvider, useStore, useQuery }`

These hooks are wired to the Store type exported by older versions of `@byearlybird/starling` and depend on the query plugin (`store.query`).

This repository does not yet define the next-generation Store API on top of `@byearlybird/starling-db`, so the existing examples are intentionally omitted here to avoid documenting an API surface that is about to change.

For concrete examples, refer to:

- The demo app in `apps/demo-starling-solid`
- The Store + plugin documentation for the 0.6.x series of Starling

## License

MIT
