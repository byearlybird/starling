import mitt from "mitt";
import { createClock } from "../crdt/clock";
import { decode } from "../crdt/operations";
import type {
	ArrayKV,
	DeepPartial,
	EncodedObject,
	StoreEvents,
} from "../shared/types";
import { mapToArray } from "../shared/utils";
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

const createStore = <T extends object>(collectionKey: string) => {
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
			for (const item of data) {
				if (query.predicate(item.value)) {
					query.results.set(item.key, item.value);
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
			for (const item of data) {
				const matches = query.predicate(item.value);
				const inResults = query.results.has(item.key);

				if (matches) {
					query.results.set(item.key, item.value);
					dirtyQueries.add(query);
				} else if (inResults) {
					query.results.delete(item.key);
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
		values(): ArrayKV<T> {
			const result: ArrayKV<T> = [];
			for (const [key, value] of $map) {
				if (!value.__deleted) {
					result.push({ key, value: decode(value) });
				}
			}
			return result;
		},
		query,
		snapshot(): ArrayKV<EncodedObject> {
			return mapToArray($map);
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
		async init() {
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

type Store<T extends object> = ReturnType<typeof createStore<T>>;

export { createStore };
export type { StoreEvents, Store, Plugin };
