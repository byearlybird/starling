import { decode, encode, encodeMany, merge } from "@core/crdt/operations";
import type { EncodedObject, StoreEvents } from "@core/shared/types";
import { mergeItems } from "@core/shared/utils";
import type { Emitter } from "mitt";

const createPutMany = <TValue extends object>(
	map: Map<string, EncodedObject>,
	clock: { now: () => string },
	emitter: Emitter<StoreEvents<TValue>>,
) => {
	return (data: [string, TValue][]) => {
		const eventData = new Map<string, TValue>();
		encodeMany(data, () => clock.now()).forEach(([key, value]) => {
			map.set(key, value);
			eventData.set(key, decode<TValue>(value));
		});

		emitter.emit("put", eventData);
	};
};

const createUpdateMany = <TValue extends object>(
	map: Map<string, EncodedObject>,
	clock: { now: () => string },
	emitter: Emitter<StoreEvents<TValue>>,
) => {
	return (data: [string, Partial<TValue>][]) => {
		// Filter to only include keys that exist
		const validData = data.filter(([key]) => map.has(key));

		if (validData.length === 0) return;

		// Single-pass merge: encode, merge, and collect changed items
		const updateEvents = new Map<string, TValue>();
		let anyChanged = false;

		for (const [key, value] of validData) {
			const current = map.get(key);
			if (!current) continue;

			// Encode and merge immediately
			const encoded = encode(value, clock.now());
			const [mergedValue, itemChanged] = merge(current, encoded);

			if (itemChanged) {
				map.set(key, mergedValue);
				updateEvents.set(key, decode<TValue>(mergedValue));
				anyChanged = true;
			}
		}

		if (!anyChanged) return;
		emitter.emit("update", updateEvents);
	};
};

const createDeleteMany = <TValue extends object>(
	map: Map<string, EncodedObject>,
	clock: { now: () => string },
	emitter: Emitter<StoreEvents<TValue>>,
) => {
	return (keys: string[]) => {
		// Filter to only include keys that exist
		const validKeys = keys.filter((key) => map.has(key));

		if (validKeys.length === 0) return;

		const deletionMarkers = encodeMany(
			validKeys.map((key) => [key, { __deleted: true } as TValue]),
			() => clock.now(),
		);
		const merged = mergeItems(map, deletionMarkers);

		if (merged.length === 0) return;

		// Update map and collect delete events in single pass
		const deleteEvents: { key: string }[] = [];
		merged.forEach(([key, value]) => {
			map.set(key, value);
			deleteEvents.push({ key });
		});

		emitter.emit("delete", deleteEvents);
	};
};

const createMerge = <TValue extends object>(
	map: Map<string, EncodedObject>,
	emitter: Emitter<StoreEvents<TValue>>,
) => {
	return (
		snapshot: [string, EncodedObject][],
		opts: { silent: boolean } = { silent: false },
	) => {
		const putEvents = new Map<string, TValue>();
		const updateEvents = new Map<string, TValue>();
		const deleteEvents: { key: string }[] = [];

		// Process new and updated items from snapshot - iterate directly without intermediate map
		for (const [key, snapshotValue] of snapshot) {
			const currentValue = map.get(key);

			if (!currentValue) {
				// New item - emit put event
				putEvents.set(key, decode<TValue>(snapshotValue));
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
						updateEvents.set(key, decode<TValue>(mergedValue));
					}
				}
			}
		}

		// Emit events if not silent
		if (opts.silent) return;

		if (putEvents.size > 0) {
			emitter.emit("put", putEvents);
		}
		if (updateEvents.size > 0) {
			emitter.emit("update", updateEvents);
		}
		if (deleteEvents.length > 0) {
			emitter.emit("delete", deleteEvents);
		}
	};
};

export { createPutMany, createUpdateMany, createDeleteMany, createMerge };
