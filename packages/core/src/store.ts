/** biome-ignore-all lint/complexity/noBannedTypes: <{} used to default to empty> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <useful to preserve inference> */
import * as Clock from "./clock";
import type { EncodedDocument } from "./document";
import { decode, encode } from "./document";
import * as KV from "./kv";

type DeepPartial<T> = T extends object
	? { [P in keyof T]?: DeepPartial<T[P]> }
	: T;

/**
 * Type constraint to prevent Promise returns from set callbacks.
 * Transactions must be synchronous operations.
 */
type NotPromise<T> = T extends Promise<any> ? never : T;

/**
 * Called once per commit with all put operations accumulated as decoded entries.
 * Only fires if at least one put occurred.
 */
type StoreOnPut<T> = (entries: ReadonlyArray<readonly [string, T]>) => void;

/**
 * Called once per commit with all patch operations accumulated as decoded entries.
 * Only fires if at least one patch occurred.
 */
type StoreOnPatch<T> = (entries: ReadonlyArray<readonly [string, T]>) => void;

/**
 * Called once per commit with all deleted keys (IDs).
 * Only fires if at least one delete occurred.
 */
type StoreOnDelete = (keys: ReadonlyArray<string>) => void;

/**
 * Hook callbacks that receive batches of decoded entries.
 * Hooks fire on commit only, never during staged operations.
 * Arrays are readonly to prevent external mutation.
 */
type StoreHooks<T> = {
	onPut?: StoreOnPut<T>;
	onPatch?: StoreOnPatch<T>;
	onDelete?: StoreOnDelete;
};

type StorePutOptions = { withId?: string };

type StoreSetTransaction<T> = {
	put: (value: T, options?: StorePutOptions) => string;
	patch: (key: string, value: DeepPartial<T>) => void;
	merge: (doc: EncodedDocument) => void;
	del: (key: string) => void;
	get: (key: string) => T | null;
	rollback: () => void;
};

type PluginMethods = Record<string, (...args: any[]) => any>;

type Plugin<T, M extends PluginMethods = {}> = {
	init: (store: Store<T>) => Promise<void> | void;
	dispose: () => Promise<void> | void;
	hooks?: StoreHooks<T>;
	methods?: M;
};

type ListenerMap<T> = {
	put: Set<StoreOnPut<T>>;
	patch: Set<StoreOnPatch<T>>;
	del: Set<StoreOnDelete>;
};

type Store<T, Extended = {}> = {
	get: (key: string) => T | null;
	set: <R = void>(
		callback: (tx: StoreSetTransaction<T>) => NotPromise<R>,
		opts?: { silent?: boolean },
	) => NotPromise<R>;
	entries: () => IterableIterator<readonly [string, T]>;
	snapshot: () => EncodedDocument[];
	use: <M extends PluginMethods>(
		plugin: Plugin<T, M>,
	) => Store<T, Extended & M>;
	init: () => Promise<Store<T, Extended>>;
	dispose: () => Promise<void>;
} & Extended;

const create = <T>(config: { getId?: () => string } = {}): Store<T, {}> => {
	const kv = KV.create();
	const clock = Clock.create();
	const initializers = new Set<Plugin<T>["init"]>();
	const disposers = new Set<Plugin<T>["dispose"]>();
	const getId = config.getId ?? (() => crypto.randomUUID());
	const encodeValue = (key: string, value: T) =>
		encode(key, value, clock.now());

	// Plugin management
	const listeners: ListenerMap<T> = {
		put: new Set(),
		patch: new Set(),
		del: new Set(),
	};

	const decodeActive = (doc: EncodedDocument | null): T | null => {
		if (!doc || doc["~deletedAt"]) return null;
		return decode<T>(doc)["~data"];
	};

	const store: Store<T> = {
		get(key: string) {
			return decodeActive(kv.get(key));
		},
		entries() {
			function* iterator() {
				for (const [key, doc] of kv.entries()) {
					const data = decodeActive(doc);
					if (data !== null) yield [key, data] as const;
				}
			}

			return iterator();
		},
		snapshot() {
			return Array.from(kv.values());
		},
		set<R = void>(
			callback: (tx: StoreSetTransaction<T>) => NotPromise<R>,
			opts?: { silent?: boolean },
		): NotPromise<R> {
			const tx = kv.begin();
			const silent = opts?.silent ?? false;
			// For puts, we have the value directly
			const putKeyValues: Array<readonly [string, T]> = [];
			// For patches, capture the merged value at patch time
			const patchKeyValues: Array<readonly [string, T]> = [];
			// For deletes, track the keys
			const deleteKeys: Array<string> = [];

			let rolledBack = false;

			const setTransaction: StoreSetTransaction<T> = {
				put(value: T, options?: StorePutOptions) {
					const key = options?.withId ?? getId();
					tx.put(key, encodeValue(key, value));
					putKeyValues.push([key, value] as const);
					return key;
				},
				patch(key: string, value: DeepPartial<T>) {
					tx.patch(key, encode(key, value as T, clock.now()));
					const merged = decodeActive(tx.get(key));
					if (merged) {
						patchKeyValues.push([key, merged] as const);
					}
				},
				merge(doc: EncodedDocument) {
					if (tx.get(doc["~id"])) {
						tx.patch(doc["~id"], doc);
					} else {
						tx.put(doc["~id"], doc);
					}

					// For hooks, we need to decode to get the final merged value
					// Get the current value after the merge from the transaction's view
					const currentDoc = tx.get(doc["~id"]);
					if (currentDoc && !currentDoc["~deletedAt"]) {
						const merged = decode<T>(currentDoc)["~data"];
						patchKeyValues.push([doc["~id"], merged] as const);
					}
				},
				del(key: string) {
					const currentDoc = tx.get(key);
					if (!currentDoc) return;

					tx.del(key, clock.now());
					deleteKeys.push(key);
				},
				get(key: string) {
					return decodeActive(tx.get(key));
				},
				rollback() {
					rolledBack = true;
					tx.rollback();
				},
			};

			try {
				const result = callback(setTransaction);

				// If rollback was explicitly called, don't commit
				if (rolledBack) {
					return result;
				}

				// Auto-commit
				tx.commit();

				if (!silent) {
					// Emit plugin hooks
					if (putKeyValues.length > 0) {
						for (const fn of listeners.put) {
							fn(putKeyValues);
						}
					}
					if (patchKeyValues.length > 0) {
						for (const fn of listeners.patch) {
							fn(patchKeyValues);
						}
					}
					if (deleteKeys.length > 0) {
						for (const fn of listeners.del) {
							fn(deleteKeys);
						}
					}
				}

				return result;
			} catch (error) {
				// Rollback on error and re-throw
				tx.rollback();
				throw error;
			}
		},
		use<M extends PluginMethods>(plugin: Plugin<T, M>): Store<T, M> {
			const { hooks: pluginHooks, init, dispose, methods } = plugin;

			if (pluginHooks) {
				if (pluginHooks.onPut) {
					const callback = pluginHooks.onPut;
					listeners.put.add(callback);
					disposers.add(() => {
						listeners.put.delete(callback);
					});
				}
				if (pluginHooks.onPatch) {
					const callback = pluginHooks.onPatch;
					listeners.patch.add(callback);
					disposers.add(() => {
						listeners.patch.delete(callback);
					});
				}
				if (pluginHooks.onDelete) {
					const callback = pluginHooks.onDelete;
					listeners.del.add(callback);
					disposers.add(() => {
						listeners.del.delete(callback);
					});
				}
			}

			// Inject plugin methods directly into store
			if (methods) {
				Object.assign(this, methods);
			}

			initializers.add(init);
			disposers.add(dispose);

			return this as Store<T, M>;
		},
		async init() {
			for (const fn of initializers) {
				// Await sequentially to honor the order plugins are registered (FIFO)
				await fn(this);
			}

			return this;
		},
		async dispose() {
			for (const fn of Array.from(disposers).toReversed()) {
				// Await in reverse order to honor the order plugins are registered (LIFO)
				await fn();
			}
		},
	};

	return store;
};

export type {
	Store as StarlingStore, // avoid namespace collision
	StoreHooks,
	StoreOnDelete,
	StoreOnPatch,
	StoreOnPut,
	StorePutOptions,
	StoreSetTransaction,
	Plugin,
	PluginMethods,
	DeepPartial,
	NotPromise,
};
export { create };
