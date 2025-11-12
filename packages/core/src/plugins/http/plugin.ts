import type { Collection } from "../../crdt";
import type { Plugin, Store } from "../../store";

type MaybePromise<T> = T | Promise<T>;

type HTTPOnBeforeSet = (data: Collection) => MaybePromise<Collection>;

type HTTPOnAfterGet = (data: Collection) => MaybePromise<Collection>;

type HTTPMethod = "GET" | "POST" | "PUT" | "PATCH";

/**
 * Configuration options for the HTTP persistence plugin.
 */
type HTTPConfig = {
	/** Delay in ms to collapse rapid mutations into a single write. Default: 0 (immediate) */
	debounceMs?: number;
	/** Interval in ms to poll storage for external changes. When set, enables automatic sync. */
	pollIntervalMs?: number;
	/** Hook invoked before persisting to storage. Use for encryption, compression, etc. */
	onBeforeSet?: HTTPOnBeforeSet;
	/** Hook invoked after loading from storage. Use for decryption, validation, etc. */
	onAfterGet?: HTTPOnAfterGet;
	/** Function that returns true to skip persistence operations. Use for conditional sync. */
	skip?: () => boolean;
	/** HTTP method to use for writes. Default: "POST" */
	method?: HTTPMethod;
	/** Custom headers to include in requests */
	headers?: Record<string, string>;
	/** Custom fetch implementation (useful for testing or custom transports) */
	fetch?: typeof fetch;
	/** Whether to perform initial sync on init. Default: true */
	syncOnInit?: boolean;
};

/**
 * Helper class to manage HTTP operations for a Starling store.
 */
class HTTPStorage {
	private readonly baseUrl: string;
	private readonly method: HTTPMethod;
	private readonly headers: Record<string, string>;
	private readonly fetchImpl: typeof fetch;

	constructor(
		baseUrl: string,
		method: HTTPMethod = "POST",
		headers: Record<string, string> = {},
		fetchImpl: typeof fetch = globalThis.fetch,
	) {
		this.baseUrl = baseUrl;
		this.method = method;
		this.headers = {
			"Content-Type": "application/json",
			...headers,
		};
		this.fetchImpl = fetchImpl;
	}

	/**
	 * Gets a collection from the remote server.
	 */
	async get(): Promise<Collection | null> {
		try {
			const response = await this.fetchImpl(this.baseUrl, {
				method: "GET",
				headers: this.headers,
			});

			if (response.status === 404) {
				return null;
			}

			if (!response.ok) {
				throw new Error(
					`HTTP GET failed with status ${response.status}: ${response.statusText}`,
				);
			}

			const data = await response.json();
			return data as Collection;
		} catch (error) {
			// Network errors or JSON parse errors - log and return null
			console.error("Failed to fetch from remote:", error);
			return null;
		}
	}

	/**
	 * Sets a collection on the remote server.
	 */
	async set(value: Collection): Promise<void> {
		try {
			const response = await this.fetchImpl(this.baseUrl, {
				method: this.method,
				headers: this.headers,
				body: JSON.stringify(value),
			});

			if (!response.ok) {
				throw new Error(
					`HTTP ${this.method} failed with status ${response.status}: ${response.statusText}`,
				);
			}
		} catch (error) {
			// Network errors - log but don't throw (allows offline operation)
			console.error("Failed to push to remote:", error);
		}
	}
}

/**
 * Persistence plugin for Starling using HTTP/REST endpoints.
 *
 * Automatically persists store snapshots to a remote server and optionally polls for external changes.
 *
 * @param url - Remote endpoint URL for this dataset
 * @param config - Optional configuration for debouncing, polling, hooks, and conditional sync
 * @returns Plugin instance for store.use()
 *
 * @example
 * ```ts
 * import { httpPlugin } from "@byearlybird/starling/plugin-http";
 *
 * const store = await new Store<Todo>()
 *   .use(httpPlugin('https://api.example.com/todos', {
 *     debounceMs: 300,
 *     pollIntervalMs: 5000,
 *     method: 'PUT',
 *     headers: { 'Authorization': 'Bearer token' },
 *     skip: () => !navigator.onLine
 *   }))
 *   .init();
 * ```
 *
 * @see {@link ../../../../docs/plugins/http.md} for detailed configuration guide
 */
function httpPlugin<T>(url: string, config: HTTPConfig = {}): Plugin<T> {
	const {
		debounceMs = 0,
		pollIntervalMs,
		onBeforeSet,
		onAfterGet,
		skip,
		method = "POST",
		headers = {},
		fetch: fetchImpl = globalThis.fetch,
		syncOnInit = true,
	} = config;

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let store: Store<T> | null = null;
	let persistPromise: Promise<void> | null = null;
	const storage = new HTTPStorage(url, method, headers, fetchImpl);

	const persistSnapshot = async () => {
		if (!store) return;
		const data = store.collection();
		const persisted =
			onBeforeSet !== undefined ? await onBeforeSet(data) : data;
		await storage.set(persisted);
	};

	const runPersist = async () => {
		debounceTimer = null;
		persistPromise = persistSnapshot();
		await persistPromise;
		persistPromise = null;
	};

	const schedulePersist = () => {
		if (skip?.()) return;

		if (debounceMs === 0) {
			persistPromise = persistSnapshot().finally(() => {
				persistPromise = null;
			});
			return;
		}

		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
		}

		debounceTimer = setTimeout(() => {
			runPersist();
		}, debounceMs);
	};

	const pollStorage = async () => {
		if (!store) return;
		if (skip?.()) return;

		const persisted = await storage.get();

		if (!persisted) return;

		const data =
			onAfterGet !== undefined ? await onAfterGet(persisted) : persisted;

		store.merge(data);
	};

	return {
		onInit: async (s) => {
			store = s;

			// Initial load from remote server
			if (syncOnInit) {
				await pollStorage();
			}

			// Start polling if configured
			if (pollIntervalMs !== undefined && pollIntervalMs > 0) {
				pollInterval = setInterval(() => {
					pollStorage();
				}, pollIntervalMs);
			}
		},
		onDispose: async () => {
			// Flush any pending debounced write
			if (debounceTimer !== null) {
				clearTimeout(debounceTimer);
				debounceTimer = null;
				// Run the pending persist operation
				await runPersist();
			}
			if (pollInterval !== null) {
				clearInterval(pollInterval);
				pollInterval = null;
			}
			// Wait for any remaining in-flight persistence to complete
			if (persistPromise !== null) {
				await persistPromise;
			}
			store = null;
		},
		onAdd: () => {
			schedulePersist();
		},
		onUpdate: () => {
			schedulePersist();
		},
		onDelete: () => {
			schedulePersist();
		},
	};
}

export { httpPlugin };
export type { HTTPConfig };
