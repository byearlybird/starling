import mitt from "mitt";
import { decode, encode, encodeMany, mergeArray } from "./operations";
import type { DeepPartial, EncodedObject, EventstampFn } from "./types";

type Events<TValue> = {
	put: { key: string; value: TValue }[];
	update: { key: string; value: TValue }[];
	delete: { key: string }[];
};

const createStore = <TValue extends object>(config: {
	eventstampFn: EventstampFn;
}) => {
	const state: { key: string; value: EncodedObject }[] = [];
	const emitter = mitt<Events<TValue>>();

	const findIndex = (key: string) => state.findIndex((item) => item.key === key);
	const findItem = (key: string) => state.find((item) => item.key === key);

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
				const idx = findIndex(key);
				if (idx >= 0) {
					state[idx] = { key, value };
				} else {
					state.push({ key, value });
				}
			});

			emitter.emit("put", data);
		},
		updateMany(data: { key: string; value: DeepPartial<TValue> }[]) {
			const updateKeys = new Set(data.map((d) => d.key));

			// Get current values for keys that exist
			const current = state
				.filter(({ key }) => updateKeys.has(key))
				.map(({ key, value }) => ({ key, value }));

			// Only process if we have matching keys (graceful no-op if none match)
			if (current.length === 0) return;

			// Encode updates to be mergable
			const updates = data.map(({ key, value }) => ({
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

			// Update the state array
			merged.forEach(({ key, value }) => {
				const idx = findIndex(key);
				if (idx >= 0) {
					state[idx] = { key, value };
				}
			});

			emitter.emit("update", final);
		},
		deleteMany(keys: string[]) {
			// Filter to only existing keys (graceful no-op for missing)
			const keysToDelete = keys.filter((key) => findItem(key) !== undefined);

			if (keysToDelete.length === 0) return;

			const deletionMarkers = encodeMany(
				keysToDelete.map((key) => ({ key, value: { __deleted: true } as TValue })),
				config.eventstampFn,
			);

			// Merge deletions with current state items
			const merged: { key: string; value: EncodedObject }[] = [];
			deletionMarkers.forEach(({ key, value: deletionValue }) => {
				const current = findItem(key);
				if (current) {
					const [mergedValue] = mergeArray([current], [{ key, value: deletionValue }]);
					merged.push(...mergedValue);
				}
			});

			if (merged.length === 0) return;

			merged.forEach(({ key, value }) => {
				const idx = findIndex(key);
				if (idx >= 0) {
					state[idx] = { key, value };
				}
			});

			emitter.emit(
				"delete",
				merged.map(({ key }) => ({ key })),
			);
		},

		values(): Record<string, TValue> {
			return Object.fromEntries(
				state
					.filter(({ value }) => !value.__deleted)
					.map(({ key, value }) => [key, decode<TValue>(value)]),
			);
		},

		snapshot(): { key: string; value: EncodedObject }[] {
			return state.map(({ key, value }) => ({ key, value }));
		},

		on<K extends keyof Events<TValue>>(
			event: K,
			callback: (data: Events<TValue>[K]) => void,
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

export { createStore };
