import { createClock } from "@core/crdt/clock";
import { decode } from "@core/crdt/operations";
import type {
	ArrayKV,
	DeepPartial,
	EncodedObject,
	StoreEvents,
} from "@core/shared/types";
import mitt from "mitt";
import {
	createDeleteMany,
	createMerge,
	createPutMany,
	createUpdateMany,
} from "./mutations";
import type { QueryInternal } from "./query";
import { createQuery } from "./query";

type PluginHandle = {
	init: () => Promise<void> | void;
	dispose: () => Promise<void> | void;
};

type Plugin<TValue extends object> = (store: Store<TValue>) => PluginHandle;

type Store<T extends object> = {
	collectionKey: string;
	putMany: (data: ArrayKV<T>) => void;
	updateMany: (data: ArrayKV<Partial<T>>) => void;
	deleteMany: (keys: string[]) => void;
	merge: (snapshot: ArrayKV<EncodedObject>, opts?: { silent: boolean }) => void;
	put: (key: string, value: T) => void;
	update: (key: string, value: DeepPartial<T>) => void;
	delete: (key: string) => void;
	values: () => Map<string, T>;
	query: (predicate: (data: T) => boolean) => {
		results: () => Map<string, T>;
		onChange: (callback: () => void) => () => void;
		dispose: () => void;
	};
	snapshot: () => Map<string, EncodedObject>;
	on: <K extends keyof StoreEvents<T>>(
		event: K,
		callback: (data: StoreEvents<T>[K]) => void,
	) => () => void;
	use: (plugin: Plugin<T>) => Store<T>;
	init: () => Promise<Store<T>>;
	dispose: () => Promise<void> | void;
};

const createStore = <T extends object>(collectionKey: string): Store<T> => {
	const $map = new Map<string, EncodedObject>();
	const $emitter = mitt<StoreEvents<T>>();
	const $clock = createClock();
	const $handles = new Set<PluginHandle>();
	const $queries = new Set<QueryInternal<T>>();

	$emitter.on("*", (event) => {
		if (event === "change") return;
		$emitter.emit("change");
	});

	const runCallbacks = (dirtyQueries: Set<QueryInternal<T>>) => {
		for (const query of dirtyQueries) {
			for (const callback of query.callbacks) {
				callback();
			}
		}

		dirtyQueries.clear();
	};

	$emitter.on("put", (data) => {
		const dirtyQueries = new Set<QueryInternal<T>>();

		for (const query of $queries) {
			for (const [key, value] of data) {
				if (query.predicate(value)) {
					query.results.set(key, value);
					dirtyQueries.add(query);
				}
			}
		}

		runCallbacks(dirtyQueries);
	});

	$emitter.on("delete", (data) => {
		const dirtyQueries = new Set<QueryInternal<T>>();

		for (const query of $queries) {
			for (const item of data) {
				if (query.results.has(item.key)) {
					query.results.delete(item.key);
					dirtyQueries.add(query);
				}
			}
		}

		runCallbacks(dirtyQueries);
	});

	$emitter.on("update", (data) => {
		const dirtyQueries = new Set<QueryInternal<T>>();

		for (const query of $queries) {
			for (const [key, value] of data) {
				const matches = query.predicate(value);
				const inResults = query.results.has(key);

				if (matches) {
					query.results.set(key, value);
					dirtyQueries.add(query);
				} else if (inResults) {
					query.results.delete(key);
					dirtyQueries.add(query);
				}
			}
		}

		runCallbacks(dirtyQueries);
	});

	const putMany = createPutMany($map, $clock, $emitter);
	const updateMany = createUpdateMany($map, $clock, $emitter);
	const deleteMany = createDeleteMany($map, $clock, $emitter);
	const merge = createMerge($map, $emitter);
	const query = createQuery($map, $queries);

	return {
		collectionKey,
		putMany,
		updateMany,
		deleteMany,
		merge,
		put(key: string, value: T) {
			this.putMany([{ key, value }]);
		},
		update(key: string, value: DeepPartial<T>) {
			this.updateMany([{ key, value }]);
		},
		delete(key: string) {
			this.deleteMany([key]);
		},
		values(): Map<string, T> {
			const result = new Map<string, T>();
			for (const [key, value] of $map) {
				if (!value.__deleted) {
					result.set(key, decode(value));
				}
			}
			return result;
		},
		query,
		snapshot(): Map<string, EncodedObject> {
			const result = new Map<string, EncodedObject>();
			for (const [key, value] of $map) {
				result.set(key, value);
			}
			return result;
		},
		on<K extends keyof StoreEvents<T>>(
			event: K,
			callback: (data: StoreEvents<T>[K]) => void,
		) {
			$emitter.on(event, callback);
			return () => {
				$emitter.off(event, callback);
			};
		},
		use(plugin: Plugin<T>) {
			$handles.add(plugin(this));
			return this;
		},
		async init(): Promise<Store<T>> {
			for (const handle of $handles) {
				// Run these sequentially to respect the order that they're registered in
				await handle.init();
			}
			return this;
		},
		async dispose() {
			$handles.forEach(async (handle) => {
				// Run these sequentially to respect the order that they're registered in
				await handle.dispose();
			});
			$emitter.all.clear();
		},
	};
};

export { createStore };
export type { StoreEvents, Store, Plugin };
