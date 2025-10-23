import mitt from "mitt";

import { createClock } from "./clock";
import {
	createDeleteMany,
	createMerge,
	createPutMany,
	createUpdateMany,
} from "./mutations";
import { decode } from "./operations";
import type { ArrayKV, DeepPartial, EncodedObject, StoreEvents } from "./types";
import { mapToArray } from "./utils";

type PluginHandle = {
	init: () => Promise<void> | void;
	dispose: () => Promise<void> | void;
};

type Plugin<TValue extends object> = (store: Store<TValue>) => PluginHandle;

const createStore = <TValue extends object>(collectionKey: string) => {
	const $map = new Map<string, EncodedObject>();
	const $emitter = mitt<StoreEvents<TValue>>();
	const $clock = createClock();
	const $handles = new Set<PluginHandle>();

	$emitter.on("*", (event) => {
		if (event === "change") return;
		$emitter.emit("change");
	});

	const putMany = createPutMany($map, $clock, $emitter);
	const updateMany = createUpdateMany($map, $clock, $emitter);
	const deleteMany = createDeleteMany($map, $clock, $emitter);
	const merge = createMerge($map, $emitter);

	return {
		collectionKey,
		putMany,
		updateMany,
		deleteMany,
		merge,
		put(key: string, value: TValue) {
			this.putMany([{ key, value }]);
		},
		update(key: string, value: DeepPartial<TValue>) {
			this.updateMany([{ key, value }]);
		},
		delete(key: string) {
			this.deleteMany([key]);
		},
		values(): ArrayKV<TValue> {
			const result: ArrayKV<TValue> = [];
			for (const [key, value] of $map) {
				if (!value.__deleted) {
					result.push({ key, value: decode(value) });
				}
			}
			return result;
		},
		snapshot(): ArrayKV<EncodedObject> {
			return mapToArray($map);
		},
		on<K extends keyof StoreEvents<TValue>>(
			event: K,
			callback: (data: StoreEvents<TValue>[K]) => void,
		) {
			$emitter.on(event, callback);
			return () => {
				$emitter.off(event, callback);
			};
		},
		use(plugin: Plugin<TValue>) {
			$handles.add(plugin(this));
			return this;
		},
		async init() {
			for (const handle of $handles) {
				// Run these sequentially to respect the order that they're registered in
				await handle.init();
			}
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
