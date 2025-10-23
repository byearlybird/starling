import mitt from "mitt";
import { createClock } from "./clock";
import { decode, encode, encodeMany, merge } from "./operations";
import type { ArrayKV, DeepPartial, EncodedObject } from "./types";
import { mapToArray, mergeItems } from "./utils";

type StoreEvents<TValue> = {
	put: ArrayKV<TValue>;
	update: ArrayKV<TValue>;
	delete: { key: string }[];
	change: undefined;
};

type PluginHandle = {
	init: () => Promise<void> | void;
	dispose: () => Promise<void> | void;
};

type Plugin = <TValue extends object>(store: Store<TValue>) => PluginHandle;

const createStore = <TValue extends object>(collectionKey: string) => {
	const map = new Map<string, EncodedObject>();
	const emitter = mitt<StoreEvents<TValue>>();
	const clock = createClock();
	const handles = new Set<PluginHandle>();

	emitter.on("*", (event) => {
		if (event === "change") return;
		emitter.emit("change");
	});

	return {
		collectionKey,

		put(key: string, value: TValue) {
			this.putMany([{ key, value }]);
		},

		update(key: string, value: DeepPartial<TValue>) {
			this.updateMany([{ key, value }]);
		},

		delete(key: string) {
			this.deleteMany([key]);
		},

		putMany(data: ArrayKV<TValue>) {
			encodeMany(data, () => clock.now()).forEach(({ key, value }) => {
				map.set(key, value);
			});

			emitter.emit("put", data);
		},

		updateMany(data: ArrayKV<DeepPartial<TValue>>) {
			// Filter to only include keys that exist
			const validData = data.filter((d) => map.has(d.key));

			if (validData.length === 0) return;

			// Single-pass merge: encode, merge, and collect changed items
			const updateEvents: ArrayKV<TValue> = [];
			let anyChanged = false;

			for (const { key, value } of validData) {
				const current = map.get(key);
				if (!current) continue;

				// Encode and merge immediately
				const encoded = encode(value, clock.now());
				const [mergedValue, itemChanged] = merge(current, encoded);

				if (itemChanged) {
					map.set(key, mergedValue);
					updateEvents.push({ key, value: decode<TValue>(mergedValue) });
					anyChanged = true;
				}
			}

			if (!anyChanged) return;
			emitter.emit("update", updateEvents);
		},

		deleteMany(keys: string[]) {
			// Filter to only include keys that exist
			const validKeys = keys.filter((key) => map.has(key));

			if (validKeys.length === 0) return;

			const deletionMarkers = encodeMany(
				validKeys.map((key) => ({ key, value: { __deleted: true } as TValue })),
				() => clock.now(),
			);
			const merged = mergeItems(map, deletionMarkers);

			if (merged.length === 0) return;

			// Update map and collect delete events in single pass
			const deleteEvents: { key: string }[] = [];
			merged.forEach(({ key, value }) => {
				map.set(key, value);
				deleteEvents.push({ key });
			});

			emitter.emit("delete", deleteEvents);
		},

		merge(
			snapshot: ArrayKV<EncodedObject>,
			opts: { silent: boolean } = { silent: false },
		) {
			const putEvents: ArrayKV<TValue> = [];
			const updateEvents: ArrayKV<TValue> = [];
			const deleteEvents: { key: string }[] = [];

			// Process new and updated items from snapshot - iterate directly without intermediate map
			for (const { key, value: snapshotValue } of snapshot) {
				const currentValue = map.get(key);

				if (!currentValue) {
					// New item - emit put event
					putEvents.push({ key, value: decode<TValue>(snapshotValue) });
					map.set(key, snapshotValue);
				} else {
					// Existing item - merge and check for changes
					const [mergedValue, changed] = merge(currentValue, snapshotValue);

					if (changed) {
						const wasDeleted = currentValue.__deleted !== undefined;
						const isDeleted = mergedValue.__deleted !== undefined;

						if (!wasDeleted && isDeleted) {
							// Item was deleted - emit delete event
							map.set(key, mergedValue);
							deleteEvents.push({ key });
						} else {
							// Item was updated - emit update event
							map.set(key, mergedValue);
							updateEvents.push({ key, value: decode<TValue>(mergedValue) });
						}
					}
				}
			}

			// Emit events if not silent
			if (opts.silent) return;

			if (putEvents.length > 0) {
				emitter.emit("put", putEvents);
			}
			if (updateEvents.length > 0) {
				emitter.emit("update", updateEvents);
			}
			if (deleteEvents.length > 0) {
				emitter.emit("delete", deleteEvents);
			}
		},

		values(): ArrayKV<TValue> {
			const result: ArrayKV<TValue> = [];
			for (const [key, value] of map) {
				if (!value.__deleted) {
					result.push({ key, value: decode(value) });
				}
			}
			return result;
		},

		snapshot(): ArrayKV<EncodedObject> {
			return mapToArray(map);
		},

		on<K extends keyof StoreEvents<TValue>>(
			event: K,
			callback: (data: StoreEvents<TValue>[K]) => void,
		) {
			emitter.on(event, callback);
			return () => {
				emitter.off(event, callback);
			};
		},

		use(plugin: Plugin) {
			const handle = plugin(this);
			handles.add(handle);
			return this;
		},

		async init() {
			for (const handle of handles) {
				// Run these sequentially to respect the order that they're registered in
				await handle.init();
			}
		},

		async dispose() {
			handles.forEach(async (handle) => {
				// Run these sequentially to respect the order that they're registered in
				await handle.dispose();
			});
			emitter.all.clear();
		},
	};
};

type Store<T extends object> = ReturnType<typeof createStore<T>>;

export { createStore };
export type { StoreEvents, Store, Plugin };
