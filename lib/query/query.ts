import mitt from "mitt";
import type { Store } from "../core/store";

type QueryEvents = {
	change: undefined;
};

const createQuery = <TValue extends object>(
	store: Store<TValue>,
	predicate: (data: TValue) => boolean,
) => {
	const matchingKeys = new Set<string>();
	const unwatchers = new Set<() => void>();
	const emitter = mitt<QueryEvents>();

	// Cache for decoded results
	let cachedResultsMap: Map<string, TValue> | null = null;

	// Init: only collect matching keys, don't decode yet
	store.values().forEach(({ key, value }) => {
		if (predicate(value)) {
			matchingKeys.add(key);
		}
	});

	// Register listeners
	const unwatchPut = store.on("put", (data) => {
		let changed = false;
		data.forEach((item) => {
			if (predicate(item.value)) {
				if (!matchingKeys.has(item.key)) {
					matchingKeys.add(item.key);
				}
				changed = true;
			}
		});
		if (changed) {
			cachedResultsMap = null;
			emitter.emit("change");
		}
	});

	const unwatchUpdate = store.on("update", (data) => {
		let changed = false;
		data.forEach((item) => {
			if (predicate(item.value)) {
				if (!matchingKeys.has(item.key)) {
					matchingKeys.add(item.key);
				}
				changed = true;
			} else if (matchingKeys.has(item.key)) {
				matchingKeys.delete(item.key);
				changed = true;
			}
		});
		if (changed) {
			cachedResultsMap = null;
			emitter.emit("change");
		}
	});

	const unwatchDelete = store.on("delete", (data) => {
		let changed = false;
		data.forEach((item) => {
			if (matchingKeys.has(item.key)) {
				matchingKeys.delete(item.key);
				changed = true;
			}
		});
		if (changed) {
			cachedResultsMap = null;
			emitter.emit("change");
		}
	});

	unwatchers.add(unwatchPut);
	unwatchers.add(unwatchUpdate);
	unwatchers.add(unwatchDelete);

	return {
		results(): Map<string, TValue> {
			// Return cached map if valid
			if (cachedResultsMap !== null) {
				return cachedResultsMap;
			}

			// Build new map from store values for matching keys
			const resultMap = new Map<string, TValue>();
			const storeValues = store.values();

			for (const { key, value } of storeValues) {
				if (matchingKeys.has(key)) {
					resultMap.set(key, value);
				}
			}

			cachedResultsMap = resultMap;
			return resultMap;
		},

		dispose() {
			emitter.off("change");
			for (const unwatch of unwatchers) {
				unwatch();
			}
		},

		onChange(callback: () => void) {
			emitter.on("change", callback);

			return () => {
				emitter.off("change", callback);
			};
		},
	};
};

type Query<T extends object> = ReturnType<typeof createQuery<T>>;

export { createQuery };
export type { QueryEvents, Query };
