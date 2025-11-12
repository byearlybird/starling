import type { StoreAdapter } from "../adapter";

/**
 * In-memory async adapter that wraps a Map.
 *
 * Useful for testing and as a reference implementation.
 * All operations are async to match the StoreAdapter interface,
 * though the underlying Map operations are synchronous.
 *
 * @template V - The type of values stored in the adapter
 *
 * @example
 * ```ts
 * const adapter = new InMemoryAdapter<EncodedDocument>();
 * const store = new StoreLite({ adapter });
 * ```
 */
export class InMemoryAdapter<V> implements StoreAdapter<V> {
	#map = new Map<string, V>();

	async get(key: string): Promise<V | undefined> {
		return this.#map.get(key);
	}

	async set(key: string, value: V): Promise<void> {
		this.#map.set(key, value);
	}

	async delete(key: string): Promise<boolean> {
		return this.#map.delete(key);
	}

	async has(key: string): Promise<boolean> {
		return this.#map.has(key);
	}

	async entries(): Promise<Array<[string, V]>> {
		return Array.from(this.#map.entries());
	}

	async clear(): Promise<void> {
		this.#map.clear();
	}

	async size(): Promise<number> {
		return this.#map.size;
	}
}
