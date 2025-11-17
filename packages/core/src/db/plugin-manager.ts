import type { DBBase, DBPluginHooks, DBSchema, InferSchemaOutput } from "./types";

/**
 * Execute all plugin onInit hooks sequentially.
 * @param hooks - Array of onInit handlers
 * @param db - DB instance to pass to hooks
 */
export async function executeInitHooks<TSchema extends DBSchema>(
	hooks: Array<NonNullable<DBPluginHooks<TSchema>["onInit"]>>,
	db: DBBase<TSchema>,
): Promise<void> {
	for (const hook of hooks) {
		await hook(db);
	}
}

/**
 * Execute all plugin onDispose hooks sequentially in reverse order.
 * @param hooks - Array of onDispose handlers
 */
export async function executeDisposeHooks<TSchema extends DBSchema>(
	hooks: Array<NonNullable<DBPluginHooks<TSchema>["onDispose"]>>,
): Promise<void> {
	for (let i = hooks.length - 1; i >= 0; i--) {
		await hooks[i]?.();
	}
}

/**
 * Emit mutation events to all registered plugin handlers.
 * @param onAddHandlers - Handlers for add events
 * @param onUpdateHandlers - Handlers for update events
 * @param onDeleteHandlers - Handlers for delete events
 * @param collectionName - Name of the collection
 * @param addEntries - Documents that were added
 * @param updateEntries - Documents that were updated
 * @param deleteKeys - Document IDs that were deleted
 */
export function emitMutations<TSchema extends DBSchema, K extends keyof TSchema>(
	onAddHandlers: Array<NonNullable<DBPluginHooks<TSchema>["onAdd"]>>,
	onUpdateHandlers: Array<NonNullable<DBPluginHooks<TSchema>["onUpdate"]>>,
	onDeleteHandlers: Array<NonNullable<DBPluginHooks<TSchema>["onDelete"]>>,
	collectionName: K,
	addEntries: ReadonlyArray<
		readonly [string, InferSchemaOutput<TSchema[K]["schema"]>]
	>,
	updateEntries: ReadonlyArray<
		readonly [string, InferSchemaOutput<TSchema[K]["schema"]>]
	>,
	deleteKeys: ReadonlyArray<string>,
): void {
	if (addEntries.length > 0) {
		for (const handler of onAddHandlers) {
			handler(collectionName, addEntries);
		}
	}
	if (updateEntries.length > 0) {
		for (const handler of onUpdateHandlers) {
			handler(collectionName, updateEntries);
		}
	}
	if (deleteKeys.length > 0) {
		for (const handler of onDeleteHandlers) {
			handler(collectionName, deleteKeys);
		}
	}
}
