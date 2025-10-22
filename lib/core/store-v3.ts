import mitt from "mitt";
import { decode, encode, encodeMany, mergeArray } from "./operations";
import type { DeepPartial, EncodedObject, EventstampFn } from "./types";
import { mapToArray, mergeItems } from "./utils";

type StoreEvents<TValue> = {
	put: { key: string; value: TValue }[];
	update: { key: string; value: TValue }[];
	delete: { key: string }[];
};

const createStore = <TValue extends object>(config: {
	eventstampFn: EventstampFn;
}) => {
	const map = new Map<string, EncodedObject>();
	const emitter = mitt<StoreEvents<TValue>>();

	return {
		put(key: string, value: TValue) {
			this.putMany([{ key, value }]);
		},

		update(key: string, value: DeepPartial<TValue>) {
			this.updateMany([{ key, value }]);
		},

		delete(key: string) {
			this.deleteMany([key]);
		},

		putMany(data: { key: string; value: TValue }[]) {
			encodeMany(data, config.eventstampFn).forEach(({ key, value }) => {
				map.set(key, value);
			});

			emitter.emit("put", data);
		},

		updateMany(data: { key: string; value: DeepPartial<TValue> }[]) {
			const updateKeys = new Set(data.map((d) => d.key));

			// Filter to only include keys that exist
			const validData = data.filter((d) => map.has(d.key));

			if (validData.length === 0) return;

			// Get current values as array
			const current = mapToArray(map).filter(({ key }) => updateKeys.has(key));

			// Encode updates to be mergable
			const updates = validData.map(({ key, value }) => ({
				key,
				value: encode(value, config.eventstampFn()),
			}));

			// Merge updates
			const [merged, changed] = mergeArray(current, updates);

			if (!changed) return;

			// Decode the final result for validation
			const final = merged.map(({ key, value }) => ({
				key,
				value: decode<TValue>(value),
			}));

			// Update the store
			merged.forEach(({ key, value }) => {
				map.set(key, value);
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

			merged.forEach(({ key, value }) => {
				map.set(key, value);
			});

			emitter.emit(
				"delete",
				merged.map(({ key }) => ({ key })),
			);
		},

		values(): Record<string, TValue> {
			return Object.fromEntries(
				map
					.entries()
					.filter(([_, value]) => !value.__deleted)
					.map(([key, value]) => [key, decode(value)]),
			);
		},

		snapshot(): { key: string; value: EncodedObject }[] {
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
