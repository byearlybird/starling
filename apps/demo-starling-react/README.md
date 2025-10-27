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

- `src/store/todoStore.ts` configures the Starling store with the query plugin for filtering and the unstorage plugin for `localStorage` persistence.
- `src/store/useQueryResults.ts` adapts Starling queries into React state so components rerender whenever query results change.
- `src/App.tsx` contains the todo UI that reads from and writes to the Starling store.

Need deployment guidance? See the [Vite docs](https://vite.dev/guide/static-deploy.html).
