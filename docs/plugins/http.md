# HTTP Plugin

Persistence adapter for Starling using HTTP/REST endpoints. The plugin syncs store snapshots with a remote server, enabling cross-device synchronization over the network.

## Installation

The plugin ships within the core package via the `@byearlybird/starling/plugin-http` subpath. No additional dependencies are required:

```bash
bun add @byearlybird/starling
```

## Usage

```typescript
import { Store } from "@byearlybird/starling";
import { httpPlugin } from "@byearlybird/starling/plugin-http";

const store = await new Store<{ text: string }>()
	.use(httpPlugin("https://api.example.com/todos", {
		debounceMs: 300,
		pollIntervalMs: 5000
	}))
	.init();

// Automatic persistence on every mutation
store.begin((tx) => {
  tx.add({ text: "Buy milk" }, { withId: "todo1" }); // automatically pushes to server
});

store.begin((tx) => {
  tx.update("todo1", { text: "Buy almond milk" }); // automatically syncs
});

store.begin((tx) => {
  tx.del("todo1"); // automatically syncs
});
```

## API

### `httpPlugin(url, config?)`

Returns a Starling plugin that automatically syncs store snapshots with a remote HTTP endpoint.

**Parameters:**

- `url` – Remote endpoint URL for this dataset. The plugin will GET from this URL to fetch data and POST/PUT/PATCH to persist changes.
- `config.debounceMs` – Optional delay (in ms) used to collapse rapid mutations into a single network request. Defaults to `0` (sync immediately).
- `config.pollIntervalMs` – Optional interval (in ms) to poll the server for external changes. When set, the plugin will periodically fetch from the server and merge any updates. Essential for multi-device sync.
- `config.skip` – Optional function that returns `true` to skip network operations. Useful for conditional sync (e.g., `skip: () => !navigator.onLine` to skip when offline).
- `config.onBeforeSet` – Optional hook invoked before sending data to the server. Receives the Collection object `{ "~docs": EncodedDocument[], "~eventstamp": string }` and must return the same structure. Use this for encryption or compression.
- `config.onAfterGet` – Optional hook invoked after fetching from the server but before hydrating the store. Receives the Collection object and must return the same structure. Use this for decryption or validation.
- `config.method` – HTTP method to use for writes. Defaults to `"POST"`. Can be `"POST"`, `"PUT"`, or `"PATCH"`.
- `config.headers` – Optional custom headers to include in all requests. Useful for authentication tokens.
- `config.fetch` – Optional custom fetch implementation. Useful for testing or adding middleware (retries, logging, etc.).
- `config.syncOnInit` – Whether to fetch from the server during initialization. Defaults to `true`. Set to `false` to skip the initial sync.

## Behavior

- During `init`, the plugin fetches data from the URL via GET, forwards the store's clock to the remote `"~eventstamp"`, and replays each document. Provide `onAfterGet` to transform the payload.
- Clock forwarding ensures new writes receive timestamps higher than any remote data, preventing eventstamp collisions.
- `onAdd`, `onUpdate`, and `onDelete` hooks share the same persistence scheduler. When `debounceMs > 0`, only the trailing invocation sends a request.
- Each snapshot is obtained via `store.collection()`, which returns both documents (`"~docs"`) and the latest eventstamp (`"~eventstamp"`).
- `onBeforeSet` fires right before sending data to the server, enabling encryption or filtering.
- When `pollIntervalMs` is set, the plugin periodically fetches from the server and merges changes using Starling's field-level LWW.
- When `skip` returns `true`, all network operations are skipped (both reads and writes).
- Network errors are caught and logged but don't throw. This allows the store to continue working offline.
- `dispose()` clears any pending debounce timer and polling interval, and flushes pending writes. Call it when shutting down to ensure data is persisted.

## Server-Side Implementation

The HTTP plugin expects a simple REST API:

**GET /endpoint** - Returns the collection as JSON:
```json
{
  "~docs": [
    {
      "~id": "todo1",
      "~data": {
        "text": ["Buy milk", "2025-01-01T00:00:00.000Z|0001|abcd"],
        "completed": [false, "2025-01-01T00:00:00.000Z|0001|abcd"]
      },
      "~deletedAt": null
    }
  ],
  "~eventstamp": "2025-01-01T00:00:00.000Z|0001|abcd"
}
```

**POST/PUT/PATCH /endpoint** - Accepts collection JSON in request body:
- Should merge the incoming collection with existing data using Starling's merge logic
- Return 200 OK on success
- Can return the merged collection in response (optional)

### Example Server (Bun)

```typescript
import { serve } from "bun";
import { mergeCollections, type Collection } from "@byearlybird/starling/crdt";

let collection: Collection = {
  "~docs": [],
  "~eventstamp": "2025-01-01T00:00:00.000Z|0000|0000"
};

serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/todos") {
      if (req.method === "GET") {
        return new Response(JSON.stringify(collection), {
          headers: { "Content-Type": "application/json" }
        });
      }

      if (req.method === "POST" || req.method === "PUT") {
        const incoming = await req.json() as Collection;
        const result = mergeCollections(collection, incoming);
        collection = result.collection;

        return new Response(JSON.stringify(collection), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  }
});
```

See the [demo server](../../apps/demo-starling-server) for a complete implementation.

## Hybrid Storage Strategies

Combine the HTTP plugin with local persistence for offline-first apps:

```typescript
import { Store } from "@byearlybird/starling";
import { indexedDBPlugin } from "@byearlybird/starling/plugin-indexeddb";
import { httpPlugin } from "@byearlybird/starling/plugin-http";

const store = await new Store<Todo>()
  // Local persistence - immediate writes
  .use(indexedDBPlugin('todos'))
  // Remote sync - debounced with polling
  .use(httpPlugin('https://api.example.com/todos', {
    debounceMs: 1000,
    pollIntervalMs: 5000,
    skip: () => !navigator.onLine  // Only sync when online
  }))
  .init();
```

**How it works:**
- Local writes go to IndexedDB immediately (no network delay)
- HTTP plugin debounces and syncs to server every 1 second
- Polling checks server every 5 seconds for external changes
- When offline, local changes accumulate in IndexedDB
- When back online, pending changes sync to server

## Authentication

Use custom headers for authentication:

```typescript
const store = await new Store<Todo>()
  .use(httpPlugin('https://api.example.com/todos', {
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN_HERE',
      'X-User-ID': 'user123'
    }
  }))
  .init();
```

For dynamic tokens (that refresh), use a custom fetch implementation:

```typescript
const authenticatedFetch = async (url: string | URL, options?: RequestInit) => {
  const token = await getAccessToken(); // Your token refresh logic

  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      'Authorization': `Bearer ${token}`
    }
  });
};

const store = await new Store<Todo>()
  .use(httpPlugin('https://api.example.com/todos', {
    fetch: authenticatedFetch
  }))
  .init();
```

## Encryption

Encrypt data before sending to the server:

```typescript
const store = await new Store<Todo>()
  .use(httpPlugin('https://api.example.com/todos', {
    onBeforeSet: async (collection) => {
      const encrypted = await encrypt(JSON.stringify(collection));
      return { ...collection, encrypted }; // Your encryption format
    },
    onAfterGet: async (collection) => {
      if ('encrypted' in collection) {
        const decrypted = await decrypt(collection.encrypted);
        return JSON.parse(decrypted);
      }
      return collection;
    }
  }))
  .init();
```

## Error Handling

Network errors are logged but don't throw:

```typescript
const store = await new Store<Todo>()
  .use(httpPlugin('https://api.example.com/todos', {
    // This won't crash even if server is down
    pollIntervalMs: 5000
  }))
  .init();

// Store continues to work locally
store.begin(tx => {
  tx.add({ text: 'Works offline!' });
});
```

For custom error handling, wrap the plugin's fetch:

```typescript
const errorHandlingFetch = async (url: string | URL, options?: RequestInit) => {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      // Your custom error handling
      logError(`HTTP ${response.status}: ${response.statusText}`);
      showUserNotification('Sync failed, will retry...');
    }

    return response;
  } catch (error) {
    // Network error
    logError('Network error:', error);
    return new Response(null, { status: 0, statusText: 'Network Error' });
  }
};

const store = await new Store<Todo>()
  .use(httpPlugin('https://api.example.com/todos', {
    fetch: errorHandlingFetch
  }))
  .init();
```

## Comparison with Unstorage Plugin

**Use HTTP plugin when:**
- You have a custom REST API
- You need fine-grained control over HTTP requests
- You want zero external dependencies
- You need custom authentication/encryption
- Your server doesn't use the unstorage protocol

**Use Unstorage plugin with HTTP driver when:**
- Your server already uses unstorage
- You want to leverage unstorage's driver ecosystem
- You need cross-platform storage abstraction
- You want built-in retry logic and error handling from unstorage

Both plugins can be used together - for example, HTTP for your main API and unstorage for a backup storage provider.

## Performance Tips

1. **Debounce writes** - Set `debounceMs` to batch rapid mutations:
   ```typescript
   debounceMs: 1000  // Max 1 request per second
   ```

2. **Reduce polling frequency** - Balance freshness vs bandwidth:
   ```typescript
   pollIntervalMs: 30000  // Check every 30 seconds instead of 5
   ```

3. **Skip when offline** - Save failed requests:
   ```typescript
   skip: () => !navigator.onLine
   ```

4. **Use conditional sync** - Only sync important changes:
   ```typescript
   skip: () => store.size() > 1000  // Skip large syncs
   ```

5. **Combine with local storage** - Fast local reads, async remote writes:
   ```typescript
   .use(indexedDBPlugin('todos'))  // Fast
   .use(httpPlugin('...', { debounceMs: 5000 }))  // Slow but synced
   ```
