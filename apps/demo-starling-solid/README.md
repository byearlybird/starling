# Solid + Starling Todo Demo

A small todo app that demonstrates Starling’s Store + plugin API in a SolidJS application.

> **Status:** This demo targets the earlier `createStore`, `queryPlugin`, and `unstoragePlugin` APIs from `@byearlybird/starling` 0.6.x. The core library in this repo now focuses on CRDT primitives and `@byearlybird/starling-db`. The demo will be updated once the new Store API is in place.

## Getting Started

```bash
bun install
bun --filter demo-starling-solid dev
```

Then open `http://localhost:5173`.

## Available Scripts

- `bun dev` – run Vite in development mode
- `bun build` – type-check and build for production
- `bun preview` – preview the production output locally

## What This Demo Shows

- `src/store/task-store.ts` configures a Starling store with localStorage and HTTP sync via the unstorage plugin, including:
  - Storage multiplexing (local + remote persistence)
  - Conditional sync with a `skip` function
  - Data transformation with `onBeforeSet` and `onAfterGet` hooks
  - Typed SolidJS hooks created with `createStoreHooks`
- `src/App.tsx` contains the UI that reads from and writes to the store using reactive queries and Solid primitives such as `For` and `Show`.

For deployment guidance, see the Vite docs: https://vite.dev/guide/static-deploy.html.
