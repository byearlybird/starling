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
 * Called before a put operation is applied.
 * Throws to reject the operation.
 */
type StoreOnBeforePut<T> = (key: string, value: T) => void;

/**
 * Called before a patch operation is applied.
 * Throws to reject the operation.
 */
type StoreOnBeforePatch<T> = (key: string, value: DeepPartial<T>) => void;

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
type StoreHooks<T> = {
	onBeforePut?: StoreOnBeforePut<T>;
	onBeforePatch?: StoreOnBeforePatch<T>;
	onBeforeDelete?: StoreOnBeforeDelete;
	onPut?: StoreOnPut<T>;
	onPatch?: StoreOnPatch<T>;
	onDelete?: StoreOnDelete;
};

type StoreTransaction<T> = {
        put: (value: T | (T & { "~id": string })) => string;
	patch: (key: string, value: DeepPartial<T>) => void;
	merge: (doc: EncodedDocument) => void;
	del: (key: string) => void;
	has: (key: string) => boolean;
	commit: (opts?: { silent: boolean }) => void;
	rollback: () => void;
};

type PluginMethods = Record<string, (...args: any[]) => any>;

type PluginHandle<T, M extends PluginMethods = {}> = {
	init: () => Promise<void> | void;
	dispose: () => Promise<void> | void;
	hooks?: StoreHooks<T>;
	methods?: M;
};

type Plugin<T, M extends PluginMethods = {}> = (
	store: Store<T, any>,
) => PluginHandle<T, M>;

type ListenerMap<T> = {
	beforePut: Set<StoreOnBeforePut<T>>;
	beforePatch: Set<StoreOnBeforePatch<T>>;
	beforeDel: Set<StoreOnBeforeDelete>;
	put: Set<StoreOnPut<T>>;
	patch: Set<StoreOnPatch<T>>;
	del: Set<StoreOnDelete>;
};

type Store<T, Extended = {}> = {
	get: (key: string) => T | null;
	has: (key: string) => boolean;
	readonly size: number;
	values: () => IterableIterator<T>;
	entries: () => IterableIterator<readonly [string, T]>;
	snapshot: () => EncodedDocument[];
        put: (value: T | (T & { "~id": string })) => string;
	patch: (key: string, value: DeepPartial<T>) => void;
	del: (key: string) => void;
	begin: () => StoreTransaction<T>;
	use: <M extends PluginMethods>(
		plugin: Plugin<T, M>,
	) => Store<T, Extended & M>;
	init: () => Promise<Store<T, Extended>>;
	dispose: () => Promise<void>;
} & Extended;

const create = <T>(config: { getId?: () => string } = {}): Store<T, {}> => {
        const kv = KV.create();
        const clock = Clock.create();
        const getId = config.getId ?? (() => {
                if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
                        return crypto.randomUUID();
                }

                return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        });
        const encodeValue = (key: string, value: T) =>
                encode(key, value, clock.now());

        const resolvePutInput = (
                input: T | (T & { "~id": string }),
        ): { key: string; value: T } => {
                if (
                        typeof input === "object" &&
                        input !== null &&
                        "~id" in (input as Record<string, unknown>) &&
                        typeof (input as Record<string, unknown>)["~id"] === "string"
                ) {
                        const { ["~id"]: key, ...rest } = input as T & { "~id": string };
                        return { key, value: rest as unknown as T };
                }

                return { key: getId(), value: input as T };
        };

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
		if (!doc || doc["~deletedAt"]) return null;
		return decode<T>(doc)["~data"];
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
					if (data !== null) yield data;
				}
			}

			return iterator();
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
		get size() {
			let count = 0;
			for (const doc of kv.values()) {
				if (doc && !doc["~deletedAt"]) count++;
			}
			return count;
		},
                put(value: T | (T & { "~id": string })) {
                        const tx = this.begin();
                        const key = tx.put(value);
                        tx.commit();
                        return key;
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

                        return {
                                put(value: T | (T & { "~id": string })) {
                                        const { key, value: payload } = resolvePutInput(value);
                                        for (const fn of listeners.beforePut) {
                                                fn(key, payload);
                                        }
                                        tx.put(key, encodeValue(key, payload));
                                        putKeyValues.push([key, payload] as const);
                                        return key;
                                },
				patch(key: string, value: DeepPartial<T>) {
					for (const fn of listeners.beforePatch) {
						fn(key, value);
					}
					tx.patch(key, encode(key, value as T, clock.now()));
					const merged = decodeActive(tx.get(key));
					if (merged) {
						patchKeyValues.push([key, merged] as const);
					}
				},
				merge(doc: EncodedDocument) {
					if (tx.has(doc["~id"])) {
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
					for (const fn of listeners.beforeDel) {
						fn(key);
					}
					const currentDoc = tx.get(key);
					if (!currentDoc) return;

					tx.del(key, clock.now());
					deleteKeys.push(key);
				},
				has(key: string) {
					return tx.has(key);
				},
				commit(opts = { silent: false }) {
					tx.commit();

					if (opts.silent) return;

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
		use<M extends PluginMethods>(plugin: Plugin<T, M>): Store<T, M> {
			const {
				hooks: pluginHooks,
				init,
				dispose,
				methods,
			} = plugin(this as any);

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
	Store as StarlingStore, // avoid namespace collision
	StoreHooks,
	StoreOnBeforeDelete,
	StoreOnBeforePatch,
	StoreOnBeforePut,
	StoreOnDelete,
	StoreOnPatch,
	StoreOnPut,
	StoreTransaction,
	Plugin,
	PluginHandle,
	PluginMethods,
};
export { create };
