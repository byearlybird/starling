import { createResourceMap } from "../store/resource-map";
import { createCollection } from "./collection";
import {
	emitMutations as emitMutationsFn,
	executeDisposeHooks,
	executeInitHooks,
} from "./plugin-manager";
import type {
	Collection,
	Collections,
	DB,
	DBBase,
	DBConfig,
	DBPlugin,
	DBPluginAPI,
	DBPluginHooks,
	DBSchema,
	InferSchemaOutput,
} from "./types";

/**
 * Create a multi-collection database with StandardSchema validation.
 *
 * The DB follows a functional core, imperative shell design:
 * - **Functional core**: Validation, merge logic, and plugin orchestration
 * - **Imperative shell**: Collection state management and DB orchestration
 *
 * @template TSchema - The schema definition for all collections
 *
 * @example
 * ```ts
 * import { createDB } from '@byearlybird/starling/db';
 *
 * const db = await createDB({
 *   schema: {
 *     task: {
 *       schema: taskSchema,
 *       getId: (task) => task.id,
 *     },
 *     user: {
 *       schema: userSchema,
 *       getId: (user) => user.id,
 *     },
 *   },
 * })
 * .use(unstoragePlugin())
 * .init();
 *
 * // Add, update, get, remove
 * const id = await db.task.add({ title: 'Learn Starling' });
 * await db.task.update(id, { completed: true });
 * const task = db.task.get(id);
 * const allTasks = db.task.getAll();
 * await db.task.remove(id);
 * ```
 */
export function createDB<TSchema extends DBSchema>(
	config: DBConfig<TSchema>,
): DB<TSchema> {
	// Storage for all collections (imperative shell state)
	const collections = new Map<
		keyof TSchema,
		ReturnType<typeof createResourceMap>
	>();

	// Initialize resource maps for each collection
	for (const collectionName in config.schema) {
		if (!Object.hasOwn(config.schema, collectionName)) continue;
		collections.set(
			collectionName,
			createResourceMap(new Map(), collectionName),
		);
	}

	// Plugin hook handlers
	const onInitHandlers: Array<
		NonNullable<DBPluginHooks<TSchema>["onInit"]>
	> = [];
	const onDisposeHandlers: Array<
		NonNullable<DBPluginHooks<TSchema>["onDispose"]>
	> = [];
	const onAddHandlers: Array<NonNullable<DBPluginHooks<TSchema>["onAdd"]>> =
		[];
	const onUpdateHandlers: Array<
		NonNullable<DBPluginHooks<TSchema>["onUpdate"]>
	> = [];
	const onDeleteHandlers: Array<
		NonNullable<DBPluginHooks<TSchema>["onDelete"]>
	> = [];

	function emitMutations<K extends keyof TSchema>(
		collectionName: K,
		addEntries: ReadonlyArray<
			readonly [string, InferSchemaOutput<TSchema[K]["schema"]>]
		>,
		updateEntries: ReadonlyArray<
			readonly [string, InferSchemaOutput<TSchema[K]["schema"]>]
		>,
		deleteKeys: ReadonlyArray<string>,
	): void {
		emitMutationsFn(
			onAddHandlers,
			onUpdateHandlers,
			onDeleteHandlers,
			collectionName,
			addEntries,
			updateEntries,
			deleteKeys,
		);
	}

	// Create collection instances (imperative shell)
	const collectionInstances: Partial<Collections<TSchema>> = {};
	for (const collectionName in config.schema) {
		if (!Object.hasOwn(config.schema, collectionName)) continue;

		const collectionConfig = config.schema[collectionName];

		// Create collection with getters/setters for the resource map
		// This allows collections to always access the current state
		collectionInstances[collectionName] = createCollection(
			collectionName,
			collectionConfig,
			() => {
				const map = collections.get(collectionName);
				if (!map) {
					throw new Error(`Collection "${String(collectionName)}" not found`);
				}
				return map;
			},
			(map) => collections.set(collectionName, map),
			(addEntries, updateEntries, deleteKeys) =>
				emitMutations(collectionName, addEntries, updateEntries, deleteKeys),
		) as Collection<InferSchemaOutput<(typeof config.schema)[typeof collectionName]["schema"]>>;
	}

	function getCollectionNames(): Array<keyof TSchema> {
		return Object.keys(config.schema);
	}

	// Create base DB (imperative shell API)
	const baseDB: DBBase<TSchema> = {
		...collectionInstances,
		getCollectionNames,
	} as DBBase<TSchema>;

	// Plugin API
	function use<TNewMethods extends Record<string, any>>(
		plugin: DBPlugin<TSchema, TNewMethods>,
	): DB<TSchema, TNewMethods> {
		// Register hooks
		if (plugin.hooks?.onInit) onInitHandlers.push(plugin.hooks.onInit);
		if (plugin.hooks?.onDispose) onDisposeHandlers.push(plugin.hooks.onDispose);
		if (plugin.hooks?.onAdd) onAddHandlers.push(plugin.hooks.onAdd);
		if (plugin.hooks?.onUpdate) onUpdateHandlers.push(plugin.hooks.onUpdate);
		if (plugin.hooks?.onDelete) onDeleteHandlers.push(plugin.hooks.onDelete);

		// Attach methods
		if (plugin.methods) {
			const methods = plugin.methods(baseDB);

			// Check for conflicts
			for (const key of Object.keys(methods)) {
				if (key in fullDB) {
					throw new Error(
						`Plugin method "${key}" conflicts with existing DB method or plugin`,
					);
				}
			}

			Object.assign(fullDB, methods);
		}

		return fullDB as DB<TSchema, TNewMethods>;
	}

	async function init(): Promise<DB<TSchema>> {
		await executeInitHooks(onInitHandlers, baseDB);
		return fullDB;
	}

	async function dispose(): Promise<void> {
		await executeDisposeHooks(onDisposeHandlers);

		onInitHandlers.length = 0;
		onDisposeHandlers.length = 0;
		onAddHandlers.length = 0;
		onUpdateHandlers.length = 0;
		onDeleteHandlers.length = 0;
	}

	const pluginAPI: DBPluginAPI<TSchema> = {
		use,
		init,
		dispose,
	};

	// Combine base DB and plugin API
	const fullDB = { ...baseDB, ...pluginAPI } as DB<TSchema>;

	return fullDB;
}
