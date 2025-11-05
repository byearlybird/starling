# Solid + Starling Todo Demo

A todo list example demonstrating Starling's built-in reactive queries and the unstorage plugin for persistence within a SolidJS application.

## Getting Started

```bash
bun install
bun --filter demo-starling-solid dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Available Scripts

- `bun dev` – run Vite in development mode.
- `bun build` – type-check and build for production.
- `bun preview` – preview the production output locally.

## Starling Highlights

- `src/store/task-store.ts` configures the Starling store with localStorage and HTTP sync using the unstorage plugin. It also demonstrates:
  - Storage multiplexing (local + remote persistence)
  - Conditional sync with the `skip` option
  - Data transformation with `onBeforeSet` and `onAfterGet` hooks
  - Creating typed SolidJS hooks with `createStoreHooks`
- `src/App.tsx` contains the UI that reads from and writes to the Starling store using built-in reactive queries with SolidJS primitives (`For`, `Show`).

For deployment guidance see the [Vite docs](https://vite.dev/guide/static-deploy.html).
