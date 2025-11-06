# React + Starling Todo Demo

A todo list example demonstrating Starling's query plugin for filtered views and the unstorage plugin for persistence within a React application.

## Getting Started

```bash
bun install
bun --filter demo-starling-react dev
```

Visit [http://localhost:5173](http://localhost:5173) while the dev server runs.

## Available Scripts

- `bun dev` – launch Vite in development mode.
- `bun build` – run type-checks and emit a production bundle.
- `bun preview` – preview the production build locally.

## Starling Highlights

- `src/store/task-store.ts` configures the Starling store with localStorage and HTTP sync using the unstorage plugin. It also demonstrates:
  - Storage multiplexing (local + remote persistence)
  - Conditional sync with the `skip` option
  - Data transformation with `onBeforeSet` and `onAfterGet` hooks
  - Creating typed React hooks with `createStoreHooks`
- `src/App.tsx` contains the UI that reads from and writes to the Starling store using built-in reactive queries.

Need deployment guidance? See the [Vite docs](https://vite.dev/guide/static-deploy.html).
