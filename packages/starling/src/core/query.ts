import type { Emitter as BaseEmitter } from "mitt";
import mitt from "mitt";
import type { Store } from "./store";

type Events<T> = {
	init: Record<string, T>;
	change: Record<string, T>;
};

type Emitter<T> = BaseEmitter<Events<T>>;

type HandleInsertFn<T> = (items: { key: string; value: T }[]) => void;

type HandleUpdateFn<T> = (items: { key: string; value: T }[]) => void;

export type Query<T extends object> = {
	initialize(): Promise<void>;
	on<K extends keyof Events<T>>(
		event: K,
		callback: (results: Events<T>[K]) => void,
	): () => void;
	dispose(): void;
};

export function createQuery<T extends object>(
	store: Store<T>,
	predicate: (data: T) => boolean,
) {
	const results = new Map<string, T>();
	const emitter = mitt<Events<T>>();
	let loaded = false;
	let loading = false;
	const pendingOps = new Map<string, T>();

	const handleInsert = createHandleInsert(
		results,
		emitter,
		predicate,
		() => loaded,
		() => loading,
		pendingOps,
	);
	const handleUpdate = createHandleUpdate(
		results,
		emitter,
		predicate,
		() => loaded,
		() => loading,
		pendingOps,
	);

	const unwatchUpdate = store.on("update", handleUpdate);
	const unwatchInsert = store.on("insert", handleInsert);

	async function load() {
		// Prevent concurrent load calls
		if (loading) return Object.fromEntries(results);

		loading = true;

		// Load snapshot from store
		const data = await store.values();
		results.clear();
		for (const [key, value] of Object.entries(data)) {
			if (predicate(value)) {
				results.set(key, value);
			}
		}

		// Process any operations that arrived during load
		for (const [key, value] of pendingOps.entries()) {
			if (predicate(value)) {
				results.set(key, value);
			} else if (results.has(key)) {
				results.delete(key);
			}
		}
		pendingOps.clear();

		// Mark as loaded and emit init event
		loading = false;
		loaded = true;
		const resultsObj = Object.fromEntries(results);
		emitter.emit("init", resultsObj);
		return resultsObj;
	}

	function on<K extends keyof Events<T>>(
		event: K,
		callback: (results: Events<T>[K]) => void,
	) {
		emitter.on(event, callback);
		return () => emitter.off(event, callback);
	}

	function dispose() {
		unwatchInsert();
		unwatchUpdate();
		emitter.off("init");
		emitter.off("change");
	}

	return {
		load,
		on,
		dispose,
	};
}

function createHandleInsert<T extends object>(
	results: Map<string, T>,
	emitter: Emitter<T>,
	predicate: (data: T) => boolean,
	isLoaded: () => boolean,
	isLoading: () => boolean,
	pendingOps: Map<string, T>,
): HandleInsertFn<T> {
	return (items: { key: string; value: T }[]) => {
		// Queue operations that arrive during load
		if (isLoading() && !isLoaded()) {
			for (const item of items) {
				pendingOps.set(item.key, item.value);
			}
			return;
		}

		if (!isLoaded()) return;

		let changed = false;
		for (const item of items) {
			if (predicate(item.value)) {
				results.set(item.key, item.value);
				changed = true;
			}
		}

		if (changed) emitter.emit("change", Object.fromEntries(results));
	};
}

function createHandleUpdate<T extends object>(
	results: Map<string, T>,
	emitter: Emitter<T>,
	predicate: (data: T) => boolean,
	isLoaded: () => boolean,
	isLoading: () => boolean,
	pendingOps: Map<string, T>,
): HandleUpdateFn<T> {
	return (items: { key: string; value: T }[]) => {
		// Queue operations that arrive during load
		if (isLoading() && !isLoaded()) {
			for (const item of items) {
				pendingOps.set(item.key, item.value);
			}
			return;
		}

		if (!isLoaded()) return;

		let changed = false;
		for (const item of items) {
			if (predicate(item.value)) {
				results.set(item.key, item.value);
				changed = true;
			} else if (results.has(item.key)) {
				results.delete(item.key);
				changed = true;
			}
		}

		if (changed) emitter.emit("change", Object.fromEntries(results));
	};
}
