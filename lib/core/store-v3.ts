import mitt from "mitt";
import { KeyNotFoundError } from "./errors";
import { decode, decodeMany, encodeMany } from "./operations";
import { mergeItems } from "./store-utils";
import type {
	DeepPartial,
	EncodedObject,
	EncodedRecord,
	EventstampFn,
} from "./types";

type Events<TValue> = {
	put: { key: string; value: TValue }[];
	update: { key: string; value: TValue }[];
	delete: { key: string }[];
};

const createStore = <TValue extends object>(config: {
	eventstampFn: EventstampFn;
}) => {
	const map = new Map<string, EncodedObject>();
	const emitter = mitt<Events<TValue>>();

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
			const missingKeys = data
				.filter(({ key }) => !map.has(key))
				.map(({ key }) => key);

			if (missingKeys.length > 0) {
				throw new KeyNotFoundError(missingKeys);
			}

			const encoded = encodeMany(data, config.eventstampFn);
			const merged = mergeItems(map, encoded);

			if (merged.length === 0) return;

			merged.forEach(({ key, value }) => {
				map.set(key, value);
			});

			const updatedData = decodeMany<TValue>(merged);

			emitter.emit("update", updatedData);
		},
		deleteMany(keys: string[]) {
			const missing = keys.filter((key) => !map.has(key));

			if (missing.length > 0) {
				throw new KeyNotFoundError(missing);
			}

			const deletionMarkers = encodeMany(
				keys.map((key) => ({ key, value: { __deleted: true } as TValue })),
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

		snapshot(): EncodedRecord {
			return Object.fromEntries(map);
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
