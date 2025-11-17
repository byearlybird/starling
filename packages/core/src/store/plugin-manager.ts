import type { AnyObject } from "../document";
import type {
	LifecycleEvents,
	MutationEvents,
	StoreBase,
} from "./store";

/**
 * Execute all plugin onInit hooks sequentially.
 * @param hooks - Array of onInit handlers
 * @param collectionKey - Collection identifier
 * @param store - Store instance to pass to hooks
 */
export async function executeInitHooks<T extends AnyObject>(
	hooks: Array<NonNullable<LifecycleEvents<T>["onInit"]>>,
	collectionKey: string,
	store: StoreBase<T>,
): Promise<void> {
	for (const hook of hooks) {
		await hook(collectionKey, store);
	}
}

/**
 * Execute all plugin onDispose hooks sequentially in reverse order.
 * @param hooks - Array of onDispose handlers
 * @param collectionKey - Collection identifier
 */
export async function executeDisposeHooks<T extends AnyObject>(
	hooks: Array<NonNullable<LifecycleEvents<T>["onDispose"]>>,
	collectionKey: string,
): Promise<void> {
	for (let i = hooks.length - 1; i >= 0; i--) {
		await hooks[i]?.(collectionKey);
	}
}

/**
 * Emit mutation events to all registered plugin handlers.
 * @param onAddHandlers - Handlers for add events
 * @param onUpdateHandlers - Handlers for update events
 * @param onDeleteHandlers - Handlers for delete events
 * @param collectionKey - Collection identifier
 * @param addEntries - Documents that were added
 * @param updateEntries - Documents that were updated
 * @param deleteKeys - Document IDs that were deleted
 */
export function emitMutations<T extends AnyObject>(
	onAddHandlers: Array<NonNullable<MutationEvents<T>["onAdd"]>>,
	onUpdateHandlers: Array<NonNullable<MutationEvents<T>["onUpdate"]>>,
	onDeleteHandlers: Array<NonNullable<MutationEvents<T>["onDelete"]>>,
	collectionKey: string,
	addEntries: ReadonlyArray<readonly [string, T]>,
	updateEntries: ReadonlyArray<readonly [string, T]>,
	deleteKeys: ReadonlyArray<string>,
): void {
	if (addEntries.length > 0) {
		for (const handler of onAddHandlers) {
			handler(collectionKey, addEntries);
		}
	}
	if (updateEntries.length > 0) {
		for (const handler of onUpdateHandlers) {
			handler(collectionKey, updateEntries);
		}
	}
	if (deleteKeys.length > 0) {
		for (const handler of onDeleteHandlers) {
			handler(collectionKey, deleteKeys);
		}
	}
}
