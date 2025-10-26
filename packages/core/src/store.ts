import { create as createClock } from "./clock";
import type { EncodedDocument } from "./document";
import { decode, encode } from "./document";
import * as $map from "./map";

type DeepPartial<T> = T extends object
	? { [P in keyof T]?: DeepPartial<T[P]> }
	: T;

/**
 * Called once per commit with all put operations accumulated as decoded entries.
 * Only fires if at least one put occurred.
 */
type StoreOnPut<T extends Record<string, unknown>> = (
	entries: ReadonlyArray<readonly [string, T]>,
) => void;

/**
 * Called once per commit with all patch operations accumulated as decoded entries.
 * Only fires if at least one patch occurred.
 */
type StoreOnPatch<T extends Record<string, unknown>> = (
	entries: ReadonlyArray<readonly [string, T]>,
) => void;

/**
 * Called once per commit with all deleted keys (IDs).
 * Only fires if at least one delete occurred.
 */
type StoreOnDelete = (keys: ReadonlyArray<string>) => void;

/**
 * Called before a put operation is applied.
 * Throws to reject the operation.
 */
type StoreOnBeforePut<T extends Record<string, unknown>> = (
	key: string,
	value: T,
) => void;

/**
 * Called before a patch operation is applied.
 * Throws to reject the operation.
 */
type StoreOnBeforePatch<T extends Record<string, unknown>> = (
	key: string,
	value: DeepPartial<T>,
) => void;

/**
 * Called before a delete operation is applied.
 * Throws to reject the operation.
 */
type StoreOnBeforeDelete = (key: string) => void;

/**
 * Hook callbacks that receive batches of decoded entries.
 * Hooks fire on commit only, never during staged operations.
 * Arrays are readonly to prevent external mutation.
 */
type StoreHooks<T extends Record<string, unknown>> = {
	onBeforePut?: StoreOnBeforePut<T>;
	onBeforePatch?: StoreOnBeforePatch<T>;
	onBeforeDelete?: StoreOnBeforeDelete;
	onPut?: StoreOnPut<T>;
	onPatch?: StoreOnPatch<T>;
	onDelete?: StoreOnDelete;
};

/**
 * Configuration for Store instance.
 * Hooks receive batches of decoded entries on commit.
 */
type StoreOptions<T extends Record<string, unknown>> = {
	hooks?: StoreHooks<T>;
};

type StoreTransaction<T extends Record<string, unknown>> = {
	put: (key: string, value: T) => void;
	patch: (key: string, value: DeepPartial<T>) => void;
	del: (key: string) => void;
	commit: (opts?: { silent: false }) => void;
	rollback: () => void;
};

type PluginHandle<T extends Record<string, unknown>> = {
	init: () => Promise<void> | void;
	dispose: () => Promise<void> | void;
	hooks?: StoreHooks<T>;
};

type Plugin<T extends Record<string, unknown>> = (
	store: Store<T>,
) => PluginHandle<T>;

type ListenerMap<T extends Record<string, unknown>> = {
	beforePut: Set<StoreOnBeforePut<T>>;
	beforePatch: Set<StoreOnBeforePatch<T>>;
	beforeDel: Set<StoreOnBeforeDelete>;
	put: Set<StoreOnPut<T>>;
	patch: Set<StoreOnPatch<T>>;
	del: Set<StoreOnDelete>;
};

type Store<T extends Record<string, unknown>> = {
	get: (key: string) => T | null;
	has: (key: string) => boolean;
	readonly size: number;
	values: () => IterableIterator<T>;
	entries: () => IterableIterator<readonly [string, T]>;
	snapshot: () => EncodedDocument[];
	put: (key: string, value: T) => void;
	patch: (key: string, value: DeepPartial<T>) => void;
	del: (key: string) => void;
	begin: () => StoreTransaction<T>;
	use: (plugin: Plugin<T>) => Store<T>;
	init: () => Promise<Store<T>>;
	dispose: () => Promise<void>;
};

const create = <T extends Record<string, unknown>>({
	hooks,
}: StoreOptions<T> = {}): Store<T> => {
	const clock = createClock();
	const encodeValue = (key: string, value: T) =>
		encode(key, value, clock.now());

	const kv = $map.create();

	// Plugin management
	const listeners: ListenerMap<T> = {
		beforePut: new Set(),
		beforePatch: new Set(),
		beforeDel: new Set(),
		put: new Set(),
		patch: new Set(),
		del: new Set(),
	};
	const initializers = new Set<PluginHandle<T>["init"]>();
	const disposers = new Set<PluginHandle<T>["dispose"]>();

	const decodeActive = (doc: EncodedDocument | null): T | null => {
		if (!doc || doc.__deletedAt) return null;
		return decode<T>(doc).__data;
	};

	const store: Store<T> = {
		get(key: string) {
			return decodeActive(kv.get(key));
		},
		has(key: string) {
			return decodeActive(kv.get(key)) !== null;
		},
		values() {
			function* iterator() {
				for (const doc of kv.values()) {
					const data = decodeActive(doc);
					if (data) yield data;
				}
			}

			return iterator();
		},
		entries() {
			function* iterator() {
				for (const [key, doc] of kv.entries()) {
					const data = decodeActive(doc);
					if (data) yield [key, data] as const;
				}
			}

			return iterator();
		},
		snapshot() {
			return Array.from(kv.values());
		},
		get size() {
			let count = 0;
			for (const doc of kv.values()) {
				if (doc && !doc.__deletedAt) count++;
			}
			return count;
		},
		put(key: string, value: T) {
			const tx = this.begin();
			tx.put(key, value);
			tx.commit();
		},
		patch(key: string, value: DeepPartial<T>) {
			const tx = this.begin();
			tx.patch(key, value);
			tx.commit();
		},
		del(key: string) {
			const tx = this.begin();
			tx.del(key);
			tx.commit();
		},
		begin() {
			const tx = kv.begin();
			// For puts, we have the value directly
			const putKeyValues: Array<readonly [string, T]> = [];
			// For patches, capture the merged value at patch time
			const patchKeyValues: Array<readonly [string, T]> = [];
			// For deletes, track the keys
			const deleteKeys: Array<string> = [];
			// Track the current state through the transaction (put or patched values)
			const txState = new Map<string, T>();

			return {
				put(key: string, value: T) {
					hooks?.onBeforePut?.(key, value);
					for (const fn of listeners.beforePut) {
						fn(key, value);
					}
					tx.put(key, encodeValue(key, value));
					txState.set(key, value);
					putKeyValues.push([key, value] as const);
				},
				patch(key: string, value: DeepPartial<T>) {
					hooks?.onBeforePatch?.(key, value);
					for (const fn of listeners.beforePatch) {
						fn(key, value);
					}
					tx.patch(key, encode(key, value as T, clock.now()));
					// Get the base value: either from txState (if put/patched in this tx) or from kv
					let baseValue: T | null;
					if (txState.has(key)) {
						baseValue = txState.get(key) ?? null;
					} else {
						baseValue = decodeActive(kv.get(key));
					}

					if (baseValue) {
						// Merge the partial update into the base value
						const merged = { ...baseValue, ...value };
						txState.set(key, merged);
						patchKeyValues.push([key, merged as T] as const);
					}
				},
				del(key: string) {
					hooks?.onBeforeDelete?.(key);
					for (const fn of listeners.beforeDel) {
						fn(key);
					}
					const current = txState.get(key) ?? kv.get(key);
					if (!current) return;

					tx.del(key, clock.now());
					deleteKeys.push(key);
				},
				commit(opts: { silent: boolean } = { silent: false }) {
					tx.commit();

					if (opts.silent) return;

					// Emit original hooks first if provided
					if (putKeyValues.length > 0 && hooks?.onPut) {
						hooks.onPut(Object.freeze([...putKeyValues]));
					}
					if (patchKeyValues.length > 0 && hooks?.onPatch) {
						hooks.onPatch(Object.freeze([...patchKeyValues]));
					}
					if (deleteKeys.length > 0 && hooks?.onDelete) {
						hooks.onDelete(Object.freeze([...deleteKeys]));
					}

					// Emit plugin hooks
					if (putKeyValues.length > 0) {
						for (const fn of listeners.put) {
							fn(Object.freeze([...putKeyValues]));
						}
					}
					if (patchKeyValues.length > 0) {
						for (const fn of listeners.patch) {
							fn(Object.freeze([...patchKeyValues]));
						}
					}
					if (deleteKeys.length > 0) {
						for (const fn of listeners.del) {
							fn(Object.freeze([...deleteKeys]));
						}
					}
				},
				rollback() {
					tx.rollback();
				},
			};
		},
		use(plugin: Plugin<T>) {
			const { hooks: pluginHooks, init, dispose } = plugin(this);

			if (pluginHooks) {
				if (pluginHooks.onBeforePut) {
					const callback = pluginHooks.onBeforePut;
					listeners.beforePut.add(callback);
					disposers.add(() => {
						listeners.beforePut.delete(callback);
					});
				}
				if (pluginHooks.onBeforePatch) {
					const callback = pluginHooks.onBeforePatch;
					listeners.beforePatch.add(callback);
					disposers.add(() => {
						listeners.beforePatch.delete(callback);
					});
				}
				if (pluginHooks.onBeforeDelete) {
					const callback = pluginHooks.onBeforeDelete;
					listeners.beforeDel.add(callback);
					disposers.add(() => {
						listeners.beforeDel.delete(callback);
					});
				}
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

			initializers.add(init);
			disposers.add(dispose);

			return this;
		},
		async init() {
			for (const fn of initializers) {
				// Await sequentially to honor the order plugins are registered (FIFO)
				await fn();
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
	Store,
	StoreHooks,
	StoreOnBeforeDelete,
	StoreOnBeforePatch,
	StoreOnBeforePut,
	StoreOnDelete,
	StoreOnPatch,
	StoreOnPut,
	StoreOptions,
	StoreTransaction,
	Plugin,
	PluginHandle,
};
export { create };
