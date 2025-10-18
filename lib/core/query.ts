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
	let initialized = false;
	let eventBuffer: Array<{
		type: "insert" | "update";
		items: { key: string; value: T }[];
	}> = [];
	const results = new Map<string, T>();
	const emitter = mitt<Events<T>>();

	const handleInsert = createHandleInsert(
		results,
		emitter,
		predicate,
		() => initialized,
		eventBuffer,
	);
	const handleUpdate = createHandleUpdate(
		results,
		emitter,
		predicate,
		() => initialized,
		eventBuffer,
	);
	const unwatchUpdate = store.on("update", handleUpdate);
	const unwatchInsert = store.on("insert", handleInsert);

	async function initialize() {
		if (initialized) return;
		const data = await store.values();
		results.clear();
		for (const [key, value] of Object.entries(data)) {
			if (predicate(value)) {
				results.set(key, value);
			}
		}

		initialized = true;

		// Replay buffered events that occurred during initialization
		for (const event of eventBuffer) {
			if (event.type === "insert") {
				handleInsert(event.items);
			} else if (event.type === "update") {
				handleUpdate(event.items);
			}
		}
		eventBuffer = [];

		emitter.emit("init", Object.fromEntries(results));
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
		initialize,
		on,
		dispose,
	};
}

function createHandleInsert<T extends object>(
	results: Map<string, T>,
	emitter: Emitter<T>,
	predicate: (data: T) => boolean,
	getInitialized: () => boolean,
	eventBuffer: Array<{
		type: "insert" | "update";
		items: { key: string; value: T }[];
	}>,
): HandleInsertFn<T> {
	return (items: { key: string; value: T }[]) => {
		if (!getInitialized()) {
			eventBuffer.push({ type: "insert", items });
			return;
		}

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
	getInitialized: () => boolean,
	eventBuffer: Array<{
		type: "insert" | "update";
		items: { key: string; value: T }[];
	}>,
): HandleUpdateFn<T> {
	return (items: { key: string; value: T }[]) => {
		if (!getInitialized()) {
			eventBuffer.push({ type: "update", items });
			return;
		}

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
