/**
 * Async storage adapter interface for StoreLite.
 *
 * Provides a Map-like API with async operations, enabling integration
 * with IndexedDB, SQLite (OPFS), remote databases, and other async storage.
 *
 * @template V - The type of values stored in the adapter
 *
 * @example
 * ```ts
 * class MyAdapter implements StoreAdapter<EncodedDocument> {
 *   async get(key: string) {
 *     return await db.get(key);
 *   }
 *   // ... implement other methods
 * }
 * ```
 */
export interface StoreAdapter<V> {
	/**
	 * Get a value by key.
	 * @returns The value, or undefined if not found
	 */
	get(key: string): Promise<V | undefined>;

	/**
	 * Set a value for a key.
	 */
	set(key: string, value: V): Promise<void>;

	/**
	 * Delete a value by key.
	 * @returns true if the key existed, false otherwise
	 */
	delete(key: string): Promise<boolean>;

	/**
	 * Check if a key exists.
	 */
	has(key: string): Promise<boolean>;

	/**
	 * Get all entries as an array of [key, value] tuples.
	 */
	entries(): Promise<Array<[string, V]>>;

	/**
	 * Remove all entries.
	 */
	clear(): Promise<void>;

	/**
	 * Get the number of entries.
	 */
	size(): Promise<number>;
}
