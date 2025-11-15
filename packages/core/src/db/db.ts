import {
	addEventstamps,
	decodeResource,
	deleteResource,
	mergeResources,
	type ResourceObject,
} from "../crdt/resource";
import { Clock } from "../shared/clock";
import type {
	DBConfig,
	Driver,
	DriverState,
	SchemaInput,
	SchemaOutput,
	TypeConfigs,
} from "./types";
import { validate } from "./validation";

/**
 * Type for a single collection's CRUD operations.
 */
type Collection<T extends TypeConfigs, K extends keyof T & string> = {
	add(data: Partial<SchemaInput<T[K]["schema"]>>): Promise<string>;
	update(
		id: string,
		partial: Partial<SchemaOutput<T[K]["schema"]>> & Record<string, unknown>,
	): Promise<void>;
	get(id: string): Promise<SchemaOutput<T[K]["schema"]> | null>;
	getAll(): Promise<Array<readonly [string, SchemaOutput<T[K]["schema"]>]>>;
	remove(id: string): Promise<void>;
};

/**
 * Type for the proxied DB with collection properties.
 */
type DBCollections<Types extends TypeConfigs> = {
	[K in keyof Types & string]: Collection<Types, K>;
};

type DBState<Types extends TypeConfigs> = {
	driver: Driver;
	types: Types;
	clock: Clock;
	cache: Map<string, Map<string, ResourceObject>>;
	initialized: boolean;
};

type DBInternal<Types extends TypeConfigs> = {
	init(): Promise<void>;
	dispose(): Promise<void>;
	merge(resource: ResourceObject): Promise<void>;
	hasType(typeName: string): typeName is keyof Types & string;
	createCollectionProxy<K extends keyof Types & string>(
		typeName: K,
	): Collection<Types, K>;
};

/**
 * Internal DB runtime built with a functional core and imperative shell.
 */
const createDBImplementation = <Types extends TypeConfigs>(
	config: DBConfig<Types>,
): DBInternal<Types> => {
	const state: DBState<Types> = {
		driver: config.driver,
		types: config.types,
		clock: new Clock(),
		cache: new Map(),
		initialized: false,
	};

	return {
		init: () => initDB(state),
		dispose: () => disposeDB(state),
		merge: (resource) => mergeResource(state, resource),
		hasType: (typeName): typeName is keyof Types & string =>
			hasTypeConfig(state.types, typeName),
		createCollectionProxy: <K extends keyof Types & string>(typeName: K) =>
			buildCollectionProxy(state, typeName),
	};
};

const buildCollectionProxy = <
	Types extends TypeConfigs,
	K extends keyof Types & string,
>(
	state: DBState<Types>,
	typeName: K,
): Collection<Types, K> => ({
	add: (data) => addResource(state, typeName, data),
	update: (id, partial) => updateResource(state, typeName, id, partial),
	get: (id) => getResource(state, typeName, id),
	getAll: () => getAllResources(state, typeName),
	remove: (id) => removeResource(state, typeName, id),
});

const initDB = async <Types extends TypeConfigs>(
	state: DBState<Types>,
): Promise<void> => {
	if (state.initialized) {
		throw new Error("DB already initialized");
	}

	if (state.driver.init) {
		await state.driver.init();
	}

	const snapshot = await state.driver.load();
	hydrateCache(state, snapshot);

	state.initialized = true;
};

const disposeDB = async <Types extends TypeConfigs>(
	state: DBState<Types>,
): Promise<void> => {
	if (!state.initialized) {
		return;
	}

	if (state.driver.dispose) {
		await state.driver.dispose();
	}

	state.cache.clear();
	state.initialized = false;
};

const mergeResource = async <Types extends TypeConfigs>(
	state: DBState<Types>,
	resource: ResourceObject,
): Promise<void> => {
	const typeCache = ensureTypeCache(state.cache, resource.type);
	const current = typeCache.get(resource.id);
	const merged = current ? mergeResources(current, resource) : resource;

	forwardClock(state.clock, merged);

	const typeConfig = state.types[resource.type];
	if (typeConfig && !merged.meta["~deletedAt"]) {
		const decoded = decodeResource(merged).data;
		await validate(typeConfig.schema, decoded);
	}

	typeCache.set(resource.id, merged);
	await persistCache(state);
};

const addResource = async <
	Types extends TypeConfigs,
	K extends keyof Types & string,
>(
	state: DBState<Types>,
	typeName: K,
	data: Partial<SchemaInput<Types[K]["schema"]>>,
): Promise<string> => {
	const typeConfig = requireTypeConfig(state.types, typeName);
	type SchemaType = Types[K]["schema"];
	const validated = await validate<SchemaOutput<SchemaType>>(
		typeConfig.schema,
		data,
	);
	const id = typeConfig.getId(validated);
	const typeCache = ensureTypeCache(state.cache, typeName);
	const eventstamp = state.clock.now();
	const [attributes, events] = addEventstamps(validated, eventstamp);
	const resource: ResourceObject = {
		type: typeName,
		id,
		attributes,
		meta: {
			"~eventstamps": events,
			"~deletedAt": null,
			"~eventstamp": eventstamp,
		},
	};

	typeCache.set(id, resource);
	await persistCache(state);
	return id;
};

const updateResource = async <
	Types extends TypeConfigs,
	K extends keyof Types & string,
>(
	state: DBState<Types>,
	typeName: K,
	id: string,
	partial: Partial<SchemaOutput<Types[K]["schema"]>> & Record<string, unknown>,
): Promise<void> => {
	const typeConfig = requireTypeConfig(state.types, typeName);
	type SchemaType = Types[K]["schema"];
	type ResourceType = SchemaOutput<SchemaType>;
	const typeCache = getTypeCache(state.cache, typeName);
	const current = typeCache?.get(id);

	if (!typeCache || !current || current.meta["~deletedAt"]) {
		throw new Error(`Resource "${typeName}:${id}" not found`);
	}

	forwardClock(state.clock, current);

	const currentData = decodeResource<ResourceType>(current).data;
	const merged = {
		...(currentData as Record<string, unknown>),
		...(partial as Record<string, unknown>),
	} as ResourceType;

	await validate(typeConfig.schema, merged);

	const eventstamp = state.clock.now();
	const [partialAttrs, partialEvents] = addEventstamps(partial, eventstamp);
	const partialResource: ResourceObject = {
		type: typeName,
		id,
		attributes: partialAttrs,
		meta: {
			"~eventstamps": partialEvents,
			"~deletedAt": null,
			"~eventstamp": eventstamp,
		},
	};

	const updated = mergeResources(current, partialResource);
	typeCache.set(id, updated);
	await persistCache(state);
};

const getResource = async <
	Types extends TypeConfigs,
	K extends keyof Types & string,
>(
	state: DBState<Types>,
	typeName: K,
	id: string,
): Promise<SchemaOutput<Types[K]["schema"]> | null> => {
	type SchemaType = Types[K]["schema"];
	type ResourceType = SchemaOutput<SchemaType>;
	const typeCache = getTypeCache(state.cache, typeName);
	const resource = typeCache?.get(id);

	if (!resource || resource.meta["~deletedAt"]) {
		return null;
	}

	return decodeResource<ResourceType>(resource).data;
};

const getAllResources = async <
	Types extends TypeConfigs,
	K extends keyof Types & string,
>(
	state: DBState<Types>,
	typeName: K,
): Promise<Array<readonly [string, SchemaOutput<Types[K]["schema"]>]>> => {
	type SchemaType = Types[K]["schema"];
	type ResourceType = SchemaOutput<SchemaType>;
	const results: Array<readonly [string, ResourceType]> = [];
	const typeCache = getTypeCache(state.cache, typeName);

	if (!typeCache) {
		return results;
	}

	for (const [resourceId, resource] of typeCache.entries()) {
		if (resource.meta["~deletedAt"]) {
			continue;
		}
		const decoded = decodeResource<ResourceType>(resource).data;
		results.push([resourceId, decoded]);
	}

	return results;
};

const removeResource = async <
	Types extends TypeConfigs,
	K extends keyof Types & string,
>(
	state: DBState<Types>,
	typeName: K,
	id: string,
): Promise<void> => {
	const typeCache = getTypeCache(state.cache, typeName);
	const current = typeCache?.get(id);

	if (!typeCache || !current) {
		return;
	}

	forwardClock(state.clock, current);

	const eventstamp = state.clock.now();
	const deleted = deleteResource(current, eventstamp);
	typeCache.set(id, deleted);
	await persistCache(state);
};

const requireTypeConfig = <
	Types extends TypeConfigs,
	K extends keyof Types & string,
>(
	types: Types,
	typeName: K,
): Types[K] => {
	if (!hasTypeConfig(types, typeName)) {
		throw new Error(`Type "${typeName}" not found`);
	}
	return types[typeName];
};

function getTypeCache(
	cache: Map<string, Map<string, ResourceObject>>,
	typeName: string,
): Map<string, ResourceObject> | undefined {
	return cache.get(typeName);
}

function ensureTypeCache(
	cache: Map<string, Map<string, ResourceObject>>,
	typeName: string,
): Map<string, ResourceObject> {
	let bucket = cache.get(typeName);
	if (!bucket) {
		bucket = new Map();
		cache.set(typeName, bucket);
	}
	return bucket;
}

const hydrateCache = <Types extends TypeConfigs>(
	state: DBState<Types>,
	snapshot: DriverState,
): void => {
	state.cache.clear();
	for (const document of Object.values(snapshot)) {
		state.clock.forward(document.meta["~eventstamp"]);
		for (const resource of document.data) {
			const typeCache = ensureTypeCache(state.cache, resource.type);
			typeCache.set(resource.id, resource);
			forwardClock(state.clock, resource);
		}
	}
};

const serializeCache = (
	cache: Map<string, Map<string, ResourceObject>>,
	clock: Clock,
): DriverState => {
	const documents: DriverState = {};
	const maxByType: Record<string, string> = {};

	for (const [type, typeCache] of cache.entries()) {
		for (const resource of typeCache.values()) {
			if (!documents[type]) {
				documents[type] = {
					data: [],
					meta: { "~eventstamp": "" },
				};
			}
			const document = documents[type];
			document.data.push(resource);
			const resourceEventstamp = resource.meta["~eventstamp"];
			const currentMax = maxByType[type] ?? "";
			if (resourceEventstamp && resourceEventstamp > currentMax) {
				maxByType[type] = resourceEventstamp;
			}
		}
	}

	const fallbackEventstamp = clock.latest();
	for (const [type, document] of Object.entries(documents)) {
		const maxEventstamp = maxByType[type] || fallbackEventstamp;
		document.meta["~eventstamp"] = maxEventstamp;
	}

	return documents;
};

const persistCache = async <Types extends TypeConfigs>(
	state: DBState<Types>,
): Promise<void> => {
	await state.driver.persist(serializeCache(state.cache, state.clock));
};

const forwardClock = (clock: Clock, resource: ResourceObject): void => {
	const eventstamp = resource.meta["~eventstamp"];
	if (eventstamp) {
		clock.forward(eventstamp);
	}
};

const hasTypeConfig = <Types extends TypeConfigs>(
	types: Types,
	typeName: string,
): typeName is keyof Types & string => Object.hasOwn(types, typeName);

/**
 * Main DB interface combining collections and DB-level methods.
 */
export type DB<Types extends TypeConfigs> = DBCollections<Types> & {
	init(): Promise<void>;
	dispose(): Promise<void>;
	merge(resource: ResourceObject): Promise<void>;
};

/**
 * Create a type-safe database with schema validation and async persistence.
 *
 * @template Types - Record of resource type names to their configs
 * @param config - Database configuration with driver and type schemas
 * @returns DB instance with type-safe collection properties
 *
 * @example
 * ```ts
 * const db = createDB({
 *   driver: createMemoryDriver(),
 *   types: {
 *     task: {
 *       schema: taskSchema,
 *       getId: (task) => task.id,
 *     },
 *   },
 * });
 *
 * await db.init();
 *
 * const id = await db.task.add({ title: "Learn Standard Schema" });
 * const task = await db.task.get(id);
 * ```
 */
export function createDB<Types extends TypeConfigs>(
	config: DBConfig<Types>,
): DB<Types> {
	const impl = createDBImplementation(config);

	return new Proxy(impl, {
		get(target, prop: string | symbol) {
			if (prop === "init" || prop === "dispose" || prop === "merge") {
				return (target[prop as keyof typeof target] as Function).bind(target);
			}

			if (typeof prop === "string" && target.hasType(prop)) {
				return target.createCollectionProxy(prop as keyof Types & string);
			}

			return undefined;
		},
	}) as DB<Types>;
}
