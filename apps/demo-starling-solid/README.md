# Solid + Starling Todo Demo

A todo list example demonstrating Starling's query plugin for filtered views and the unstorage plugin for persistence within a Solid application.

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

- `src/store/todoStore.ts` configures the Starling store with the query and unstorage plugins for persisted, filterable todos.
- `src/store/createQuerySignal.ts` adapts Starling query results into Solid signals so the UI reacts to store changes.
- `src/App.tsx` contains the todo UI using Solid primitives (`createSignal`, `For`, `Show`).

For deployment guidance see the [Vite docs](https://vite.dev/guide/static-deploy.html).
