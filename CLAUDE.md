@README.md
@CONTRIBUTING.md
@docs/architecture.md
@docs/decision-log.md
@docs/queries.md
@docs/plugins/unstorage.md

## Container Initialization (Claude Code Web)

When running in Claude Code on the web, if `bun` commands fail (e.g., `bun test`, `bun install`, `bun run`), first run the container initialization script and then retry:

```bash
npm run init:container
```

This installs bun globally in the container environment. After running this once, bun commands should work normally.
