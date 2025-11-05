import { Clock } from "./clock";
import type { Collection, EncodedDocument } from "./crdt";
import {
	decodeDoc,
	deleteDoc,
	encodeDoc,
	mergeCollections,
	mergeDocs,
} from "./crdt";

type NotPromise<T> = T extends Promise<any> ? never : T;

type DeepPartial<T> = T extends object
	? { [P in keyof T]?: DeepPartial<T[P]> }
	: T;

export type StoreAddOptions = {
	withId?: string;
};

export type StoreConfig = {
	getId?: () => string;
};

export type StoreSetTransaction<T> = {
	add: (value: T, options?: StoreAddOptions) => string;
	update: (key: string, value: DeepPartial<T>) => void;
	merge: (doc: EncodedDocument) => void;
	del: (key: string) => void;
	get: (key: string) => T | null;
	rollback: () => void;
};

export type Plugin<T> = {
	onInit: (store: Store<T>) => Promise<void> | void;
	onDispose: () => Promise<void> | void;
	onAdd?: (entries: ReadonlyArray<readonly [string, T]>) => void;
	onUpdate?: (entries: ReadonlyArray<readonly [string, T]>) => void;
	onDelete?: (keys: ReadonlyArray<string>) => void;
};

export type QueryConfig<T, U = T> = {
	where: (data: T) => boolean;
	select?: (data: T) => U;
	order?: (a: U, b: U) => number;
};

export type Query<U> = {
	results: () => Array<readonly [string, U]>;
	onChange: (callback: () => void) => () => void;
	dispose: () => void;
};

type QueryInternal<T, U> = {
	where: (data: T) => boolean;
	select?: (data: T) => U;
	order?: (a: U, b: U) => number;
	results: Map<string, U>;
	callbacks: Set<() => void>;
};

export class Store<T> {
	#readMap = new Map<string, EncodedDocument>();
	#clock = new Clock();
	#getId: () => string;

	#onInitHandlers: Array<Plugin<T>["onInit"]> = [];
	#onDisposeHandlers: Array<Plugin<T>["onDispose"]> = [];
	#onAddHandlers: Array<NonNullable<Plugin<T>["onAdd"]>> = [];
	#onUpdateHandlers: Array<NonNullable<Plugin<T>["onUpdate"]>> = [];
	#onDeleteHandlers: Array<NonNullable<Plugin<T>["onDelete"]>> = [];

	#queries = new Set<QueryInternal<T, any>>();

	constructor(config: StoreConfig = {}) {
		this.#getId = config.getId ?? (() => crypto.randomUUID());
	}

	get(key: string): T | null {
		return this.#decodeActive(this.#readMap.get(key) ?? null);
	}

	entries(): IterableIterator<readonly [string, T]> {
		const self = this;
		function* iterator() {
			for (const [key, doc] of self.#readMap.entries()) {
				const data = self.#decodeActive(doc);
				if (data !== null) {
					yield [key, data] as const;
				}
			}
		}

		return iterator();
	}

	collection(): Collection {
		return {
			"~docs": Array.from(this.#readMap.values()),
			"~eventstamp": this.#clock.latest(),
		};
	}

	merge(collection: Collection): void {
		const currentCollection = this.collection();
		const result = mergeCollections(currentCollection, collection);

		this.#clock.forward(result.collection["~eventstamp"]);
		this.#readMap = new Map(
			result.collection["~docs"].map((doc) => [doc["~id"], doc]),
		);

		const addEntries = Array.from(result.changes.added.entries()).map(
			([key, doc]) => [key, decodeDoc<T>(doc)["~data"]] as const,
		);
		const updateEntries = Array.from(result.changes.updated.entries()).map(
			([key, doc]) => [key, decodeDoc<T>(doc)["~data"]] as const,
		);
		const deleteKeys = Array.from(result.changes.deleted);

		if (
			addEntries.length > 0 ||
			updateEntries.length > 0 ||
			deleteKeys.length > 0
		) {
			this.#emitMutations(addEntries, updateEntries, deleteKeys);
		}
	}

	begin<R = void>(
		callback: (tx: StoreSetTransaction<T>) => NotPromise<R>,
		opts?: { silent?: boolean },
	): NotPromise<R> {
		const silent = opts?.silent ?? false;

		const addEntries: Array<readonly [string, T]> = [];
		const updateEntries: Array<readonly [string, T]> = [];
		const deleteKeys: Array<string> = [];

		const staging = new Map(this.#readMap);
		let rolledBack = false;

		const tx: StoreSetTransaction<T> = {
			add: (value, options) => {
				const key = options?.withId ?? this.#getId();
				staging.set(key, this.#encodeValue(key, value));
				addEntries.push([key, value] as const);
				return key;
			},
			update: (key, value) => {
				const doc = encodeDoc(key, value as T, this.#clock.now());
				const prev = staging.get(key);
				const mergedDoc = prev ? mergeDocs(prev, doc)[0] : doc;
				staging.set(key, mergedDoc);
				const merged = this.#decodeActive(mergedDoc);
				if (merged !== null) {
					updateEntries.push([key, merged] as const);
				}
			},
			merge: (doc) => {
				const existing = staging.get(doc["~id"]);
				const mergedDoc = existing ? mergeDocs(existing, doc)[0] : doc;
				staging.set(doc["~id"], mergedDoc);

				const decoded = this.#decodeActive(mergedDoc);
				const isNew = !this.#readMap.has(doc["~id"]);

				if (mergedDoc["~deletedAt"]) {
					deleteKeys.push(doc["~id"]);
				} else if (decoded !== null) {
					if (isNew) {
						addEntries.push([doc["~id"], decoded] as const);
					} else {
						updateEntries.push([doc["~id"], decoded] as const);
					}
				}
			},
			del: (key) => {
				const currentDoc = staging.get(key);
				if (!currentDoc) return;

				staging.set(key, deleteDoc(currentDoc, this.#clock.now()));
				deleteKeys.push(key);
			},
			get: (key) => this.#decodeActive(staging.get(key) ?? null),
			rollback: () => {
				rolledBack = true;
			},
		};

		const result = callback(tx);

		if (!rolledBack) {
			this.#readMap = staging;
			if (!silent) {
				this.#emitMutations(addEntries, updateEntries, deleteKeys);
			}
		}

		return result as NotPromise<R>;
	}

	add(value: T, options?: StoreAddOptions): string {
		return this.begin((tx) => tx.add(value, options));
	}

	update(key: string, value: DeepPartial<T>): void {
		this.begin((tx) => tx.update(key, value));
	}

	del(key: string): void {
		this.begin((tx) => tx.del(key));
	}

	use(plugin: Plugin<T>): this {
		this.#onInitHandlers.push(plugin.onInit);
		this.#onDisposeHandlers.push(plugin.onDispose);
		if (plugin.onAdd) this.#onAddHandlers.push(plugin.onAdd);
		if (plugin.onUpdate) this.#onUpdateHandlers.push(plugin.onUpdate);
		if (plugin.onDelete) this.#onDeleteHandlers.push(plugin.onDelete);
		return this;
	}

	async init(): Promise<this> {
		for (const hook of this.#onInitHandlers) {
			await hook(this);
		}

		for (const query of this.#queries) {
			this.#hydrateQuery(query);
		}

		return this;
	}

	async dispose(): Promise<void> {
		for (let i = this.#onDisposeHandlers.length - 1; i >= 0; i--) {
			await this.#onDisposeHandlers[i]?.();
		}

		for (const query of this.#queries) {
			query.callbacks.clear();
			query.results.clear();
		}

		this.#queries.clear();

		this.#onInitHandlers = [];
		this.#onDisposeHandlers = [];
		this.#onAddHandlers = [];
		this.#onUpdateHandlers = [];
		this.#onDeleteHandlers = [];
	}

	query<U = T>(config: QueryConfig<T, U>): Query<U> {
		const query: QueryInternal<T, U> = {
			where: config.where,
			select: config.select,
			order: config.order,
			results: new Map(),
			callbacks: new Set(),
		};

		this.#queries.add(query);
		this.#hydrateQuery(query);

		return {
			results: () => {
				if (query.order) {
					return Array.from(query.results).sort(([, a], [, b]) =>
						// biome-ignore lint/style/noNonNullAssertion: <guard above>
						query.order!(a, b),
					);
				}
				return Array.from(query.results);
			},
			onChange: (callback: () => void) => {
				query.callbacks.add(callback);
				return () => {
					query.callbacks.delete(callback);
				};
			},
			dispose: () => {
				this.#queries.delete(query);
				query.callbacks.clear();
				query.results.clear();
			},
		};
	}

	#encodeValue(key: string, value: T): EncodedDocument {
		return encodeDoc(key, value, this.#clock.now());
	}

	#decodeActive(doc: EncodedDocument | null): T | null {
		if (!doc || doc["~deletedAt"]) return null;
		return decodeDoc<T>(doc)["~data"];
	}

	#emitMutations(
		addEntries: ReadonlyArray<readonly [string, T]>,
		updateEntries: ReadonlyArray<readonly [string, T]>,
		deleteKeys: ReadonlyArray<string>,
	): void {
		this.#notifyQueries(addEntries, updateEntries, deleteKeys);

		if (addEntries.length > 0) {
			for (const handler of this.#onAddHandlers) {
				handler(addEntries);
			}
		}
		if (updateEntries.length > 0) {
			for (const handler of this.#onUpdateHandlers) {
				handler(updateEntries);
			}
		}
		if (deleteKeys.length > 0) {
			for (const handler of this.#onDeleteHandlers) {
				handler(deleteKeys);
			}
		}
	}

	#notifyQueries(
		addEntries: ReadonlyArray<readonly [string, T]>,
		updateEntries: ReadonlyArray<readonly [string, T]>,
		deleteKeys: ReadonlyArray<string>,
	): void {
		if (this.#queries.size === 0) return;
		const dirtyQueries = new Set<QueryInternal<T, any>>();

		if (addEntries.length > 0) {
			for (const [key, value] of addEntries) {
				for (const query of this.#queries) {
					if (query.where(value)) {
						const selected = this.#selectValue(query, value);
						query.results.set(key, selected);
						dirtyQueries.add(query);
					}
				}
			}
		}

		if (updateEntries.length > 0) {
			for (const [key, value] of updateEntries) {
				for (const query of this.#queries) {
					const matches = query.where(value);
					const inResults = query.results.has(key);

					if (matches && !inResults) {
						const selected = this.#selectValue(query, value);
						query.results.set(key, selected);
						dirtyQueries.add(query);
					} else if (!matches && inResults) {
						query.results.delete(key);
						dirtyQueries.add(query);
					} else if (matches && inResults) {
						const selected = this.#selectValue(query, value);
						query.results.set(key, selected);
						dirtyQueries.add(query);
					}
				}
			}
		}

		if (deleteKeys.length > 0) {
			for (const key of deleteKeys) {
				for (const query of this.#queries) {
					if (query.results.delete(key)) {
						dirtyQueries.add(query);
					}
				}
			}
		}

		if (dirtyQueries.size > 0) {
			this.#runQueryCallbacks(dirtyQueries);
		}
	}

	#runQueryCallbacks(dirtyQueries: Set<QueryInternal<T, any>>): void {
		for (const query of dirtyQueries) {
			for (const callback of query.callbacks) {
				callback();
			}
		}
	}

	#hydrateQuery(query: QueryInternal<T, any>): void {
		query.results.clear();
		for (const [key, value] of this.entries()) {
			if (query.where(value)) {
				const selected = this.#selectValue(query, value);
				query.results.set(key, selected);
			}
		}
	}

	#selectValue<U>(query: QueryInternal<T, U>, value: T): U {
		return query.select ? query.select(value) : (value as unknown as U);
	}
}
