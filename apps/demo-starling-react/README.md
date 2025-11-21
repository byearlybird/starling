# React + Starling Todo Demo

A small todo app that demonstrates how to wire `@byearlybird/starling-db` directly into a React UI without additional hook packages.

## Getting Started

```bash
bun install
bun --filter demo-starling-react dev
```

Then open `http://localhost:5173` while the dev server runs.

## Available Scripts

- `bun dev` – run Vite in development mode
- `bun build` – type-check and build for production
- `bun preview` – preview the production build locally

## What This Demo Shows

- `src/store/task-store.ts` defines the Starling database schema, configures IndexedDB persistence via `idbPlugin`, and wires in
  `httpPlugin` (disabled unless `VITE_STARLING_HTTP_BASE_URL` is set) for optional HTTP sync with pseudo-encrypted payloads.
- `src/store/use-tasks.ts` uses `db.on("mutation")` + `db.tasks.find(...)` to keep columns in sync with database changes.
- `src/App.tsx` and `src/column.tsx` read/write tasks through the database to demonstrate CRUD flows.

For deployment guidance, see the Vite docs: https://vite.dev/guide/static-deploy.html.
