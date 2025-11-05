/** biome-ignore-all lint/complexity/noBannedTypes: <{} used to default to empty> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <useful to preserve inference> */
import { createClock } from "./clock";
import type { EncodedDocument } from "./document";
import { decodeDoc, deleteDoc, encodeDoc, mergeDocs } from "./document";

/**
 * Type constraint to prevent Promise returns from set callbacks.
 * Transactions must be synchronous operations.
 */
type NotPromise<T> = T extends Promise<any> ? never : T;

// Internal transaction types
type DeepPartial<T> = T extends object
	? { [P in keyof T]?: DeepPartial<T[P]> }
	: T;

type StorePutOptions = { withId?: string };

type StoreSetTransaction<T> = {
	add: (value: T, options?: StorePutOptions) => string;
	update: (key: string, value: DeepPartial<T>) => void;
	merge: (doc: EncodedDocument) => void;
	del: (key: string) => void;
	get: (key: string) => T | null;
	rollback: () => void;
};

/**
 * Plugin lifecycle and event hooks.
 * All hooks are optional except onInit and onDispose, which are required.
 */
export type PluginHooks<T> = {
	onInit: (store: Store<T>) => Promise<void> | void;
	onDispose: () => Promise<void> | void;
	onAdd?: (entries: ReadonlyArray<readonly [string, T]>) => void;
	onUpdate?: (entries: ReadonlyArray<readonly [string, T]>) => void;
	onDelete?: (keys: ReadonlyArray<string>) => void;
};
export type PluginMethods = Record<string, (...args: any[]) => any>;

export type Plugin<T, M extends PluginMethods = {}> = {
	hooks: PluginHooks<T>;
	methods?: M;
};

/**
 * Complete persistent state of a store.
 * Contains all encoded documents (including deleted ones with ~deletedAt metadata)
 * and the latest eventstamp for clock synchronization during merges.
 */
export type StoreSnapshot = {
	"~docs": EncodedDocument[];
	"~eventstamp": string;
};

export type Store<T, Extended = {}> = {
	get: (key: string) => T | null;
	begin: <R = void>(
		callback: (tx: StoreSetTransaction<T>) => NotPromise<R>,
		opts?: { silent?: boolean },
	) => NotPromise<R>;
	add: (value: T, options?: StorePutOptions) => string;
	update: (key: string, value: DeepPartial<T>) => void;
	del: (key: string) => void;
	entries: () => IterableIterator<readonly [string, T]>;
	snapshot: () => StoreSnapshot;
	merge: (snapshot: StoreSnapshot) => void;
	use: <M extends PluginMethods>(
		plugin: Plugin<T, M>,
	) => Store<T, Extended & M>;
	init: () => Promise<Store<T, Extended>>;
	dispose: () => Promise<void>;
} & Extended;

export function createStore<T>(
	config: { getId?: () => string } = {},
): Store<T, {}> {
	let readMap = new Map<string, EncodedDocument>(); // published state
	const clock = createClock();
	const getId = config.getId ?? (() => crypto.randomUUID());

	const encodeValue = (key: string, value: T) =>
		encodeDoc(key, value, clock.now());

	const decodeActive = (doc: EncodedDocument | null): T | null => {
		if (!doc || doc["~deletedAt"]) return null;
		return decodeDoc<T>(doc)["~data"];
	};

	// Hook handlers
	const onInitHandlers = new Set<PluginHooks<T>["onInit"]>();
	const onDisposeHandlers = new Set<PluginHooks<T>["onDispose"]>();
	const onAddHandlers = new Set<
		(entries: ReadonlyArray<readonly [string, T]>) => void
	>();
	const onUpdateHandlers = new Set<
		(entries: ReadonlyArray<readonly [string, T]>) => void
	>();
	const onDeleteHandlers = new Set<(keys: ReadonlyArray<string>) => void>();

	const store: Store<T> = {
		get(key: string) {
			return decodeActive(readMap.get(key) ?? null);
		},
		entries() {
			function* iterator() {
				for (const [key, doc] of readMap.entries()) {
					const data = decodeActive(doc);
					if (data !== null) yield [key, data] as const;
				}
			}

			return iterator();
		},
		snapshot() {
			return {
				"~docs": Array.from(readMap.values()),
				"~eventstamp": clock.latest(),
			};
		},
		merge(snapshot: StoreSnapshot) {
			clock.forward(snapshot["~eventstamp"]);
			this.begin((tx) => {
				for (const doc of snapshot["~docs"]) {
					tx.merge(doc);
				}
			});
		},
		begin<R = void>(
			callback: (tx: StoreSetTransaction<T>) => NotPromise<R>,
			opts?: { silent?: boolean },
		): NotPromise<R> {
			const silent = opts?.silent ?? false;
			const putKeyValues: Array<readonly [string, T]> = [];
			const patchKeyValues: Array<readonly [string, T]> = [];
			const deleteKeys: Array<string> = [];

			const staging = new Map(readMap);
			let rolledBack = false;

			const tx: StoreSetTransaction<T> = {
				add(value: T, options?: StorePutOptions) {
					const key = options?.withId ?? getId();
					staging.set(key, encodeValue(key, value));
					putKeyValues.push([key, value] as const);
					return key;
				},
				update(key: string, value: DeepPartial<T>) {
					const doc = encodeDoc(key, value as T, clock.now());
					const prev = staging.get(key);
					const mergedDoc = prev ? mergeDocs(prev, doc)[0] : doc;
					staging.set(key, mergedDoc);
					const merged = decodeActive(mergedDoc);
					if (merged) {
						patchKeyValues.push([key, merged] as const);
					}
				},
				merge(doc: EncodedDocument) {
					const existing = staging.get(doc["~id"]);
					const mergedDoc = existing ? mergeDocs(existing, doc)[0] : doc;
					staging.set(doc["~id"], mergedDoc);

					if (mergedDoc["~deletedAt"]) {
						deleteKeys.push(doc["~id"]);
					} else {
						const merged = decodeDoc<T>(mergedDoc)["~data"];
						patchKeyValues.push([doc["~id"], merged] as const);
					}
				},
				del(key: string) {
					const currentDoc = staging.get(key);
					if (!currentDoc) return;

					staging.set(key, deleteDoc(currentDoc, clock.now()));
					deleteKeys.push(key);
				},
				get(key: string) {
					return decodeActive(staging.get(key) ?? null);
				},
				rollback() {
					rolledBack = true;
				},
			};

			const result = callback(tx);

			// Auto-commit unless rollback was explicitly called
			if (!rolledBack) {
				readMap = staging; // single atomic swap
			}
			// If callback throws, staging is implicitly discarded (auto-rollback)

			// Call hooks AFTER the transaction commits
			if (!rolledBack && !silent) {
				if (putKeyValues.length > 0) {
					onAddHandlers.forEach((fn) => {
						fn(putKeyValues);
					});
				}
				if (patchKeyValues.length > 0) {
					onUpdateHandlers.forEach((fn) => {
						fn(patchKeyValues);
					});
				}
				if (deleteKeys.length > 0) {
					onDeleteHandlers.forEach((fn) => {
						fn(deleteKeys);
					});
				}
			}

			return result as NotPromise<R>;
		},
		add(this: Store<T>, value: T, options?: StorePutOptions): string {
			return this.begin((tx) => tx.add(value, options));
		},
		update(this: Store<T>, key: string, value: DeepPartial<T>) {
			return this.begin((tx) => tx.update(key, value));
		},
		del(this: Store<T>, key: string) {
			return this.begin((tx) => tx.del(key));
		},
		use<M extends PluginMethods>(plugin: Plugin<T, M>): Store<T, M> {
			const { hooks: pluginHooks, methods } = plugin;

			// Register mutation hooks
			if (pluginHooks.onAdd) {
				const onAdd = pluginHooks.onAdd;
				onAddHandlers.add(onAdd);
				onDisposeHandlers.add(() => {
					onAddHandlers.delete(onAdd);
				});
			}
			if (pluginHooks.onUpdate) {
				const onUpdate = pluginHooks.onUpdate;
				onUpdateHandlers.add(onUpdate);
				onDisposeHandlers.add(() => {
					onUpdateHandlers.delete(onUpdate);
				});
			}
			if (pluginHooks.onDelete) {
				const onDelete = pluginHooks.onDelete;
				onDeleteHandlers.add(onDelete);
				onDisposeHandlers.add(() => {
					onDeleteHandlers.delete(onDelete);
				});
			}

			// Inject plugin methods directly into store
			if (methods) {
				Object.assign(this, methods);
			}

			onInitHandlers.add(pluginHooks.onInit);
			onDisposeHandlers.add(pluginHooks.onDispose);

			return this as Store<T, M>;
		},
		async init() {
			for (const fn of onInitHandlers) {
				// Await sequentially to honor the order plugins are registered (FIFO)
				await fn(this);
			}

			return this;
		},
		async dispose() {
			const disposerArray = Array.from(onDisposeHandlers);
			disposerArray.reverse();
			for (const fn of disposerArray) {
				await fn();
			}
		},
	};

	return store;
}
