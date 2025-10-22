import mitt from "mitt";
import type { Store } from "./store-v3";
import { mapToArray } from "./utils";

type QueryEvents = {
	change: undefined;
};

const createQuery = <TValue extends object>(
	store: Store<TValue>,
	predicate: (data: TValue) => boolean,
) => {
	const results = new Map<string, TValue>();
	const unwatchers = new Set<() => void>();
	const emitter = mitt<QueryEvents>();

	// Run predicate for initial results
	store.values().forEach(({ key, value }) => {
		if (predicate(value)) {
			results.set(key, value);
		}
	});

	// Register listeners
	const unwatchPut = store.on("put", (data) => {
		let changed = false;
		data.forEach((item) => {
			if (predicate(item.value)) {
				results.set(item.key, item.value);
				changed = true;
			}
		});
		if (changed) emitter.emit("change");
	});

	const unwatchUpdate = store.on("update", (data) => {
		let changed = false;
		data.forEach((item) => {
			if (predicate(item.value)) {
				results.set(item.key, item.value);
				changed = true;
			} else if (results.has(item.key)) {
				results.delete(item.key);
				changed = true;
			}
		});
		if (changed) emitter.emit("change");
	});

	const unwatchDelete = store.on("delete", (data) => {
		let changed = false;
		data.forEach((item) => {
			if (results.has(item.key)) {
				changed = true;
				results.delete(item.key);
			}
		});
		if (changed) emitter.emit("change");
	});

	unwatchers.add(unwatchPut);
	unwatchers.add(unwatchUpdate);
	unwatchers.add(unwatchDelete);

	return {
		results() {
			return mapToArray(results);
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
