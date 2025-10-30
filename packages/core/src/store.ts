/** biome-ignore-all lint/complexity/noBannedTypes: <{} used to default to empty> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <useful to preserve inference> */
import { createClock } from "./clock";
import type { EncodedDocument } from "./document";
import { decodeDoc, encodeDoc } from "./document";
import { createKV } from "./kv";
import type {
	DeepPartial,
	StorePutOptions,
	StoreSetTransaction,
} from "./transaction";
import { createTransaction } from "./transaction";

/**
 * Type constraint to prevent Promise returns from set callbacks.
 * Transactions must be synchronous operations.
 */
type NotPromise<T> = T extends Promise<any> ? never : T;

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
	docs: EncodedDocument[];
	latestEventstamp: string;
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
	latestEventstamp: () => string;
	forwardClock: (eventstamp: string) => void;
} & Extended;

export const createStore = <T>(
	config: { getId?: () => string } = {},
): Store<T, {}> => {
	const kv = createKV();
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
			return {
				docs: Array.from(kv.values()),
				latestEventstamp: clock.latest(),
			};
		},
		merge(snapshot: StoreSnapshot) {
			clock.forward(snapshot.latestEventstamp);
			this.begin((tx) => {
				for (const doc of snapshot.docs) {
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
			let result: R | undefined;
			let shouldNotify = false;

			kv.begin((kvTx) => {
				const tx = createTransaction(
					kvTx,
					clock,
					getId,
					encodeValue,
					decodeActive,
					putKeyValues,
					patchKeyValues,
					deleteKeys,
				);

				result = callback(tx);

				if (!tx.rolledBack && !silent) {
					shouldNotify = true;
				}
			});

			// Call hooks AFTER the transaction commits to kv
			if (shouldNotify) {
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

			if (pluginHooks.onAdd || pluginHooks.onUpdate || pluginHooks.onDelete) {
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
		latestEventstamp() {
			return clock.latest();
		},
		forwardClock(eventstamp: string) {
			clock.forward(eventstamp);
		},
	};

	return store;
};
