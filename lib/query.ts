import mitt from "mitt";
import type { Store } from "./store";

type Events<T> = {
	init: Map<string, T>;
	updated: Map<string, T>;
};

export function query<T extends object>(
	store: Store<T>,
	predicate: (data: T) => boolean,
) {
	let init = false;
	const results = new Map<string, T>();
	const emitter_ = mitt<Events<T>>();

	const initialize = async () => {
		const data = await store.values();
		results.clear();
		for (const [key, value] of Object.entries(data)) {
			if (predicate(value)) {
				results.set(key, value);
			}
		}

		init = true;
		emitter_.emit("init", results);
	};

	const disposeInsert = store.onInsert((items) => {
		if (!init) return;

		let changed = false;
		for (const item of items) {
			if (predicate(item.value)) {
				results.set(item.key, item.value);
				changed = true;
			}
		}

		if (changed) emitter_.emit("updated", results);
	});

	const disposeUpdate = store.onUpdate((items) => {
		if (!init) return;

		let changed = false;
		for (const item of items) {
			if (!results.has(item.key)) continue;

			if (predicate(item.value)) {
				results.set(item.key, item.value);
			} else {
				results.delete(item.key);
			}

			changed = true;
		}

		if (changed) emitter_.emit("updated", results);
	});

	const dispose = () => {
		disposeInsert();
		disposeUpdate();
	};

	return {
		initialize,
		dispose,
		onInit(callback: (results: Map<string, T>) => void) {
			emitter_.on("init", callback);
			return () => emitter_.off("init", callback);
		},
		onUpdate(callback: (results: Map<string, T>) => void) {
			emitter_.on("updated", callback);
			return () => emitter_.off("updated", callback);
		},
	};
}
