@README.md
@CONTRIBUTING.md
@docs/architecture.md
@docs/decision-log.md

## Container Initialization

When running this repo in a fresh container, Bun may not be installed yet. If `bun` commands fail (`bun test`, `bun install`, `bun run`), run:

```bash
npm run init:container
```

This installs Bun globally in the container. After running this once, Bun-based scripts in this repository should work normally.
