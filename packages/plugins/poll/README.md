# @byearlybird/starling-plugins-poll

Bidirectional synchronization for Starling stores using a simple polling strategy. The plugin monitors store hooks, snapshots encoded documents, and coordinates push/pull cycles against your remote store.

## Installation

```bash
bun add @byearlybird/starling-plugins-poll
```

## Usage

```typescript
import { Store } from "@byearlybird/starling";
import { pollSyncPlugin } from "@byearlybird/starling-plugins-poll";

const store = Store.create<{ text: string; completed: boolean }>().use(
	pollSyncPlugin({
		pullInterval: 5_000,
		push: async (docs) => {
			await fetch("/api/todos", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ todos: docs }),
			});
		},
		pull: async () => {
			const res = await fetch("/api/todos");
			const { todos } = await res.json();
			return todos;
		},
	}),
);

await store.init(); // starts the poller and performs the first pull
// ...
await store.dispose(); // clears intervals and flushes pending pushes
```

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `push` | `(docs) => Promise<void>` | **required** | Called after mutations. Receive the store snapshot and propagate it to your backend. |
| `pull` | `() => Promise<Document.EncodedDocument[]>` | **required** | Fetches remote state. Each document is merged via `tx.merge`. |
| `pullInterval` | `number` | `5 * 60 * 1000` | Milliseconds between background pulls. |
| `immediate` | `boolean` | `true` | When `true`, performs an initial pull during `init`. |
| `preprocess` | `(event, docs) => Promise<Document.EncodedDocument[]>` | `undefined` | Optional hook to encrypt, filter, or log documents before uploading (`event === "push"`) or after downloading (`event === "pull"`). |

### Operational Details

- Mutations mark the store as dirty and schedule a push. Multiple `put/patch/del` calls within the same tick coalesce into a single push.
- Pull responses are merged inside a store transaction and committed without the `silent` flag so downstream hooks (queries, custom plugins) observe the changes.
- `dispose()` clears the polling interval and performs a final push to avoid dropping unsynced changes.
