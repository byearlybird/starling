import mitt from "mitt";
import { decode, encode, encodeMany, merge, mergeArray } from "./operations";
import type {
	ArrayKV,
	DeepPartial,
	EncodedObject,
	EventstampFn,
} from "./types";
import { mapToArray, mergeItems } from "./utils";

type StoreEvents<TValue> = {
	put: ArrayKV<TValue>;
	update: ArrayKV<TValue>;
	delete: { key: string }[];
	change: undefined;
};

const createStore = <TValue extends object>(
	collectionKey: string,
	config: {
		eventstampFn: EventstampFn;
	},
) => {
	const map = new Map<string, EncodedObject>();
	const emitter = mitt<StoreEvents<TValue>>();

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
			encodeMany(data, config.eventstampFn).forEach(({ key, value }) => {
				map.set(key, value);
			});

			emitter.emit("put", data);
		},

		updateMany(data: ArrayKV<DeepPartial<TValue>>) {
			// Filter to only include keys that exist
			const validData = data.filter((d) => map.has(d.key));

			if (validData.length === 0) return;

			// Get current values directly from map (O(k) instead of O(n))
			const current: ArrayKV<EncodedObject> = [];
			for (const { key } of validData) {
				const value = map.get(key);
				if (value !== undefined) {
					current.push({ key, value });
				}
			}

			// Encode updates to be mergable
			const updates = validData.map(({ key, value }) => ({
				key,
				value: encode(value, config.eventstampFn()),
			}));

			// Merge updates
			const [merged, changed] = mergeArray(current, updates);

			if (!changed) return;

			// Update the store and collect decoded results in single pass
			const final: ArrayKV<TValue> = [];
			merged.forEach(({ key, value }) => {
				map.set(key, value);
				final.push({ key, value: decode<TValue>(value) });
			});

			emitter.emit("update", final);
		},

		deleteMany(keys: string[]) {
			// Filter to only include keys that exist
			const validKeys = keys.filter((key) => map.has(key));

			if (validKeys.length === 0) return;

			const deletionMarkers = encodeMany(
				validKeys.map((key) => ({ key, value: { __deleted: true } as TValue })),
				config.eventstampFn,
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

		merge(snapshot: ArrayKV<EncodedObject>) {
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

			// Emit events
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

		dispose() {
			emitter.all.clear();
		},
	};
};

type Store<T extends object> = ReturnType<typeof createStore<T>>;

export { createStore };
export type { StoreEvents, Store };
